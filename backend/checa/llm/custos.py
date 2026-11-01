"""Tabela de preços (US$ por milhão de tokens) e cálculo de custo.

Preços de lista da API da Anthropic. Confira em https://www.anthropic.com/pricing
e atualize aqui se mudarem.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

# entrada, saída, escrita de cache (5 min), leitura de cache
PRECOS: dict[str, tuple[float, float, float, float]] = {
    "claude-fable-5-1": (10.00, 50.00, 12.50, 0.25),
    "claude-opus-5-5": (4.00, 20.00, 5.00, 0.20),
    "claude-opus-5": (5.00, 25.00, 6.25, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00, 2.50, 0.20),
    "claude-sonnet-5": (2.00, 10.00, 2.50, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.125, 0.01),
}
PRECO_BUSCA_USD = 10.00 / 1000  # web search: US$ 10 por 1.000 buscas (web fetch não é cobrado à parte)


@dataclass
class Uso:
    entrada: int = 0
    saida: int = 0
    cache_escrita: int = 0
    cache_leitura: int = 0
    buscas: int = 0
    fetches: int = 0
    chamadas: int = 0

    def somar(self, outro: "Uso") -> "Uso":
        for k in asdict(self):
            setattr(self, k, getattr(self, k) + getattr(outro, k))
        return self

    def dict(self) -> dict:
        return asdict(self)


def custo_usd(modelo: str, uso: Uso) -> float:
    ent, sai, cw, cr = PRECOS.get(modelo, PRECOS["claude-opus-5-5"])
    return (
        uso.entrada * ent
        + uso.saida * sai
        + uso.cache_escrita * cw
        + uso.cache_leitura * cr
    ) / 1_000_000 + uso.buscas * PRECO_BUSCA_USD


class Contabilidade:
    """Acumula uso e custo por etapa ao longo de uma checagem."""

    def __init__(self) -> None:
        self.por_etapa: dict[str, dict] = {}

    def registrar(self, etapa: str, modelo: str, uso: Uso) -> float:
        reg = self.por_etapa.setdefault(etapa, {"modelo": modelo, "uso": Uso(), "usd": 0.0})
        reg["uso"].somar(uso)
        c = custo_usd(modelo, uso)
        reg["usd"] += c
        return c

    @property
    def total_usd(self) -> float:
        return sum(r["usd"] for r in self.por_etapa.values())

    def dict(self) -> dict:
        return {
            "total_usd": round(self.total_usd, 4),
            "por_etapa": {
                k: {"modelo": v["modelo"], "usd": round(v["usd"], 4), "uso": v["uso"].dict()}
                for k, v in self.por_etapa.items()
            },
        }
