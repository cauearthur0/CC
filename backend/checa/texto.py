"""Utilitários de texto compartilhados (normalização e similaridade)."""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

_NAO_PALAVRA = re.compile(r"[^\w\s%]", re.UNICODE)
_ESPACOS = re.compile(r"\s+")


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, sem pontuação, espaços colapsados."""
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = _NAO_PALAVRA.sub(" ", t).replace("_", " ")
    return _ESPACOS.sub(" ", t).strip()


def tokens(texto: str) -> list[str]:
    return normalizar(texto).split()


def similaridade(a: str | list[str], b: str | list[str]) -> float:
    sa = " ".join(a) if isinstance(a, list) else normalizar(a)
    sb = " ".join(b) if isinstance(b, list) else normalizar(b)
    if not sa and not sb:
        return 1.0
    return SequenceMatcher(None, sa, sb, autojunk=False).ratio()


PALAVRAS_VAZIAS = frozenset(
    "a o as os ao aos à às de do da dos das e é em no na nos nas num numa um uma uns umas que "
    "se por para pra pro com sem mas ou isso isto esse essa este esta aquele aquela ele ela eles "
    "elas eu tu voce voces nos vos seu sua seus suas meu minha lhe me te foi ser ter tem vai ja "
    "nao sim mais muito como quando onde qual quem tambem so ate entao".split()
)


def cobertura_tokens(origem: list[str], alvo: list[str], limiar: float = 0.75) -> float:
    """Fração dos tokens de conteúdo de `origem` com correspondente aproximado em `alvo`.

    Ignora palavras vazias ("o", "ao", "de"), que inflariam a coincidência entre frases
    diferentes. Tolerante a erro de OCR ("impedlr" ≈ "impedir").
    """
    conteudo = [t for t in origem if t not in PALAVRAS_VAZIAS]
    origem = conteudo or origem
    if not origem:
        return 0.0
    alvo_set = set(alvo)
    achados = 0
    for tok in origem:
        if tok in alvo_set:
            achados += 1
            continue
        if len(tok) <= 2:
            continue
        if any(
            abs(len(tok) - len(a)) <= 3 and SequenceMatcher(None, tok, a).ratio() >= limiar
            for a in alvo
        ):
            achados += 1
    return achados / len(origem)


def hms(segundos: float) -> str:
    s = max(0, int(round(segundos)))
    h, resto = divmod(s, 3600)
    m, s = divmod(resto, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"
