"""Testes de aceitação com os dois vídeos reais (§7 do spec).

Custam dinheiro (API da Anthropic + buscas) e precisam do Whisper. Rodam só com:

    ANTHROPIC_API_KEY_ACEITACAO=sk-ant-... make aceitacao

e com os arquivos fixtures/caso_a_lenin.mp4 e fixtures/caso_b_decretos.mp4.
"""

import json
import os
from pathlib import Path

import pytest

from .aceitacao import comparar

RAIZ = Path(__file__).resolve().parents[2]
GABARITOS = Path(__file__).parent / "gabaritos"


@pytest.mark.aceitacao
@pytest.mark.parametrize("caso", ["caso_a_lenin", "caso_b_decretos"])
def test_caso_real(caso, monkeypatch, tmp_path):
    gab = json.loads((GABARITOS / f"{caso}.json").read_text())
    video = RAIZ / gab["video"]
    if not video.exists():
        pytest.skip(f"fixture ausente: {video}")

    from checa.config import recarregar_config
    from checa.db import Checagem, Video, sessao
    from checa.media.probe import sha256_arquivo, sondar
    from checa.pipeline import prefixo_video, processar_checagem
    from checa.storage import armazenamento, redefinir_armazenamento

    monkeypatch.setenv("LLM_PROVEDOR", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", os.environ["ANTHROPIC_API_KEY_ACEITACAO"])
    monkeypatch.setenv("WHISPER_MODELO", os.environ.get("WHISPER_MODELO_ACEITACAO", "medium"))
    monkeypatch.setenv("ORCAMENTO_USD_POR_CHECAGEM", os.environ.get("ORCAMENTO_ACEITACAO", "5"))
    monkeypatch.setenv("CACHE_VEREDITOS_DIAS", "0")
    recarregar_config()
    redefinir_armazenamento()

    copia = tmp_path / video.name
    copia.write_bytes(video.read_bytes())
    info = sondar(copia)
    sha = sha256_arquivo(copia)
    chave = f"{prefixo_video(sha)}/original{copia.suffix}"
    armazenamento().salvar_arquivo(chave, copia)
    with sessao() as s:
        v = Video(sha256=sha, chave_arquivo=chave, duracao=info.duracao, largura=info.largura,
                  altura=info.altura, fps=info.fps, tem_audio=info.tem_audio, tamanho_bytes=1)
        s.add(v)
        s.commit()
        s.refresh(v)
        ch = Checagem(video_id=v.id)
        s.add(ch)
        s.commit()
        cid = ch.id

    processar_checagem(cid)
    with sessao() as s:
        ch = s.get(Checagem, cid)
    assert ch.status == "concluida", ch.erro_msg
    rel = json.loads(ch.relatorio_json)
    saida = RAIZ / "backend" / "dados" / f"aceitacao_{caso}.json"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(rel, ensure_ascii=False, indent=1))
    falhas = comparar(rel, gab)
    assert not falhas, "\n".join(falhas) + f"\n(relatório salvo em {saida}; custo US$ {rel['custo']['total_usd']})"
