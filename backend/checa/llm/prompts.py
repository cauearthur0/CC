"""Carrega os system prompts versionados em prompts/*.md."""

from __future__ import annotations

import hashlib
from functools import lru_cache

from ..config import config

INCLUDE = "{{regras_editoriais}}"


@lru_cache
def carregar(nome: str) -> str:
    d = config().prompts_dir
    texto = (d / f"{nome}.md").read_text(encoding="utf-8")
    if INCLUDE in texto:
        texto = texto.replace(INCLUDE, (d / "regras_editoriais.md").read_text(encoding="utf-8"))
    return texto.strip()


@lru_cache
def versao(nome: str | None = None) -> str:
    """Hash curto dos prompts — entra no relatório e na chave do cache de vereditos."""
    nomes = [nome] if nome else ["extract", "verify", "synthesize"]
    h = hashlib.sha256()
    for n in nomes:
        h.update(carregar(n).encode())
    return h.hexdigest()[:10]
