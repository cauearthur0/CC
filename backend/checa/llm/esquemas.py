"""Formatos de saída das 3 chamadas ao modelo (validação com Pydantic)."""

from __future__ import annotations

import copy
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TipoAlegacao = Literal["fato", "atribuicao_de_citacao", "opiniao", "previsao", "chamada_a_acao"]
Veredito = Literal["verdadeiro", "parcial", "enganoso", "falso", "sem_fonte", "nao_checavel"]
TipoFonte = Literal["primaria", "checagem", "imprensa", "academica"]

VEREDITOS_CHECAVEIS = ("verdadeiro", "parcial", "enganoso", "falso", "sem_fonte")


class AlegacaoExtraida(BaseModel):
    id: int
    t_ini: float
    t_fim: float
    citacao: str
    tipo: TipoAlegacao
    checavel: bool
    o_que_checar: str = ""
    importancia: int = Field(2, description="1 = detalhe, 2 = relevante, 3 = central para a tese")
    derivada_de: int = Field(0, description="id da previsão de onde esta alegação foi derivada; 0 se nenhuma")

    @field_validator("importancia")
    @classmethod
    def _imp(cls, v: int) -> int:
        return min(3, max(1, v))


class Moderacao(BaseModel):
    conteudo_ilegal: bool = False
    motivo: str = ""


class SaidaExtracao(BaseModel):
    descricao_video: str
    autor_ou_conta: str = ""
    tese_central: str
    alegacoes: list[AlegacaoExtraida]
    moderacao: Moderacao = Moderacao()


class Fonte(BaseModel):
    titulo: str
    url: str
    tipo: TipoFonte = "imprensa"
    trecho: str = ""


class SaidaVerificacao(BaseModel):
    id: int
    veredito: Veredito
    confianca: float
    explicacao: str
    o_que_e_verdade_por_tras: str = ""
    fontes: list[Fonte] = []

    @field_validator("confianca")
    @classmethod
    def _conf(cls, v: float) -> float:
        return min(1.0, max(0.0, v))


class SaidaSintese(BaseModel):
    titulo: str = Field(description="título curto do vídeo, neutro, até 70 caracteres")
    resumo: list[str] = Field(description="exatamente 3 linhas curtas")
    acertos: list[str]
    padrao_desinformacao: str = ""
    limitacoes: list[str] = []


# ---------------------------------------------------------------- schema para structured outputs

_REMOVER = {
    "title", "default", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
    "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "examples",
}


def schema_estrito(modelo: type[BaseModel]) -> dict:
    """JSON Schema compatível com `output_config.format`: sem $ref, todos os campos
    obrigatórios, `additionalProperties: false` e sem restrições numéricas/de texto."""
    bruto = modelo.model_json_schema()
    defs = bruto.pop("$defs", {})

    def resolver(no):
        if isinstance(no, dict):
            if "$ref" in no:
                nome = no["$ref"].split("/")[-1]
                return resolver(copy.deepcopy(defs[nome]))
            saida = {k: resolver(v) for k, v in no.items() if k not in _REMOVER}
            if saida.get("type") == "object" and "properties" in saida:
                saida["required"] = list(saida["properties"].keys())
                saida["additionalProperties"] = False
            if "allOf" in saida and len(saida["allOf"]) == 1:
                interno = saida.pop("allOf")[0]
                saida.update(interno)
            return saida
        if isinstance(no, list):
            return [resolver(x) for x in no]
        return no

    return resolver(bruto)
