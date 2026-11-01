"""Orquestração do pipeline de checagem (roda no worker)."""

from __future__ import annotations

import datetime as dt
import hashlib
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
import json
import logging
from dataclasses import asdict
from pathlib import Path

from .config import config
from .db import (
    Alegacao,
    CacheVerificacao,
    Checagem,
    Fonte,
    Video,
    agora,
    atualizar_checagem,
    iso,
    sessao,
    utc,
)
from .etapas.extrair import extrair_alegacoes
from .etapas.sintetizar import sintese_minima, sintetizar
from .etapas.verificar import ResultadoVerificacao, verificar_alegacao
from .llm import prompts
from .llm.cliente import ClienteLLM, RecusaModelo, criar_cliente
from .llm.custos import Contabilidade, Uso
from .llm.esquemas import AlegacaoExtraida, SaidaVerificacao
from .media.audio import Palavra, ResultadoAudio, SegmentoFala, Transcritor, transcrever_whisper
from .media.frames import ContactSheet, extrair_quadro, gerar_contact_sheets, gerar_miniatura
from .media.ocr import Faixa, Legenda, ResultadoOCR, rodar_ocr
from .media.probe import InfoVideo, sondar
from .relatorio import estatisticas, fontes_consolidadas, rotulo_confianca
from .storage import armazenamento
from .texto import hms, normalizar
from .transcricao import Trecho, para_texto, trecho_ao_redor, unificar

log = logging.getLogger(__name__)

ETAPAS = [
    ("lendo", "Lendo o vídeo"),
    ("quadros", "Extraindo quadros"),
    ("legendas", "Lendo legendas"),
    ("audio", "Transcrevendo áudio"),
    ("alegacoes", "Identificando alegações"),
    ("checando", "Checando alegações"),
    ("relatorio", "Montando relatório"),
]

RESERVA_SINTESE_USD = 0.12


class ConteudoRejeitado(Exception):
    pass


def prefixo_video(sha: str) -> str:
    return f"videos/{sha}"


# ------------------------------------------------------------------ cache de artefatos por vídeo


def _ler_json(chave: str):
    arm = armazenamento()
    return json.loads(arm.ler_bytes(chave)) if arm.existe(chave) else None


def _gravar_json(chave: str, dados) -> None:
    armazenamento().salvar_bytes(chave, json.dumps(dados, ensure_ascii=False, indent=1).encode())


def _ocr_de_json(d: dict) -> ResultadoOCR:
    faixa = Faixa(**{k: d["faixa"][k] for k in ("y", "altura", "persistencia")}) if d.get("faixa") else None
    return ResultadoOCR(
        d["modo"], faixa, d.get("taxa_mudanca", 0.0),
        [Legenda(**x) for x in d["legendas"]], [], [Legenda(**x) for x in d["texto_tela"]],
    )


def _audio_de_json(d: dict) -> ResultadoAudio:
    segs = [
        SegmentoFala(s["t_ini"], s["t_fim"], s["texto"], s["confianca"],
                     [Palavra(**p) for p in s.get("palavras", [])])
        for s in d["segmentos"]
    ]
    return ResultadoAudio(d["situacao"], segs, d.get("modelo", ""), d.get("detalhe", ""))


# ------------------------------------------------------------------ cache de vereditos


def chave_cache(alegacao: AlegacaoExtraida) -> str:
    c = config()
    base = "|".join([
        c.model_verify, prompts.versao("verify"), normalizar(alegacao.citacao),
        normalizar(alegacao.o_que_checar),
    ])
    return hashlib.sha256(base.encode()).hexdigest()


def ler_cache(chave: str) -> dict | None:
    dias = config().cache_vereditos_dias
    if dias <= 0:
        return None
    with sessao() as s:
        reg = s.get(CacheVerificacao, chave)
        if reg is None:
            return None
        if agora() - utc(reg.criado_em) > dt.timedelta(days=dias):
            s.delete(reg)
            s.commit()
            return None
        return json.loads(reg.resultado_json)


def gravar_cache(chave: str, r: ResultadoVerificacao) -> None:
    if config().cache_vereditos_dias <= 0:
        return
    with sessao() as s:
        s.merge(CacheVerificacao(
            chave=chave,
            resultado_json=json.dumps({"saida": r.saida.model_dump(), "notas": r.notas, "modelo": r.modelo},
                                      ensure_ascii=False),
            criado_em=agora(),
        ))
        s.commit()


# ------------------------------------------------------------------ limitações determinísticas


def limitacoes_tecnicas(audio: ResultadoAudio, ocr: ResultadoOCR, trechos: list[Trecho]) -> list[str]:
    lim: list[str] = []
    textos_audio = {
        "sem_audio": "O vídeo não tem áudio; a checagem usou só as legendas e os textos da tela.",
        "silencio": "O áudio está praticamente mudo; a checagem usou só as legendas e os textos da tela.",
        "sem_fala": "O áudio parece ser só música ou ruído; a fala não foi transcrita.",
        "indisponivel": "A transcrição de áudio não estava disponível nesta checagem; foram usadas só as "
                        "legendas e os textos da tela.",
    }
    if audio.situacao in textos_audio:
        lim.append(textos_audio[audio.situacao])
    if ocr.modo == "sem_legenda" and audio.situacao != "fala":
        lim.append("Não foi detectada legenda queimada no vídeo.")
    incertas = [lg for lg in ocr.legendas if lg.conf < 60]
    if incertas:
        faixas = ", ".join(f"{hms(x.t_ini)}–{hms(x.t_fim)}" for x in incertas[:4])
        lim.append(f"Leitura das legendas incerta em {len(incertas)} trecho(s) ({faixas}).")
    pouco_claros = [t for t in trechos if t.origem == "fala" and (t.confianca or 1) < 0.45]
    if pouco_claros:
        faixas = ", ".join(f"{hms(x.t_ini)}–{hms(x.t_fim)}" for x in pouco_claros[:4])
        lim.append(f"Áudio pouco claro em {len(pouco_claros)} trecho(s) ({faixas}).")
    diverg = [t for t in trechos if t.divergencia]
    if diverg:
        lim.append(f"Em {len(diverg)} trecho(s), a legenda e a fala não batem; os dois textos aparecem "
                   "na transcrição.")
    return lim


# ------------------------------------------------------------------ pipeline


def _etapa(checagem_id: str, etapa: str, detalhe: str = "", atual: int = 0, total: int = 0) -> None:
    atualizar_checagem(
        checagem_id, etapa=etapa, etapa_detalhe=detalhe, progresso_atual=atual, progresso_total=total
    )


def processar_checagem(
    checagem_id: str,
    cliente: ClienteLLM | None = None,
    transcritor: Transcritor | None = None,
    hoje: dt.date | None = None,
) -> None:
    c = config()
    arm = armazenamento()
    with sessao() as s:
        ch = s.get(Checagem, checagem_id)
        if ch is None:
            raise ValueError(f"checagem {checagem_id} não existe")
        video = s.get(Video, ch.video_id)
    if video is None:
        atualizar_checagem(checagem_id, status="erro", erro_msg="O vídeo desta checagem não existe mais.")
        return
    atualizar_checagem(checagem_id, status="processando", iniciado_em=agora(), erro_msg="")
    try:
        cliente = cliente or criar_cliente()
        _rodar(checagem_id, ch, video, cliente, transcritor or transcrever_whisper, hoje)
    except ConteudoRejeitado:
        # política mínima: rejeitar e não armazenar (apaga vídeo, artefatos e registro do vídeo)
        arm.apagar_prefixo(prefixo_video(video.sha256))
        with sessao() as s:
            v = s.get(Video, video.id)
            if v:
                s.delete(v)
            chg = s.get(Checagem, checagem_id)
            if chg:
                chg.video_id = None
                chg.status = "rejeitada"
                chg.etapa = "rejeitada"
                chg.erro_msg = "Este vídeo não pode ser processado. Ele foi descartado e não ficou armazenado."
                chg.relatorio_json = ""
                s.add(chg)
            s.commit()
    except RecusaModelo as e:
        log.exception("recusa do modelo")
        atualizar_checagem(checagem_id, status="erro", erro_msg=f"O modelo de IA recusou a tarefa ({e}).")
    except Exception as e:  # noqa: BLE001
        log.exception("falha na checagem %s", checagem_id)
        atualizar_checagem(checagem_id, status="erro", erro_msg=f"Falha ao processar: {e}"[:500])


def _rodar(
    checagem_id: str, ch: Checagem, video: Video, cliente: ClienteLLM,
    transcritor: Transcritor, hoje: dt.date | None,
) -> None:
    c = config()
    arm = armazenamento()
    pref = prefixo_video(video.sha256)
    caminho = arm.caminho_local(video.chave_arquivo)
    contab = Contabilidade()

    # 4.1 ---------------------------------------------------------------- ingestão
    _etapa(checagem_id, "lendo")
    info: InfoVideo = sondar(caminho)
    thumb = f"{pref}/thumb.jpg"
    if not arm.existe(thumb):
        gerar_miniatura(caminho, arm.caminho_local(thumb), info.duracao)

    # 4.2 ---------------------------------------------------------------- quadros
    _etapa(checagem_id, "quadros")
    dir_folhas = arm.caminho_local(f"{pref}/folhas")
    folhas_existentes = sorted(dir_folhas.glob("sheet_*.jpg")) if dir_folhas.exists() else []
    if folhas_existentes:
        from .media.frames import intervalo_contact_sheet

        iv = intervalo_contact_sheet(info.duracao)
        folhas = [ContactSheet(f, i * 12 * iv, min(info.duracao, (i + 1) * 12 * iv), iv)
                  for i, f in enumerate(folhas_existentes)]
    else:
        folhas = gerar_contact_sheets(caminho, dir_folhas, info.duracao)

    # 4.3 ---------------------------------------------------------------- legendas
    _etapa(checagem_id, "legendas")
    d = _ler_json(f"{pref}/ocr.json")
    if d:
        ocr = _ocr_de_json(d)
    else:
        ocr = rodar_ocr(caminho, info)
        _gravar_json(f"{pref}/ocr.json", ocr.dict())
        _gravar_json(f"{pref}/ocr_cru.json", ocr.cru)  # auditoria

    # 4.4 ---------------------------------------------------------------- áudio
    _etapa(checagem_id, "audio")
    d = _ler_json(f"{pref}/audio.json")
    if d and d.get("situacao") != "indisponivel":
        audio = _audio_de_json(d)
    else:
        audio = transcritor(caminho, info.tem_audio)
        _gravar_json(f"{pref}/audio.json", audio.dict())

    # 4.5 ---------------------------------------------------------------- transcrição unificada
    trechos = unificar(audio, ocr.legendas, ocr.texto_tela)
    transcricao_txt = para_texto(trechos)

    # 4.6 ---------------------------------------------------------------- alegações
    _etapa(checagem_id, "alegacoes")
    metadados = {
        "duracao_s": round(info.duracao, 1),
        "resolucao": f"{info.largura}x{info.altura}",
        "fps": round(info.fps, 2),
        "audio": {"situacao": audio.situacao, "detalhe": audio.detalhe},
        "legenda_queimada": {"modo": ocr.modo},
    }
    dir_quadros = arm.caminho_local(f"{pref}/quadros")

    def ver_quadro(t: float) -> Path:
        return extrair_quadro(caminho, t, dir_quadros / f"q_{t:08.2f}.jpg")

    extracao, uso, modelo_ext = extrair_alegacoes(
        cliente, metadados, transcricao_txt, folhas, ver_quadro, info.duracao
    )
    contab.registrar("extracao", modelo_ext if modelo_ext in _modelos() else c.model_extract, uso)
    if extracao.moderacao.conteudo_ilegal:
        raise ConteudoRejeitado(extracao.moderacao.motivo)
    alegs = extracao.alegacoes
    checaveis = [a for a in alegs if a.checavel]
    _etapa(checagem_id, "alegacoes", f"{len(alegs)} encontradas")
    atualizar_checagem(checagem_id, n_alegacoes=len(alegs))

    # 4.7 ---------------------------------------------------------------- checagem
    # Da mais importante para a menos importante, até VERIFICACAO_PARALELA ao mesmo tempo.
    # O orçamento reserva o custo estimado das checagens em andamento antes de iniciar outra.
    ordem = sorted(checaveis, key=lambda a: (-a.importancia, a.t_ini))
    pendentes = list(ordem)
    resultados: dict[int, dict] = {}
    custos_verif: list[float] = []
    descartadas_total = 0
    concluidas = 0
    total = len(ordem)
    em_andamento: dict[Future, tuple[AlegacaoExtraida, str]] = {}

    def progresso() -> None:
        k = min(total, concluidas + 1)
        _etapa(checagem_id, "checando", f"Checando alegação {k} de {total}", concluidas, total)

    def estimativa() -> float:
        return (sum(custos_verif) / len(custos_verif)) if custos_verif else c.custo_estimado_por_alegacao_usd

    progresso()
    with ThreadPoolExecutor(max_workers=max(1, c.verificacao_paralela)) as pool:
        while pendentes or em_andamento:
            while pendentes and len(em_andamento) < max(1, c.verificacao_paralela):
                a = pendentes.pop(0)
                chave = chave_cache(a)
                em_cache = ler_cache(chave)
                if em_cache:
                    saida = SaidaVerificacao.model_validate(em_cache["saida"])
                    saida.id = a.id
                    resultados[a.id] = {"saida": saida, "notas": em_cache.get("notas", []), "do_cache": True}
                    concluidas += 1
                    continue
                reservado = (len(em_andamento) + 1) * estimativa()
                if not cliente.simulado and (
                    contab.total_usd + reservado + RESERVA_SINTESE_USD > c.orcamento_usd_por_checagem
                ):
                    resultados[a.id] = {"nao_verificada": True,
                                        "nota": "Não verificada: limite de custo por checagem atingido."}
                    concluidas += 1
                    continue
                futuro = pool.submit(
                    verificar_alegacao, cliente, a, extracao.tese_central,
                    trecho_ao_redor(trechos, a.t_ini, a.t_fim), hoje,
                )
                em_andamento[futuro] = (a, chave)
            progresso()
            if not em_andamento:
                continue
            prontos, _ = wait(list(em_andamento), return_when=FIRST_COMPLETED)
            for futuro in prontos:
                a, chave = em_andamento.pop(futuro)
                concluidas += 1
                try:
                    r = futuro.result()
                except Exception as e:  # noqa: BLE001
                    log.error("falha ao checar alegação %s: %s", a.id, e, exc_info=e)
                    resultados[a.id] = {"nao_verificada": True,
                                        "nota": f"Não verificada: erro na checagem ({type(e).__name__})."}
                    continue
                custos_verif.append(contab.registrar("checagem", c.model_verify, r.uso))
                descartadas_total += len(r.fontes_descartadas)
                resultados[a.id] = {"saida": r.saida, "notas": r.notas, "do_cache": False}
                gravar_cache(chave, r)
    _etapa(checagem_id, "checando", f"{total} alegações checadas", total, total)

    # 4.8 ---------------------------------------------------------------- relatório
    _etapa(checagem_id, "relatorio")
    alegacoes_rel = _montar_alegacoes(alegs, resultados)
    est = estatisticas(alegacoes_rel)
    lim = limitacoes_tecnicas(audio, ocr, trechos)
    nao_verif = [a for a in alegacoes_rel if a.get("status") == "nao_verificada"]
    if nao_verif:
        lim.append(f"{len(nao_verif)} alegação(ões) checável(is) não foram verificadas "
                   f"({nao_verif[0].get('nota', '').removeprefix('Não verificada: ').rstrip('.')}).")
    if descartadas_total:
        lim.append(f"{descartadas_total} fonte(s) indicada(s) pela IA foram descartadas por não terem "
                   "sido abertas na busca.")
    if any(a.get("do_cache") for a in alegacoes_rel):
        lim.append("Parte dos vereditos foi reaproveitada de checagens recentes da mesma alegação.")
    contexto = {
        "descricao_video": extracao.descricao_video,
        "autor_ou_conta": extracao.autor_ou_conta,
        "tese_central": extracao.tese_central,
        "duracao_s": round(info.duracao, 1),
        "audio": audio.situacao,
        "divergencias_legenda_fala": sum(1 for t in trechos if t.divergencia),
    }
    resumo_alegs = [
        {k: a.get(k) for k in ("id", "t_ini", "citacao", "tipo", "veredito", "explicacao",
                                "o_que_e_verdade_por_tras", "importancia")}
        for a in alegacoes_rel
    ]
    est_modelo = {k: est[k] for k in ("total", "checaveis", "nao_checaveis", "por_veredito", "porcentagens", "frase")}
    try:
        sintese, uso_s, _ = sintetizar(cliente, contexto, resumo_alegs, est_modelo, lim)
        contab.registrar("sintese", c.model_synthesize, uso_s)
    except Exception:  # noqa: BLE001
        log.exception("falha na síntese")
        sintese = sintese_minima(est, extracao.tese_central)
    limitacoes = lim + [x for x in sintese.limitacoes if x not in lim]

    relatorio = {
        "versao": 1,
        "simulado": bool(cliente.simulado),
        "titulo": sintese.titulo,
        "checado_em": iso(agora()),
        "video": {**info.dict(), "sha256": video.sha256},
        "autor_ou_conta": extracao.autor_ou_conta,
        "descricao_video": extracao.descricao_video,
        "tese_central": extracao.tese_central,
        "resumo": sintese.resumo,
        "alegacoes": alegacoes_rel,
        "acertos": sintese.acertos,
        "estatisticas": est,
        "padrao_desinformacao": sintese.padrao_desinformacao,
        "limitacoes": limitacoes,
        "transcricao": [t.dict() for t in trechos],
        "fontes_consolidadas": fontes_consolidadas(alegacoes_rel),
        "ocr": {"modo": ocr.modo, "faixa": ocr.faixa.dict() if ocr.faixa else None,
                "taxa_mudanca": round(ocr.taxa_mudanca, 2)},
        "audio": {"situacao": audio.situacao, "modelo": audio.modelo, "detalhe": audio.detalhe},
        "custo": contab.dict(),
        "modelos": {"extracao": c.model_extract, "checagem": c.model_verify, "sintese": c.model_synthesize},
        "versao_prompts": prompts.versao(),
    }
    _persistir(checagem_id, relatorio)


def _modelos() -> set[str]:
    from .llm.custos import PRECOS

    return set(PRECOS)


def _montar_alegacoes(alegs: list[AlegacaoExtraida], resultados: dict[int, dict]) -> list[dict]:
    saida = []
    for a in alegs:
        base = a.model_dump()
        r = resultados.get(a.id)
        if not a.checavel:
            base.update(veredito="nao_checavel", status="nao_checavel", confianca=None,
                        explicacao="", o_que_e_verdade_por_tras="", fontes=[])
        elif r is None or r.get("nao_verificada"):
            base.update(veredito=None, status="nao_verificada", confianca=None, explicacao="",
                        o_que_e_verdade_por_tras="", fontes=[],
                        nota=(r or {}).get("nota", "Não verificada."))
        else:
            s: SaidaVerificacao = r["saida"]
            base.update(
                veredito=s.veredito,
                status="verificada",
                confianca=round(s.confianca, 2),
                explicacao=s.explicacao,
                o_que_e_verdade_por_tras=s.o_que_e_verdade_por_tras if s.veredito != "verdadeiro" else "",
                fontes=[f.model_dump() for f in s.fontes],
                nota=" ".join(r.get("notas", [])),
                do_cache=r.get("do_cache", False),
            )
        base["confianca_rotulo"] = rotulo_confianca(base.get("confianca"))
        saida.append(base)
    return saida


def _persistir(checagem_id: str, relatorio: dict) -> None:
    with sessao() as s:
        ch = s.get(Checagem, checagem_id)
        assert ch is not None
        for a in relatorio["alegacoes"]:
            reg = Alegacao(
                checagem_id=checagem_id, numero=a["id"], t_ini=a["t_ini"], t_fim=a["t_fim"],
                citacao=a["citacao"], tipo=a["tipo"], checavel=a["checavel"], veredito=a.get("veredito"),
                confianca=a.get("confianca"), explicacao=a.get("explicacao", ""),
                verdade_por_tras=a.get("o_que_e_verdade_por_tras", ""), importancia=a.get("importancia", 2),
            )
            s.add(reg)
            s.flush()
            for f in a.get("fontes", []):
                s.add(Fonte(alegacao_id=reg.id, titulo=f["titulo"], url=f["url"], tipo=f.get("tipo", ""),
                            trecho=f.get("trecho", "")))
        ch.relatorio_json = json.dumps(relatorio, ensure_ascii=False)
        ch.titulo = relatorio["titulo"]
        ch.custo_usd = relatorio["custo"]["total_usd"]
        ch.simulado = relatorio["simulado"]
        ch.status = "concluida"
        ch.etapa = "concluida"
        ch.etapa_detalhe = ""
        ch.concluido_em = agora()
        s.add(ch)
        s.commit()


__all__ = ["ETAPAS", "processar_checagem", "prefixo_video"]
