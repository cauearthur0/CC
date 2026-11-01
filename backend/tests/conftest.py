import os
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "backend"))


@pytest.fixture(autouse=True)
def ambiente(tmp_path, monkeypatch):
    """Cada teste roda com banco, arquivos e configuração isolados."""
    from checa import db, storage
    from checa.config import recarregar_config
    from checa.llm import prompts

    monkeypatch.setenv("DADOS_DIR", str(tmp_path / "dados"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'dados' / 'teste.db'}")
    monkeypatch.setenv("FILA", "inline")
    monkeypatch.setenv("LLM_PROVEDOR", "simulado")
    monkeypatch.setenv("PROMPTS_DIR", str(RAIZ / "prompts"))
    monkeypatch.setenv("OCR_THREADS", "2")
    monkeypatch.setenv("RATE_LIMIT_UPLOADS_POR_HORA", "100")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    recarregar_config()
    db.redefinir_engine()
    storage.redefinir_armazenamento()
    prompts.carregar.cache_clear()
    prompts.versao.cache_clear()
    yield
    db.redefinir_engine()
    storage.redefinir_armazenamento()


def pytest_collection_modifyitems(config, items):
    if os.environ.get("ANTHROPIC_API_KEY_ACEITACAO"):
        return
    pular = pytest.mark.skip(reason="defina ANTHROPIC_API_KEY_ACEITACAO e as fixtures para rodar")
    for item in items:
        if "aceitacao" in item.keywords:
            item.add_marker(pular)
