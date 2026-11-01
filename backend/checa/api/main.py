"""API HTTP (FastAPI). Fica atrás do proxy do frontend (/api/*); a chave da IA só existe aqui."""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from sqlmodel import col, select

from ..config import config
from ..db import Checagem, HistoricoSessao, Video, agora, engine, iso, sessao
from ..exportar import gerar_card, gerar_pdf
from ..fila import enfileirar
from ..media.probe import VideoInvalido, sondar, validar
from ..pipeline import ETAPAS, prefixo_video
from ..relatorio import AVISO, TIPOS_ALEGACAO, VEREDITOS, markdown
from ..storage import armazenamento
from .ratelimit import Limitador

log = logging.getLogger(__name__)
COOKIE = "cv_sessao"

@asynccontextmanager
async def _ciclo_de_vida(_app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    engine()
    yield


app = FastAPI(
    title="Checa Vídeo API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
    lifespan=_ciclo_de_vida,
)
_limitador: Limitador | None = None


def limitador() -> Limitador:
    global _limitador
    if _limitador is None:
        _limitador = Limitador(config().rate_limit_uploads_por_hora, 3600)
    return _limitador


@app.middleware("http")
async def _cookie_sessao(request: Request, call_next):
    nova = None
    if not request.cookies.get(COOKIE):
        nova = secrets.token_urlsafe(18)
        request.state.sessao = nova
    else:
        request.state.sessao = request.cookies[COOKIE]
    resposta = await call_next(request)
    if nova:
        resposta.set_cookie(COOKIE, nova, max_age=365 * 86400, httponly=True, samesite="lax",
                            secure=config().url_publica.startswith("https"))
    return resposta


def _ip(request: Request) -> str:
    if config().confiar_x_forwarded_for:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "?"


def _quer_html(request: Request) -> bool:
    """Formulário enviado sem JavaScript: respondemos com redirecionamento, não JSON."""
    return "text/html" in request.headers.get("accept", "") and request.headers.get("x-requested-with") is None


def _erro(request: Request, status: int, msg: str):
    if _quer_html(request):
        return RedirectResponse(f"/?erro={quote(msg)}", status_code=303)
    return JSONResponse({"erro": msg}, status_code=status)


def _url_relatorio(checagem_id: str) -> str:
    return f"{config().url_publica.rstrip('/')}/checagem/{checagem_id}"


def _vincular_historico(sessao_id: str, checagem_id: str) -> None:
    with sessao() as s:
        ja = s.exec(
            select(HistoricoSessao).where(
                HistoricoSessao.sessao == sessao_id, HistoricoSessao.checagem_id == checagem_id
            )
        ).first()
        if not ja:
            s.add(HistoricoSessao(sessao=sessao_id, checagem_id=checagem_id))
            s.commit()


def _resposta_criacao(request: Request, checagem_id: str, reutilizado: bool, status: int = 201):
    if _quer_html(request):
        return RedirectResponse(f"/checagem/{checagem_id}", status_code=303)
    return JSONResponse({"id": checagem_id, "reutilizado": reutilizado}, status_code=status)


@app.get("/api/saude")
def saude():
    c = config()
    return {"ok": True, "fila": c.fila, "llm": c.llm_provedor, "whisper": c.whisper_modelo}


@app.post("/api/checagens")
async def criar_checagem(
    request: Request,
    arquivo: UploadFile = File(...),
    origem: str = Form(""),
    forcar: bool = Form(False),
):
    c = config()
    limite = c.max_upload_mb * 1024 * 1024
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > limite + 1024 * 1024:
        return _erro(request, 413, f"O arquivo passa de {c.max_upload_mb} MB.")
    ext = Path(arquivo.filename or "").suffix.lower().lstrip(".")
    if ext not in c.lista_formatos:
        return _erro(request, 400, "Formato não suportado. Envie um arquivo .mp4, .mov ou .webm.")
    if not limitador().permitir(_ip(request)):
        return _erro(request, 429, "Muitas checagens em pouco tempo. Tente de novo daqui a pouco.")

    tmp_dir = c.dados_dir / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp = tmp_dir / f"{uuid.uuid4().hex}.{ext}"
    h = hashlib.sha256()
    total = 0
    try:
        with open(tmp, "wb") as f:
            while bloco := await arquivo.read(1 << 20):
                total += len(bloco)
                if total > limite:
                    raise VideoInvalido(f"O arquivo passa de {c.max_upload_mb} MB.")
                h.update(bloco)
                f.write(bloco)
        if total == 0:
            raise VideoInvalido("O arquivo chegou vazio.")
        info = sondar(tmp)
        validar(info, c.max_duracao_s)
    except VideoInvalido as e:
        tmp.unlink(missing_ok=True)
        return _erro(request, 413 if "MB" in str(e) else 400, str(e))
    sha = h.hexdigest()
    sessao_id = request.state.sessao

    with sessao() as s:
        video = s.exec(select(Video).where(Video.sha256 == sha)).first()
        if video is not None:
            tmp.unlink(missing_ok=True)
            if not forcar:
                existente = s.exec(
                    select(Checagem)
                    .where(Checagem.video_id == video.id, col(Checagem.status).in_(["concluida", "fila", "processando"]))
                    .order_by(col(Checagem.criado_em).desc())
                ).first()
                if existente is not None:
                    _vincular_historico(sessao_id, existente.id)
                    return _resposta_criacao(request, existente.id, True, 200)
        else:
            chave = f"{prefixo_video(sha)}/original.{ext}"
            armazenamento().salvar_arquivo(chave, tmp)
            video = Video(
                sha256=sha, chave_arquivo=chave, nome_original=(arquivo.filename or "")[:200],
                duracao=info.duracao, largura=info.largura, altura=info.altura, fps=info.fps,
                tem_audio=info.tem_audio, tamanho_bytes=total,
            )
            s.add(video)
            s.commit()
            s.refresh(video)
        ch = Checagem(video_id=video.id, origem_informada=origem.strip()[:500])
        s.add(ch)
        s.commit()
        checagem_id = ch.id
    _vincular_historico(sessao_id, checagem_id)
    enfileirar(checagem_id)
    return _resposta_criacao(request, checagem_id, False)


def _carregar(checagem_id: str) -> tuple[Checagem, Video | None]:
    with sessao() as s:
        ch = s.get(Checagem, checagem_id)
        if ch is None:
            raise HTTPException(404, "Checagem não encontrada.")
        video = s.get(Video, ch.video_id) if ch.video_id else None
        return ch, video


def _relatorio(ch: Checagem) -> dict:
    if ch.status != "concluida" or not ch.relatorio_json:
        raise HTTPException(409, "O relatório ainda não está pronto.")
    return json.loads(ch.relatorio_json)


@app.get("/api/checagens/{checagem_id}")
def obter_checagem(checagem_id: str):
    ch, video = _carregar(checagem_id)
    corpo = {
        "id": ch.id,
        "status": ch.status,
        "etapa": ch.etapa,
        "etapa_detalhe": ch.etapa_detalhe,
        "progresso_atual": ch.progresso_atual,
        "progresso_total": ch.progresso_total,
        "n_alegacoes": ch.n_alegacoes,
        "erro_msg": ch.erro_msg,
        "titulo": ch.titulo,
        "criado_em": iso(ch.criado_em),
        "iniciado_em": iso(ch.iniciado_em),
        "concluido_em": iso(ch.concluido_em),
        "agora": iso(agora()),
        "etapas": [{"codigo": k, "nome": n} for k, n in ETAPAS],
        "video": {"duracao": video.duracao, "largura": video.largura, "altura": video.altura} if video else None,
        "url": _url_relatorio(ch.id),
        "definicoes": VEREDITOS,
        "tipos": TIPOS_ALEGACAO,
        "aviso": AVISO,
        "relatorio": json.loads(ch.relatorio_json) if ch.status == "concluida" and ch.relatorio_json else None,
    }
    return corpo


@app.post("/api/checagens/{checagem_id}/rechecar")
def rechecar(checagem_id: str, request: Request):
    ch, video = _carregar(checagem_id)
    if video is None:
        return _erro(request, 410, "O vídeo desta checagem não está mais armazenado.")
    if not limitador().permitir(_ip(request)):
        return _erro(request, 429, "Muitas checagens em pouco tempo. Tente de novo daqui a pouco.")
    with sessao() as s:
        nova = Checagem(video_id=video.id, origem_informada=ch.origem_informada)
        s.add(nova)
        s.commit()
        novo_id = nova.id
    _vincular_historico(request.state.sessao, novo_id)
    enfileirar(novo_id)
    return _resposta_criacao(request, novo_id, False)


def _tipo_video(caminho: Path) -> str:
    return {".mov": "video/quicktime", ".webm": "video/webm"}.get(caminho.suffix.lower(), "video/mp4")


@app.get("/api/checagens/{checagem_id}/video")
def video_checagem(checagem_id: str):
    _, video = _carregar(checagem_id)
    if video is None:
        raise HTTPException(410, "Vídeo não armazenado.")
    caminho = armazenamento().caminho_local(video.chave_arquivo)
    return FileResponse(caminho, media_type=_tipo_video(caminho))


@app.get("/api/checagens/{checagem_id}/thumb.jpg")
def miniatura(checagem_id: str):
    _, video = _carregar(checagem_id)
    if video is None:
        raise HTTPException(404)
    chave = f"{prefixo_video(video.sha256)}/thumb.jpg"
    if not armazenamento().existe(chave):
        raise HTTPException(404)
    return FileResponse(armazenamento().caminho_local(chave), media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/checagens/{checagem_id}/relatorio.md")
def exportar_md(checagem_id: str):
    ch, _ = _carregar(checagem_id)
    texto = markdown(_relatorio(ch), _url_relatorio(ch.id))
    return Response(texto, media_type="text/markdown; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="checagem-{ch.id}.md"'})


@app.get("/api/checagens/{checagem_id}/relatorio.pdf")
def exportar_pdf(checagem_id: str):
    ch, _ = _carregar(checagem_id)
    return Response(gerar_pdf(_relatorio(ch), _url_relatorio(ch.id)), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="checagem-{ch.id}.pdf"'})


@app.get("/api/checagens/{checagem_id}/card.png")
def exportar_card(checagem_id: str, baixar: bool = False):
    ch, _ = _carregar(checagem_id)
    cab = {"Cache-Control": "public, max-age=600"}
    if baixar:
        cab["Content-Disposition"] = f'attachment; filename="checagem-{ch.id}.png"'
    return Response(gerar_card(_relatorio(ch), _url_relatorio(ch.id)), media_type="image/png", headers=cab)


@app.get("/api/historico")
def historico(request: Request):
    sessao_id = request.state.sessao
    with sessao() as s:
        linhas = s.exec(
            select(HistoricoSessao, Checagem)
            .join(Checagem, Checagem.id == HistoricoSessao.checagem_id)
            .where(HistoricoSessao.sessao == sessao_id)
            .order_by(col(HistoricoSessao.criado_em).desc())
            .limit(100)
        ).all()
    itens = []
    for hist, ch in linhas:
        rel = json.loads(ch.relatorio_json) if ch.relatorio_json else None
        itens.append({
            "id": ch.id,
            "titulo": ch.titulo or (rel or {}).get("titulo") or "",
            "status": ch.status,
            "criado_em": iso(hist.criado_em),
            "simulado": ch.simulado,
            "duracao": (rel or {}).get("video", {}).get("duracao"),
            "estatisticas": (rel or {}).get("estatisticas"),
        })
    return {"itens": itens}


def limpar_tmp() -> None:
    shutil.rmtree(config().dados_dir / "tmp", ignore_errors=True)
