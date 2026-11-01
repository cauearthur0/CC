"""4.5 Transcrição unificada: fala + legenda + texto de tela numa linha do tempo.

Regra: o áudio é a fonte primária da fala; a legenda confirma ou corrige; o texto de tela
é uma camada separada. Quando legenda e fala divergem de forma relevante, marcamos
`divergencia=True` (isso pode ser, em si, uma técnica de manipulação).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from .media.audio import ResultadoAudio
from .media.ocr import Legenda
from .texto import cobertura_tokens, hms, tokens

Origem = Literal["fala", "legenda", "tela"]

LIMIAR_CONFIRMA = 0.6
LIMIAR_DIVERGE = 0.35
FOLGA_S = 0.8


@dataclass
class Trecho:
    t_ini: float
    t_fim: float
    origem: Origem
    texto: str
    legenda: str | None = None  # quando origem == "fala" e há legenda sobreposta
    legenda_confere: bool | None = None
    divergencia: bool = False
    confianca: float | None = None  # fala: whisper (0–1); legenda/tela: OCR (0–1)

    def dict(self) -> dict:
        return asdict(self)


def _palavras_na_janela(audio: ResultadoAudio, ini: float, fim: float) -> list[str]:
    toks: list[str] = []
    for s in audio.segmentos:
        if s.t_fim < ini or s.t_ini > fim:
            continue
        if s.palavras:
            for p in s.palavras:
                if p.t_fim >= ini and p.t_ini <= fim:
                    toks.extend(tokens(p.texto))
        else:
            toks.extend(tokens(s.texto))
    return toks


def comparar_legenda_fala(legenda: Legenda, audio: ResultadoAudio) -> tuple[str, float]:
    """Devolve ("confere" | "diverge" | "incerto" | "sem_fala", cobertura)."""
    falado = _palavras_na_janela(audio, legenda.t_ini - FOLGA_S, legenda.t_fim + FOLGA_S)
    leg = tokens(legenda.texto)
    if not falado:
        return "sem_fala", 0.0
    cob = cobertura_tokens(leg, falado)
    if cob >= LIMIAR_CONFIRMA:
        return "confere", cob
    if cob < LIMIAR_DIVERGE and len(leg) >= 3:
        return "diverge", cob
    return "incerto", cob


def unificar(
    audio: ResultadoAudio, legendas: list[Legenda], tela: list[Legenda]
) -> list[Trecho]:
    trechos: list[Trecho] = []
    usadas: set[int] = set()
    comparacoes = {i: comparar_legenda_fala(lg, audio) for i, lg in enumerate(legendas)}

    for seg in audio.segmentos if audio.situacao in ("fala", "sem_fala") else []:
        sobrepostas = [
            i for i, lg in enumerate(legendas)
            if lg.t_fim > seg.t_ini - FOLGA_S / 2 and lg.t_ini < seg.t_fim + FOLGA_S / 2
        ]
        if not sobrepostas:
            trechos.append(Trecho(seg.t_ini, seg.t_fim, "fala", seg.texto, confianca=seg.confianca))
            continue
        textos = [legendas[i].texto for i in sobrepostas]
        estados = [comparacoes[i][0] for i in sobrepostas]
        diverge = any(e == "diverge" for e in estados)
        confere = all(e == "confere" for e in estados)
        trechos.append(
            Trecho(
                seg.t_ini, seg.t_fim, "fala", seg.texto,
                legenda=" / ".join(textos),
                legenda_confere=True if confere else (False if diverge else None),
                divergencia=diverge,
                confianca=seg.confianca,
            )
        )
        usadas.update(sobrepostas)

    # legendas sem fala correspondente (vídeo sem áudio, música, ou fala que o whisper perdeu)
    for i, lg in enumerate(legendas):
        if i in usadas:
            continue
        estado, _ = comparacoes[i]
        trechos.append(
            Trecho(
                lg.t_ini, lg.t_fim, "legenda", lg.texto,
                divergencia=estado == "diverge",
                confianca=round(lg.conf / 100, 2),
            )
        )
    for tx in tela:
        trechos.append(Trecho(tx.t_ini, tx.t_fim, "tela", tx.texto, confianca=round(tx.conf / 100, 2)))

    ordem = {"tela": 0, "fala": 1, "legenda": 2}
    trechos.sort(key=lambda x: (round(x.t_ini, 1), ordem[x.origem]))
    return trechos


def para_texto(trechos: list[Trecho]) -> str:
    """Representação compacta para o modelo."""
    linhas = []
    for t in trechos:
        faixa = f"[{hms(t.t_ini)}–{hms(t.t_fim)}]"
        if t.origem == "fala":
            extra = ""
            if t.legenda is not None:
                if t.divergencia:
                    extra = f'  ⚠ LEGENDA DIVERGE: "{t.legenda}"'
                elif t.legenda_confere:
                    extra = "  (legenda confere)"
                else:
                    extra = f'  (legenda: "{t.legenda}")'
            incerto = " (áudio pouco claro)" if (t.confianca or 1) < 0.45 else ""
            linhas.append(f'{faixa} FALA{incerto}: "{t.texto}"{extra}')
        elif t.origem == "legenda":
            tag = "LEGENDA (sem fala correspondente)"
            if t.divergencia:
                tag = "LEGENDA ⚠ DIVERGE DA FALA"
            linhas.append(f'{faixa} {tag}: "{t.texto}"')
        else:
            linhas.append(f'{faixa} TELA: "{t.texto}"')
    return "\n".join(linhas) if linhas else "(nenhum texto ou fala detectados)"


def trecho_ao_redor(trechos: list[Trecho], t_ini: float, t_fim: float, folga: float = 15.0) -> str:
    perto = [t for t in trechos if t.t_fim >= t_ini - folga and t.t_ini <= t_fim + folga]
    return para_texto(perto)
