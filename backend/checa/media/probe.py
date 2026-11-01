"""4.1 Ingestão: ffprobe + hash."""

from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


class VideoInvalido(Exception):
    """Mensagem já em português, pronta para mostrar ao usuário."""


@dataclass
class InfoVideo:
    duracao: float
    largura: int
    altura: int
    fps: float
    tem_audio: bool
    formato: str
    tamanho_bytes: int

    def dict(self) -> dict:
        return asdict(self)


def _fps(txt: str | None) -> float:
    if not txt or txt == "0/0":
        return 0.0
    if "/" in txt:
        n, d = txt.split("/", 1)
        return float(n) / float(d) if float(d) else 0.0
    return float(txt)


def sondar(caminho: Path) -> InfoVideo:
    try:
        saida = subprocess.run(
            [
                "ffprobe", "-v", "error", "-print_format", "json",
                "-show_format", "-show_streams", str(caminho),
            ],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        raise VideoInvalido("Não consegui ler esse arquivo como vídeo.") from e
    dados = json.loads(saida or "{}")
    streams = dados.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise VideoInvalido("O arquivo não tem trilha de vídeo.")
    audio = any(s.get("codec_type") == "audio" for s in streams)
    fmt = dados.get("format", {})
    duracao = float(fmt.get("duration") or video.get("duration") or 0)
    largura, altura = int(video.get("width", 0)), int(video.get("height", 0))
    # vídeos de celular gravados "deitados" com metadado de rotação
    rot = 0
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = abs(int(sd["rotation"]))
    if str(video.get("tags", {}).get("rotate", "0")) in ("90", "270") or rot in (90, 270):
        largura, altura = altura, largura
    return InfoVideo(
        duracao=duracao,
        largura=largura,
        altura=altura,
        fps=_fps(video.get("avg_frame_rate") or video.get("r_frame_rate")),
        tem_audio=audio,
        formato=fmt.get("format_name", ""),
        tamanho_bytes=int(fmt.get("size") or caminho.stat().st_size),
    )


def validar(info: InfoVideo, max_duracao_s: int) -> None:
    if info.duracao <= 0:
        raise VideoInvalido("Não consegui descobrir a duração do vídeo.")
    if info.duracao > max_duracao_s:
        raise VideoInvalido(
            f"O vídeo tem {info.duracao / 60:.1f} min. O limite é {max_duracao_s // 60} min."
        )
    formatos_ok = ("mov", "mp4", "m4a", "3gp", "matroska", "webm")
    if not any(f in info.formato for f in formatos_ok):
        raise VideoInvalido("Formato não suportado. Envie mp4, mov ou webm.")


def sha256_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()
