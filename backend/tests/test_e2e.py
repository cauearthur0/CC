"""Ponta a ponta: vídeo sintético de 10 s (ffmpeg) com legenda conhecida → relatório.

Usa o OCR e o ffmpeg de verdade; o modelo e o Whisper são substituídos por versões
simuladas (sem rede), então o teste roda em qualquer máquina com ffmpeg e tesseract.
"""

import json

import pytest

from checa.media.audio import Palavra, ResultadoAudio, SegmentoFala
from checa.media.ocr import detectar_faixa, detectar_modo, rodar_ocr
from checa.media.probe import sha256_arquivo, sondar
from checa.texto import similaridade

from .sintetico import ffmpeg_disponivel, gerar_video_legendado

FRASES = [
    (0.5, 3.0, "eles querem te impedir de falar"),
    (3.5, 6.5, "o decreto saiu em maio de 2026"),
    (7.0, 9.6, "compartilhe antes que apaguem!"),
]

pytestmark = pytest.mark.skipif(not ffmpeg_disponivel(), reason="ffmpeg não instalado")


@pytest.fixture
def video_palavra(tmp_path):
    return gerar_video_legendado(
        tmp_path / "sintetico.mp4", FRASES, titulo="URGENTE: saiu o decreto", com_audio=True
    )


def _sem_whisper(video, tem_audio):
    return ResultadoAudio("indisponivel", [], detalhe="Whisper desligado no teste.")


def _fala_de_teste(video, tem_audio):
    """Fala "transcrita" que confere com a 1ª frase e diverge da 2ª."""
    def seg(ini, fim, texto):
        ps = texto.split()
        passo = (fim - ini) / len(ps)
        return SegmentoFala(ini, fim, texto, 0.9,
                            [Palavra(ini + i * passo, ini + (i + 1) * passo, p) for i, p in enumerate(ps)])
    return ResultadoAudio("fala", [
        seg(0.5, 3.0, "eles querem te impedir de falar"),
        seg(3.5, 6.5, "a portaria foi publicada no ano passado"),
    ], modelo="teste")


def test_ocr_reconstroi_legenda_palavra_por_palavra(video_palavra):
    info = sondar(video_palavra)
    assert 9.5 <= info.duracao <= 10.5 and info.tem_audio
    faixa = detectar_faixa(video_palavra, info)
    assert faixa is not None
    assert faixa.y <= int(854 * 0.70) <= faixa.y + faixa.altura
    modo, taxa = detectar_modo(video_palavra, info, faixa)
    assert modo == "palavra", taxa

    r = rodar_ocr(video_palavra, info)
    textos = [lg.texto for lg in r.legendas]
    for _, _, frase in FRASES:
        melhor = max((similaridade(t, frase) for t in textos), default=0)
        assert melhor >= 0.9, (frase, textos)
    assert len(r.legendas) <= 5, textos  # sem fragmentos soltos de cada palavra
    assert r.cru, "OCR cru precisa ficar guardado para auditoria"
    assert any("URGENTE" in t.texto.upper() for t in r.texto_tela), [t.texto for t in r.texto_tela]


def test_legenda_em_bloco(tmp_path):
    v = gerar_video_legendado(tmp_path / "bloco.mp4", FRASES, palavra_por_palavra=False)
    info = sondar(v)
    faixa = detectar_faixa(v, info)
    modo, _ = detectar_modo(v, info, faixa)
    assert modo == "bloco"
    r = rodar_ocr(v, info)
    assert [round(similaridade(lg.texto, f[2]), 1) >= 0.9 for lg, f in zip(r.legendas, FRASES)] == [True] * 3


def _criar_checagem(video_path):
    from checa.db import Checagem, Video, sessao
    from checa.media.probe import sondar
    from checa.pipeline import prefixo_video
    from checa.storage import armazenamento

    info = sondar(video_path)
    sha = sha256_arquivo(video_path)
    chave = f"{prefixo_video(sha)}/original.mp4"
    armazenamento().salvar_arquivo(chave, video_path)
    with sessao() as s:
        v = Video(sha256=sha, chave_arquivo=chave, duracao=info.duracao, largura=info.largura,
                  altura=info.altura, fps=info.fps, tem_audio=info.tem_audio, tamanho_bytes=1)
        s.add(v)
        s.commit()
        s.refresh(v)
        ch = Checagem(video_id=v.id)
        s.add(ch)
        s.commit()
        return ch.id


def test_pipeline_completo_gera_relatorio(video_palavra):
    from checa.db import Alegacao, Checagem, sessao, select
    from checa.llm.simulado import ClienteSimulado
    from checa.pipeline import processar_checagem

    cid = _criar_checagem(video_palavra)
    processar_checagem(cid, cliente=ClienteSimulado(), transcritor=_sem_whisper)
    with sessao() as s:
        ch = s.get(Checagem, cid)
        assert ch.status == "concluida", ch.erro_msg
        rel = json.loads(ch.relatorio_json)
        n_alegs = len(s.exec(select(Alegacao).where(Alegacao.checagem_id == cid)).all())
    assert rel["simulado"] is True
    assert rel["ocr"]["modo"] == "palavra"
    assert len(rel["alegacoes"]) >= 2 and n_alegs == len(rel["alegacoes"])
    citacoes = " | ".join(a["citacao"] for a in rel["alegacoes"])
    assert "impedir de falar" in citacoes
    est = rel["estatisticas"]
    assert est["checaveis"] + est["nao_checaveis"] + est["nao_verificadas"] == est["total"]
    assert any("transcrição de áudio não estava disponível" in x for x in rel["limitacoes"])
    for a in rel["alegacoes"]:
        if a["status"] == "verificada":
            assert a["fontes"], "fontes simuladas devem passar pelo filtro de URLs vistas"
    assert any(t["origem"] == "tela" for t in rel["transcricao"])


def test_pipeline_marca_divergencia_legenda_fala(video_palavra):
    from checa.db import Checagem, sessao
    from checa.llm.simulado import ClienteSimulado
    from checa.pipeline import processar_checagem

    cid = _criar_checagem(video_palavra)
    processar_checagem(cid, cliente=ClienteSimulado(), transcritor=_fala_de_teste)
    with sessao() as s:
        rel = json.loads(s.get(Checagem, cid).relatorio_json)
    falas = [t for t in rel["transcricao"] if t["origem"] == "fala"]
    assert falas[0]["legenda_confere"] is True
    assert falas[1]["divergencia"] is True
    assert any("legenda e a fala não batem" in x for x in rel["limitacoes"])


def test_conteudo_ilegal_e_descartado(video_palavra, monkeypatch):
    from checa.db import Checagem, Video, sessao, select
    from checa.llm.simulado import ClienteSimulado
    from checa.pipeline import processar_checagem
    from checa.storage import armazenamento

    class Moderador(ClienteSimulado):
        def _extrair(self, texto):
            d = super()._extrair(texto)
            d["moderacao"] = {"conteudo_ilegal": True, "motivo": "conteúdo ilegal"}
            d["alegacoes"] = []
            return d

    cid = _criar_checagem(video_palavra)
    with sessao() as s:
        sha = s.exec(select(Video)).first().sha256
    processar_checagem(cid, cliente=Moderador(), transcritor=_sem_whisper)
    with sessao() as s:
        ch = s.get(Checagem, cid)
        assert ch.status == "rejeitada" and ch.video_id is None and ch.relatorio_json == ""
        assert s.exec(select(Video)).first() is None
    assert not armazenamento().existe(f"videos/{sha}/original.mp4")
    assert not armazenamento().existe(f"videos/{sha}/ocr.json")


def test_orcamento_com_checagem_em_paralelo(tmp_path, monkeypatch):
    """6 alegações checáveis a US$ 0,30 cada, teto de US$ 1: só as 3 mais importantes são checadas."""
    from checa.config import recarregar_config
    from checa.db import Checagem, sessao
    from checa.llm.simulado import ClienteSimulado
    from checa.pipeline import processar_checagem

    class Caro(ClienteSimulado):
        simulado = False  # liga o controle de orçamento

        def criar(self, **kw):
            r = super().criar(**kw)
            if kw["etapa"] == "verify":
                r.uso.entrada, r.uso.saida = 0, 15_000  # 15 mil tokens de saída no Opus = US$ 0,30
            return r

    monkeypatch.setenv("ORCAMENTO_USD_POR_CHECAGEM", "1.0")
    monkeypatch.setenv("CUSTO_ESTIMADO_POR_ALEGACAO_USD", "0.25")
    monkeypatch.setenv("VERIFICACAO_PARALELA", "3")
    recarregar_config()
    frases = [(0.5 + 2 * i, 2.2 + 2 * i, f) for i, f in enumerate([
        "o decreto saiu em maio", "a multa chega a dez por cento", "o relator era do PCdoB",
        "isso tudo foi combinado antes", "o julgamento acabou em junho", "foram oito votos a tres",
        "a ANPD fiscaliza as plataformas"])]
    v = gerar_video_legendado(tmp_path / "orcamento.mp4", frases, duracao=15.0, palavra_por_palavra=False)
    cid = _criar_checagem(v)
    processar_checagem(cid, cliente=Caro(), transcritor=_sem_whisper)
    with sessao() as s:
        rel = json.loads(s.get(Checagem, cid).relatorio_json)
    checaveis = [a for a in rel["alegacoes"] if a["checavel"]]
    assert len(checaveis) == 6
    verificadas = [a for a in checaveis if a["status"] == "verificada"]
    assert len(verificadas) == 3
    assert verificadas[0]["importancia"] == 3  # a mais importante entra primeiro
    pulada = next(a for a in checaveis if a["status"] == "nao_verificada")
    assert "limite de custo" in pulada["nota"]
    assert rel["estatisticas"]["nao_verificadas"] == 3
    assert rel["custo"]["por_etapa"]["checagem"]["usd"] == pytest.approx(0.90)
    assert any("não foram verificadas" in x for x in rel["limitacoes"])
