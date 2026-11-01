"""4.4 Áudio: transcrição com faster-whisper (local, CPU por padrão)."""

from __future__ import annotations

import logging
import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal, Protocol

from ..config import config

log = logging.getLogger(__name__)

SituacaoAudio = Literal["fala", "sem_audio", "silencio", "sem_fala", "indisponivel"]


@dataclass
class Palavra:
    t_ini: float
    t_fim: float
    texto: str


@dataclass
class SegmentoFala:
    t_ini: float
    t_fim: float
    texto: str
    confianca: float  # exp(avg_logprob), 0–1
    palavras: list[Palavra] = field(default_factory=list)


@dataclass
class ResultadoAudio:
    situacao: SituacaoAudio
    segmentos: list[SegmentoFala]
    modelo: str = ""
    detalhe: str = ""

    def dict(self) -> dict:
        return asdict(self)


class Transcritor(Protocol):
    def __call__(self, video: Path, tem_audio: bool) -> ResultadoAudio: ...


def volume_medio_db(video: Path) -> float | None:
    r = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(video), "-vn", "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else None


_modelo_cache: dict[str, object] = {}


def _carregar_modelo():
    c = config()
    chave = f"{c.whisper_modelo}:{c.whisper_dispositivo}:{c.whisper_compute_type}"
    if chave not in _modelo_cache:
        from faster_whisper import WhisperModel

        _modelo_cache[chave] = WhisperModel(
            c.whisper_modelo, device=c.whisper_dispositivo, compute_type=c.whisper_compute_type
        )
    return _modelo_cache[chave]


def transcrever_whisper(video: Path, tem_audio: bool) -> ResultadoAudio:
    c = config()
    if not tem_audio:
        return ResultadoAudio("sem_audio", [], detalhe="O arquivo não tem trilha de áudio.")
    if c.whisper_modelo.lower() in ("", "desligado", "off", "none"):
        return ResultadoAudio("indisponivel", [], detalhe="Transcrição de áudio desligada (WHISPER_MODELO).")
    vol = volume_medio_db(video)
    if vol is not None and vol < -55:
        return ResultadoAudio("silencio", [], detalhe=f"Áudio praticamente mudo ({vol:.0f} dB).")
    try:
        modelo = _carregar_modelo()
    except Exception as e:  # sem rede para baixar o modelo, sem memória etc.
        log.warning("whisper indisponível: %s", e)
        return ResultadoAudio(
            "indisponivel", [], detalhe="Não foi possível carregar o modelo de transcrição."
        )
    segmentos_iter, info = modelo.transcribe(  # type: ignore[attr-defined]
        str(video),
        language=c.whisper_idioma,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    import math

    segmentos: list[SegmentoFala] = []
    for s in segmentos_iter:
        if s.no_speech_prob > 0.8 and s.avg_logprob < -1.0:
            continue
        palavras = [
            Palavra(round(w.start, 2), round(w.end, 2), w.word.strip()) for w in (s.words or [])
        ]
        segmentos.append(
            SegmentoFala(
                round(s.start, 2), round(s.end, 2), s.text.strip(),
                round(math.exp(s.avg_logprob), 3), palavras,
            )
        )
    fala_total = sum(s.t_fim - s.t_ini for s in segmentos)
    n_palavras = sum(len(s.texto.split()) for s in segmentos)
    if n_palavras < 5 or fala_total < 0.08 * max(1.0, info.duration):
        return ResultadoAudio(
            "sem_fala", segmentos, c.whisper_modelo,
            "Pouca ou nenhuma fala detectada (provavelmente só música).",
        )
    return ResultadoAudio("fala", segmentos, c.whisper_modelo)
