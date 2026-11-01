"""Geradores de quadros e vídeos sintéticos para os testes."""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def fundo_bege_ruidoso(largura: int, altura: int, semente: int = 7) -> np.ndarray:
    """Fundo claro e texturizado (cascalho/folhagem ao sol): bege com manchas e brilhos.

    Os tons são claros (difíceis para OCR cru), mas min(R,G,B) fica abaixo de 225.
    """
    rng = np.random.default_rng(semente)
    base = np.array([226, 208, 168], dtype=np.float32)
    img = np.tile(base, (altura, largura, 1))
    # textura de baixa frequência (manchas de luz e sombra)
    peq = rng.normal(0, 30, size=(altura // 6 + 1, largura // 6 + 1, 1)).astype(np.float32)
    manchas = np.kron(peq, np.ones((6, 6, 1)))[:altura, :largura]
    img += manchas
    # textura fina (grão)
    img += rng.normal(0, 16, size=(altura, largura, 1))
    # pedrinhas escuras
    n = (largura * altura) // 60
    ys, xs = rng.integers(0, altura, n), rng.integers(0, largura, n)
    img[ys, xs] -= 90
    img = np.clip(img, 0, 222)
    # brilhos isolados quase brancos (somem com a mediana 3×3)
    n = (largura * altura) // 400
    ys, xs = rng.integers(0, altura, n), rng.integers(0, largura, n)
    img[ys, xs] = 250
    return img.astype(np.uint8)


def desenhar_texto(img: np.ndarray, texto: str, y: int, tamanho: int = 44) -> np.ndarray:
    pil = Image.fromarray(img)
    d = ImageDraw.Draw(pil)
    fonte = ImageFont.truetype(FONTE, tamanho)
    larg = d.textlength(texto, font=fonte)
    d.text(((img.shape[1] - larg) / 2, y), texto, font=fonte, fill=(255, 255, 255))
    return np.array(pil)


def quadro_legenda(texto: str, largura: int = 720, altura: int = 140, semente: int = 7) -> np.ndarray:
    return desenhar_texto(fundo_bege_ruidoso(largura, altura, semente), texto, (altura - 52) // 2)


def ffmpeg_disponivel() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except Exception:
        return False


def gerar_video_legendado(
    destino: Path,
    frases: list[tuple[float, float, str]],
    duracao: float = 10.0,
    palavra_por_palavra: bool = True,
    largura: int = 480,
    altura: int = 854,
    titulo: str | None = None,
    com_audio: bool = False,
) -> Path:
    """Vídeo vertical com fundo ruidoso e legenda branca na faixa inferior.

    palavra_por_palavra=True: cada frase cresce uma palavra a cada 0,4 s.
    """
    escape = lambda s: s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")
    filtros = []
    y_leg = int(altura * 0.70)
    for ini, fim, frase in frases:
        palavras = frase.split()
        if palavra_por_palavra:
            passo = min(0.4, (fim - ini) / len(palavras))
            for i in range(len(palavras)):
                a = ini + i * passo
                b = ini + (i + 1) * passo if i < len(palavras) - 1 else fim
                parcial = escape(" ".join(palavras[: i + 1]))
                filtros.append(
                    f"drawtext=fontfile={FONTE}:text='{parcial}':fontcolor=white:fontsize=22:"
                    f"x=(w-text_w)/2:y={y_leg}:enable='between(t,{a:.2f},{b - 0.01:.2f})'"
                )
        else:
            filtros.append(
                f"drawtext=fontfile={FONTE}:text='{escape(frase)}':fontcolor=white:fontsize=22:"
                f"x=(w-text_w)/2:y={y_leg}:enable='between(t,{ini:.2f},{fim - 0.01:.2f})'"
            )
    if titulo:
        filtros.append(
            f"drawtext=fontfile={FONTE}:text='{escape(titulo)}':fontcolor=black:fontsize=24:"
            f"box=1:boxcolor=yellow:boxborderw=8:x=(w-text_w)/2:y=60:enable='lt(t,3)'"
        )
    fundo = f"color=c=0xA89070:s={largura}x{altura}:d={duracao}:r=30"
    vf = "noise=alls=40:allf=t," + ",".join(filtros)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", fundo]
    if com_audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duracao}"]
    cmd += ["-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast"]
    if com_audio:
        cmd += ["-c:a", "aac", "-shortest"]
    cmd.append(str(destino))
    subprocess.run(cmd, check=True, capture_output=True)
    return destino
