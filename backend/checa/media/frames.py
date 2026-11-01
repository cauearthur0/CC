"""4.2 Quadros: contact sheets para o modelo de visão, miniatura e quadros avulsos."""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import config


def _rodar(cmd: list[str], timeout: int = 600) -> None:
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg falhou: {r.stderr.decode(errors='ignore')[-800:]}")


def _escapar_drawtext(caminho: str) -> str:
    return caminho.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


@dataclass
class ContactSheet:
    caminho: Path
    t_ini: float
    t_fim: float
    intervalo: float


def intervalo_contact_sheet(duracao: float) -> float:
    """1 quadro a cada 2 s; para vídeos com mais de 3 min, a cada 3 s."""
    return 3.0 if duracao > 180 else 2.0


def gerar_contact_sheets(
    video: Path, destino: Path, duracao: float, colunas: int = 4, linhas: int = 3
) -> list[ContactSheet]:
    """Mosaicos 4×3 com timestamp queimado (drawtext %{pts\\:hms}).

    Cada mosaico cobre colunas*linhas*intervalo segundos (24 s no padrão).
    """
    destino.mkdir(parents=True, exist_ok=True)
    intervalo = intervalo_contact_sheet(duracao)
    fonte = _escapar_drawtext(config().fonte_ttf)
    vf = (
        f"fps=1/{intervalo:g},scale=300:-2,"
        f"drawtext=fontfile='{fonte}':text='%{{pts\\:hms}}':x=6:y=6:fontsize=22:"
        "fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4,"
        f"tile={colunas}x{linhas}:padding=4:color=black"
    )
    _rodar([
        "ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", vf,
        "-fps_mode", "vfr", "-q:v", "4", str(destino / "sheet_%03d.jpg"),
    ])
    por_folha = colunas * linhas * intervalo
    folhas = sorted(destino.glob("sheet_*.jpg"))
    return [
        ContactSheet(f, i * por_folha, min(duracao, (i + 1) * por_folha), intervalo)
        for i, f in enumerate(folhas)
    ]


def extrair_quadro(video: Path, t: float, destino: Path, largura: int | None = None) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    vf = ["-vf", f"scale={largura}:-2"] if largura else []
    _rodar([
        "ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, t):.3f}", "-i", str(video),
        "-frames:v", "1", *vf, "-q:v", "3", str(destino),
    ])
    return destino


def gerar_miniatura(video: Path, destino: Path, duracao: float) -> Path:
    return extrair_quadro(video, min(1.0, duracao / 2), destino, largura=360)


def ler_quadros(
    video: Path,
    fps: float,
    largura: int,
    altura: int,
    crop: tuple[int, int, int, int] | None = None,
    escala: int = 1,
    inicio: float | None = None,
    duracao: float | None = None,
) -> Iterator[tuple[float, np.ndarray]]:
    """Lê quadros RGB como arrays numpy, em streaming (sem guardar tudo na memória).

    crop = (w, h, x, y). escala = fator de upscale aplicado depois do crop.
    Rende (timestamp_em_segundos, quadro).
    """
    filtros = [f"fps={fps:g}"]
    w, h = largura, altura
    if crop:
        cw, ch, cx, cy = crop
        filtros.append(f"crop={cw}:{ch}:{cx}:{cy}")
        w, h = cw, ch
    if escala != 1:
        filtros.append(f"scale={w * escala}:{h * escala}:flags=bicubic")
        w, h = w * escala, h * escala
    cmd = ["ffmpeg", "-v", "error"]
    if inicio is not None:
        cmd += ["-ss", f"{inicio:.3f}"]
    cmd += ["-i", str(video)]
    if duracao is not None:
        cmd += ["-t", f"{duracao:.3f}"]
    cmd += ["-vf", ",".join(filtros), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    tamanho = w * h * 3
    base = inicio or 0.0
    i = 0
    try:
        assert proc.stdout is not None
        while True:
            buf = proc.stdout.read(tamanho)
            if len(buf) < tamanho:
                break
            quadro = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3)
            # o filtro fps amostra no meio de cada intervalo; usamos o início do intervalo
            yield base + i / fps, quadro
            i += 1
    finally:
        if proc.stdout:
            proc.stdout.close()
        proc.kill()
        proc.wait()
