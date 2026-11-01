"""Extração tolerante de JSON das respostas do modelo."""

from __future__ import annotations

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

_CERCA = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


class JSONInvalido(Exception):
    def __init__(self, motivo: str, texto: str):
        super().__init__(motivo)
        self.motivo = motivo
        self.texto = texto


def _candidatos(texto: str) -> list[str]:
    t = texto.strip()
    cands = [t]
    cands += [m.group(1) for m in _CERCA.finditer(t)]
    # objetos balanceados de nível superior, do último para o primeiro
    objetos: list[str] = []
    profundidade, inicio, em_str, escape = 0, -1, False, False
    for i, ch in enumerate(t):
        if em_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                em_str = False
            continue
        if ch == '"':
            em_str = True
        elif ch == "{":
            if profundidade == 0:
                inicio = i
            profundidade += 1
        elif ch == "}" and profundidade > 0:
            profundidade -= 1
            if profundidade == 0 and inicio >= 0:
                objetos.append(t[inicio : i + 1])
    cands += sorted(objetos, key=len, reverse=True)
    return cands


def extrair_json(texto: str) -> dict:
    erro = "nenhum objeto JSON encontrado"
    for c in _candidatos(texto):
        try:
            valor = json.loads(c)
        except json.JSONDecodeError as e:
            erro = f"JSON malformado: {e.msg} (linha {e.lineno}, coluna {e.colno})"
            continue
        if isinstance(valor, dict):
            return valor
    raise JSONInvalido(erro, texto)


def validar_json(texto: str, modelo: type[T]) -> T:
    dados = extrair_json(texto)
    try:
        return modelo.model_validate(dados)
    except ValidationError as e:
        problemas = "; ".join(
            f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()[:8]
        )
        raise JSONInvalido(f"JSON fora do formato: {problemas}", texto) from e
