"""4.3 Legendas (OCR).

Receita que funcionou na checagem manual (caso B, legenda palavra por palavra):
  1. recortar só a faixa da legenda e ampliar 2×;
  2. máscara de quase-branco: min(R,G,B) > 225 (legenda é branco puro; fundo claro é bege);
  3. inverter (texto preto em fundo branco), MedianFilter(3), borda branca de 30 px;
  4. descartar quadros com menos de ~150 px de máscara;
  5. tesseract -l por --psm 7 (uma linha) ou --psm 6 (duas linhas);
  6. deduplicar, descartar linhas ruidosas, reconstruir a frase cumulativa.
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage

from ..config import config
from ..texto import normalizar, similaridade, tokens
from .frames import ler_quadros
from .probe import InfoVideo

Modo = Literal["palavra", "bloco", "sem_legenda"]
log = logging.getLogger(__name__)
# rodamos vários tesseracts em paralelo; cada um com 1 thread evita disputa de CPU (OpenMP)
_ENV_TESSERACT = {**os.environ, "OMP_THREAD_LIMIT": "1"}


# --------------------------------------------------------------------------- máscara


def mascara_quase_branco(img: np.ndarray, limiar: int = 225) -> np.ndarray:
    """True onde o pixel é quase branco nos três canais (texto de legenda)."""
    return img.min(axis=2) > limiar


def remover_pontos(mascara: np.ndarray, area_min: int | None = None) -> np.ndarray:
    """Remove componentes conexos pequenos (brilhos isolados no fundo).

    Sem isso, pontinhos quase brancos viram "|", "o" ou "*" nas bordas do texto.
    """
    if area_min is None:
        area_min = max(12, round(1e-4 * mascara.size))
    rotulos, n = ndimage.label(mascara)
    if n == 0:
        return mascara
    areas = ndimage.sum_labels(mascara, rotulos, index=np.arange(1, n + 1))
    manter = np.zeros(n + 1, dtype=bool)
    manter[1:] = areas >= area_min
    return manter[rotulos]


def mascara_legenda(img: np.ndarray, limiar: int = 225) -> np.ndarray:
    """Máscara de quase-branco já sem os pontinhos isolados."""
    return remover_pontos(mascara_quase_branco(img, limiar))


def preparar_para_ocr(mascara: np.ndarray, borda: int = 30) -> Image.Image:
    """Texto preto em fundo branco, com mediana 3×3 e borda branca."""
    img = Image.fromarray(np.where(mascara, 0, 255).astype(np.uint8), mode="L")
    img = img.filter(ImageFilter.MedianFilter(3))
    return ImageOps.expand(img, border=borda, fill=255)


def contar_linhas_texto(mascara: np.ndarray, min_altura: int = 8) -> int:
    """Quantas linhas de texto há na máscara (projeção horizontal)."""
    perfil = mascara.sum(axis=1)
    if perfil.max(initial=0) == 0:
        return 0
    tem = perfil >= max(2, 0.02 * mascara.shape[1] * 0.1)
    corridas: list[list[int]] = []
    inicio = None
    for i, v in enumerate(tem):
        if v and inicio is None:
            inicio = i
        elif not v and inicio is not None:
            corridas.append([inicio, i])
            inicio = None
    if inicio is not None:
        corridas.append([inicio, len(tem)])
    # junta corridas separadas por vãos pequenos (acentos, pingos)
    juntas: list[list[int]] = []
    for c in corridas:
        if juntas and c[0] - juntas[-1][1] < max(3, 0.3 * (juntas[-1][1] - juntas[-1][0])):
            juntas[-1][1] = c[1]
        else:
            juntas.append(c)
    return sum(1 for a, b in juntas if b - a >= min_altura)


# --------------------------------------------------------------------------- tesseract


@dataclass
class LinhaOCR:
    texto: str
    conf: float  # média da confiança das palavras (0–100)


def tesseract(
    img: Image.Image, psm: int, idioma: str | None = None, timeout: int = 30
) -> list[LinhaOCR]:
    """Roda o tesseract (saída TSV) e devolve linhas com confiança média."""
    idioma = idioma or config().tesseract_idioma
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    try:
        r = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", idioma, "--psm", str(psm), "tsv"],
            input=buf.getvalue(), capture_output=True, timeout=timeout, env=_ENV_TESSERACT,
        )
    except subprocess.TimeoutExpired:
        log.warning("tesseract excedeu %ss num quadro; quadro ignorado", timeout)
        return []
    if r.returncode != 0:
        raise RuntimeError(f"tesseract falhou: {r.stderr.decode(errors='ignore')[-300:]}")
    linhas: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
    for registro in r.stdout.decode("utf-8", errors="ignore").splitlines()[1:]:
        partes = registro.split("\t")
        if len(partes) < 12 or partes[0] != "5":
            continue
        txt = partes[11].strip()
        try:
            conf = float(partes[10])
        except ValueError:
            continue
        if not txt or conf < 0:
            continue
        chave = (int(partes[2]), int(partes[3]), int(partes[4]))
        linhas.setdefault(chave, []).append((txt, conf))
    saida = []
    for chave in sorted(linhas):
        palavras = linhas[chave]
        saida.append(
            LinhaOCR(" ".join(p for p, _ in palavras), sum(c for _, c in palavras) / len(palavras))
        )
    return saida


# --------------------------------------------------------------------------- limpeza


_LIXO = str.maketrans({c: " " for c in "|_~^`´¨°ºª{}[]<>\\/@#*=+«»“”‘’\"'"})


def limpar_linha(texto: str) -> str | None:
    """Normaliza espaços e descarta linhas de ruído.

    Regra do spec: descarta se mais de 40 % dos tokens têm 1 caractere. Em linhas de 1–2
    tokens (começo de legenda palavra por palavra, "o decreto") exige uma palavra de 3+ letras.
    """
    t = " ".join(texto.translate(_LIXO).split()).strip(" .,;:-–—")
    if not t:
        return None
    toks = t.split()
    curtos = sum(1 for k in toks if len(k) == 1)
    if len(toks) >= 3 and curtos / len(toks) > 0.40:
        return None
    if len(toks) < 3 and not any(sum(ch.isalpha() for ch in k) >= 3 for k in toks):
        return None  # "o d", "a e": curto demais para ser frase (mas "o decreto" passa)
    letras = sum(ch.isalpha() for ch in t)
    if letras < 2 or letras / max(1, len(t.replace(" ", ""))) < 0.5:
        return None
    return t


def deduplicar(obs: list[tuple[float, str | None]]) -> list[tuple[float, str | None]]:
    """Remove repetições consecutivas idênticas (após normalização)."""
    saida: list[tuple[float, str | None]] = []
    ultimo: str | None = object()  # type: ignore[assignment]
    for t, txt in obs:
        chave = normalizar(txt) if txt else None
        if chave != ultimo:
            saida.append((t, txt))
            ultimo = chave
    return saida


# --------------------------------------------------------------------------- reconstrução


@dataclass
class Legenda:
    t_ini: float
    t_fim: float
    texto: str
    conf: float = 100.0
    origem: str = "legenda"

    def dict(self) -> dict:
        return asdict(self)


def _relacao(atual: list[str], novo: list[str]) -> tuple[str, int]:
    """Como a leitura `novo` se relaciona com a frase em construção `atual`.

    Numa legenda cumulativa, todas as leituras de uma frase começam igual. Por isso a
    comparação é ancorada no começo: erro de OCR na última palavra ("tentaram" →
    "tertatain") não deve parecer frase nova.
    """
    if not atual or not novo:
        return "nova", 0
    n = min(len(atual), len(novo))
    prefixo = similaridade(atual[:n], novo[:n])
    k_inicio = min(2, n)
    inicio_igual = similaridade(atual[:k_inicio], novo[:k_inicio]) >= 0.8
    if prefixo >= 0.85 or (inicio_igual and prefixo >= 0.65):
        if len(novo) > len(atual):
            return "estende", 0
        if len(novo) < len(atual):
            return "prefixo", 0
        return "igual", 0
    for k in range(min(len(atual), len(novo)), 1, -1):
        if similaridade(atual[-k:], novo[:k]) >= 0.85:
            return "sobrepoe", k
    return "nova", 0


def reconstruir_cumulativa(
    obs: list[tuple[float, str | None]],
    intervalo: float,
    confs: dict[float, float] | None = None,
    tolerancia_vazios: int = 1,
) -> list[Legenda]:
    """Legenda palavra por palavra: "te impedir" → "te impedir de" → "te impedir de falar".

    Mantém a versão mais longa de cada sequência crescente. Também junta legendas em
    "janela deslizante" (o fim da anterior é o começo da seguinte). `None` = quadro sem
    legenda; mais de `tolerancia_vazios` seguidos encerram a frase.
    """
    confs = confs or {}
    saida: list[Legenda] = []
    atual: Legenda | None = None
    vazios = 0
    for t, txt in obs:
        if not txt:
            vazios += 1
            if atual and vazios > tolerancia_vazios:
                saida.append(atual)
                atual = None
            continue
        vazios = 0
        if atual is None:
            atual = Legenda(t, t + intervalo, txt, confs.get(t, 100.0))
            continue
        rel, k = _relacao(tokens(atual.texto), tokens(txt))
        if rel == "estende":
            atual.texto, atual.t_fim = txt, t + intervalo
            atual.conf = confs.get(t, atual.conf)
        elif rel == "igual":
            atual.t_fim = t + intervalo
            if confs.get(t, 0.0) > atual.conf:  # mesma frase, leitura mais confiável
                atual.texto, atual.conf = txt, confs[t]
        elif rel == "prefixo":
            atual.t_fim = t + intervalo
        elif rel == "sobrepoe":
            cauda = txt.split()[k:]
            atual.texto = " ".join([atual.texto, *cauda]) if cauda else atual.texto
            atual.t_fim = t + intervalo
        else:
            saida.append(atual)
            atual = Legenda(t, t + intervalo, txt, confs.get(t, 100.0))
    if atual:
        saida.append(atual)
    return saida


def agrupar_blocos(
    obs: list[tuple[float, str | None]],
    intervalo: float,
    confs: dict[float, float] | None = None,
    tolerancia_vazios: int = 1,
) -> list[Legenda]:
    """Legenda em bloco: a mesma frase fica 3–5 s na tela. Agrupa leituras parecidas
    e fica com a leitura mais "central" (medoide), que costuma ser a menos ruidosa."""
    confs = confs or {}
    grupos: list[list[tuple[float, str]]] = []
    vazios = 0
    for t, txt in obs:
        if not txt:
            vazios += 1
            if vazios > tolerancia_vazios and grupos and grupos[-1]:
                grupos.append([])
            continue
        vazios = 0
        if grupos and grupos[-1] and similaridade(grupos[-1][-1][1], txt) >= 0.75:
            grupos[-1].append((t, txt))
        else:
            if grupos and not grupos[-1]:
                grupos[-1].append((t, txt))
            else:
                grupos.append([(t, txt)])
    saida = []
    for g in grupos:
        if not g:
            continue
        textos = [x for _, x in g]
        # desempate: a leitura exata mais frequente, depois a com mais acentos (OCR perde acento)
        melhor = max(
            textos,
            key=lambda a: (
                round(sum(similaridade(a, b) for b in textos), 3),
                textos.count(a),
                sum(1 for ch in a if ord(ch) > 127),
                len(a),
            ),
        )
        t_melhor = next(t for t, x in g if x == melhor)
        saida.append(Legenda(g[0][0], g[-1][0] + intervalo, melhor, confs.get(t_melhor, 100.0)))
    return saida


# --------------------------------------------------------------------------- faixa e modo


@dataclass
class Faixa:
    y: int
    altura: int
    persistencia: float
    # tempos (s) em que a amostra tinha legenda — usados para escolher a janela de detecção de modo
    tempos_com_legenda: list[float] = field(default_factory=list)

    def dict(self) -> dict:
        return {"y": self.y, "altura": self.altura, "persistencia": round(self.persistencia, 3)}


def transicoes_por_linha(mascara: np.ndarray) -> np.ndarray:
    """Quantas vezes, em cada linha, a máscara passa de 0 para 1.

    Texto tem muitas transições (cada traço de letra); chapéu ou camiseta branca têm poucas.
    """
    return np.count_nonzero(mascara[:, 1:] & ~mascara[:, :-1], axis=1)


def detectar_faixa_em_quadros(
    quadros: list[tuple[float, np.ndarray]],
    offset_y: int,
    altura_total: int,
    limiar: int = 225,
    min_transicoes: int = 6,
) -> Faixa | None:
    """Acha a faixa da legenda: linhas com muitas transições de quase-branco, persistentes
    ao longo da amostra. `quadros` já vêm recortados a partir de `offset_y`."""
    if not quadros:
        return None
    h = quadros[0][1].shape[0]
    presenca = np.zeros(h)
    por_quadro = []
    for _, q in quadros:
        tr = transicoes_por_linha(mascara_quase_branco(q, limiar))
        ativo = tr >= min_transicoes
        presenca += ativo
        por_quadro.append(ativo)
    persist = presenca / len(quadros)
    pico = persist.max(initial=0)
    if pico < 0.15:
        return None
    corte = max(0.15, 0.35 * pico, 2.5 * float(np.median(persist)))
    acima = persist >= corte
    # corridas contíguas, tolerando vãos pequenos entre linhas de texto
    corridas: list[list[int]] = []
    i = 0
    while i < h:
        if acima[i]:
            j = i
            while j < h and acima[j]:
                j += 1
            if corridas and i - corridas[-1][1] <= max(12, (corridas[-1][1] - corridas[-1][0])):
                corridas[-1][1] = j
            else:
                corridas.append([i, j])
            i = j
        else:
            i += 1
    if not corridas:
        return None
    a, b = max(corridas, key=lambda c: persist[c[0] : c[1]].sum())
    if b - a < 6:
        return None
    # o núcleo detectado é a altura-x; ascendentes/descendentes ficam fora dele
    pad = max(10, int(0.5 * (b - a)) + 4)
    y0 = max(0, offset_y + a - pad)
    y1 = min(altura_total, offset_y + b + pad)
    y0 -= y0 % 2
    alt = (y1 - y0) - ((y1 - y0) % 2)
    linhas_faixa = slice(a, b)
    tempos = [
        t for (t, _), ativo in zip(quadros, por_quadro) if ativo[linhas_faixa].mean() > 0.3
    ]
    return Faixa(y0, alt, float(persist[a:b].mean()), tempos)


def detectar_faixa(video: Path, info: InfoVideo, amostras: int = 40) -> Faixa | None:
    c = config()
    y0 = int(info.altura * c.ocr_busca_faixa_inicio)
    y0 -= y0 % 2
    alt = info.altura - y0
    fps = min(2.0, amostras / max(info.duracao, 1.0))
    quadros = list(
        ler_quadros(video, fps, info.largura, info.altura, crop=(info.largura, alt, 0, y0))
    )[:amostras]
    return detectar_faixa_em_quadros(quadros, y0, info.altura, c.ocr_limiar_branco)


def diferenca_mascaras(m1: np.ndarray, m2: np.ndarray, tolerancia: int = 2) -> float:
    """Fração de pixels de texto de uma máscara sem correspondente (até `tolerancia` px) na outra.

    A tolerância absorve a oscilação das bordas causada pela compressão do vídeo; uma palavra
    nova (ou uma frase trocada) continua aparecendo como diferença grande.
    """
    n1, n2 = np.count_nonzero(m1), np.count_nonzero(m2)
    if n1 + n2 == 0:
        return 0.0
    d1 = ndimage.binary_dilation(m1, iterations=tolerancia)
    d2 = ndimage.binary_dilation(m2, iterations=tolerancia)
    sobra = np.count_nonzero(m1 & ~d2) + np.count_nonzero(m2 & ~d1)
    return sobra / (n1 + n2)


def taxa_de_mudanca(mascaras: list[np.ndarray], fps: float, limiar_mudanca: float = 0.08) -> float:
    """Mudanças significativas de texto por segundo numa sequência de máscaras."""
    if len(mascaras) < 2:
        return 0.0
    mudancas = 0
    for m1, m2 in zip(mascaras, mascaras[1:]):
        # só conta troca de texto por texto: legenda sumindo e voltando não é "palavra por palavra"
        if min(np.count_nonzero(m1), np.count_nonzero(m2)) < 50:
            continue
        if diferenca_mascaras(m1, m2) > limiar_mudanca:
            mudancas += 1
    return mudancas / ((len(mascaras) - 1) / fps)


def detectar_modo(
    video: Path, info: InfoVideo, faixa: Faixa, n_quadros: int = 20, janelas: int = 3
) -> tuple[Modo, float]:
    """Amostra de 20 quadros a 4 fps: se o texto muda mais de 1×/s → palavra por palavra.

    Avalia até 3 janelas (começando em momentos com legenda) e usa a maior taxa, porque
    uma janela pode cair numa pausa da fala.
    """
    c = config()
    fps = 4.0
    dur_janela = n_quadros / fps
    candidatos = faixa.tempos_com_legenda or [info.duracao * 0.25]
    passo = max(1, len(candidatos) // janelas)
    inicios = [min(t, max(0.0, info.duracao - dur_janela)) for t in candidatos[::passo]][:janelas]
    melhor = 0.0
    for ini in inicios:
        mascaras = [
            mascara_legenda(q, c.ocr_limiar_branco)
            for _, q in ler_quadros(
                video, fps, info.largura, info.altura,
                crop=(info.largura, faixa.altura, 0, faixa.y), inicio=ini, duracao=dur_janela,
            )
        ][:n_quadros]
        melhor = max(melhor, taxa_de_mudanca(mascaras, fps))
    return ("palavra" if melhor >= 1.0 else "bloco"), melhor


# --------------------------------------------------------------------------- extração


@dataclass
class ResultadoOCR:
    modo: Modo
    faixa: Faixa | None
    taxa_mudanca: float
    legendas: list[Legenda]
    cru: list[dict]
    texto_tela: list[Legenda]

    def dict(self) -> dict:
        return {
            "modo": self.modo,
            "faixa": self.faixa.dict() if self.faixa else None,
            "taxa_mudanca": round(self.taxa_mudanca, 2),
            "legendas": [x.dict() for x in self.legendas],
            "texto_tela": [x.dict() for x in self.texto_tela],
        }


def _ocr_faixa(mascara: np.ndarray, idioma: str) -> tuple[str, float]:
    psm = 6 if contar_linhas_texto(mascara) >= 2 else 7
    linhas = tesseract(preparar_para_ocr(mascara), psm=psm, idioma=idioma)
    if not linhas:
        return "", 0.0
    texto = " ".join(x.texto for x in linhas)
    conf = sum(x.conf for x in linhas) / len(linhas)
    return texto, conf


def extrair_legendas(
    video: Path, info: InfoVideo, faixa: Faixa, modo: Modo
) -> tuple[list[Legenda], list[dict]]:
    c = config()
    fps = 4.0 if modo == "palavra" else 1.0
    escala = 2
    pendentes: deque[tuple[float, int, Future | str, float]] = deque()
    resultados: list[tuple[float, int, str, float]] = []
    ultima_mascara: np.ndarray | None = None
    ultimo: tuple[str, float] = ("", 0.0)

    def drenar(limite: int) -> None:
        while len(pendentes) > limite:
            t, px, fut, cf = pendentes.popleft()
            txt, conf = fut.result() if isinstance(fut, Future) else (fut, cf)
            resultados.append((t, px, txt, conf))

    with ThreadPoolExecutor(max_workers=max(1, c.ocr_threads)) as pool:
        for t, quadro in ler_quadros(
            video, fps, info.largura, info.altura,
            crop=(info.largura, faixa.altura, 0, faixa.y), escala=escala,
        ):
            m = mascara_legenda(quadro, c.ocr_limiar_branco)
            px = int(np.count_nonzero(m))
            if px < c.ocr_min_pixels_mascara:
                pendentes.append((t, px, "", 0.0))
                ultima_mascara = None
            elif ultima_mascara is not None and diferenca_mascaras(m, ultima_mascara) < 0.01:
                # quadro praticamente igual ao anterior: reaproveita a leitura (é preenchida no drenar)
                pendentes.append((t, px, "__igual__", 0.0))
            else:
                pendentes.append((t, px, pool.submit(_ocr_faixa, m, c.tesseract_idioma), 0.0))
                ultima_mascara = m
            drenar(64)
        drenar(0)

    cru: list[dict] = []
    obs: list[tuple[float, str | None]] = []
    confs: dict[float, float] = {}
    for t, px, txt, conf in resultados:
        if txt == "__igual__":
            txt, conf = ultimo
        elif px >= c.ocr_min_pixels_mascara:
            ultimo = (txt, conf)
        cru.append({"t": round(t, 2), "pixels": px, "texto": txt, "conf": round(conf, 1)})
        limpo = limpar_linha(txt) if txt else None
        obs.append((round(t, 2), limpo))
        if limpo:
            confs[round(t, 2)] = conf
    obs = deduplicar(obs)
    intervalo = 1.0 / fps
    if modo == "palavra":
        legendas = reconstruir_cumulativa(obs, intervalo, confs, tolerancia_vazios=2)
    else:
        legendas = agrupar_blocos(obs, intervalo, confs)
    # frase de 1 palavra isolada costuma ser ruído
    legendas = [lg for lg in legendas if len(lg.texto.split()) >= 2 or len(lg.texto) >= 6]
    return legendas, cru


def _linha_tela_valida(linha: LinhaOCR) -> str | None:
    if linha.conf < 60:
        return None
    t = limpar_linha(linha.texto)
    if not t:
        return None
    palavras = t.split()
    if len(palavras) < 2 or not any(len(p) >= 4 and p.isalpha() for p in palavras):
        return None
    return t


def mascaras_texto_tela(quadro: np.ndarray) -> list[np.ndarray]:
    """Máscaras binárias de candidatos a texto: branco, amarelo e preto.

    Fundo texturizado (cascalho, folhagem) não entra em nenhuma delas; blocos sólidos
    grandes (parede branca, tarja preta) são removidos pelo tamanho do componente.
    """
    r, g, b = (quadro[..., i].astype(np.int16) for i in range(3))
    brutas = [
        quadro.min(axis=2) > 225,  # branco
        (r > 200) & (g > 170) & (b < 110),  # amarelo
        quadro.max(axis=2) < 45,  # preto
    ]
    area_total = quadro.shape[0] * quadro.shape[1]
    saida = []
    for m in brutas:
        if not m.any():
            continue
        rotulos, n = ndimage.label(m)
        if n == 0:
            continue
        areas = ndimage.sum_labels(m, rotulos, index=np.arange(1, n + 1))
        manter = np.zeros(n + 1, dtype=bool)
        manter[1:] = (areas >= max(12, area_total * 2e-5)) & (areas <= area_total * 0.01)
        limpa = manter[rotulos]
        if np.count_nonzero(limpa) >= 80:
            saida.append(limpa)
    return saida


def faixas_de_texto(mascara: np.ndarray, min_transicoes: int = 6) -> list[tuple[int, int]]:
    """Faixas horizontais (y0, y1) com cara de linha de texto."""
    ativo = transicoes_por_linha(mascara) >= min_transicoes
    faixas: list[tuple[int, int]] = []
    i, h = 0, len(ativo)
    while i < h:
        if ativo[i]:
            j = i
            while j < h and (ativo[j] or (j + 3 < h and ativo[j + 1 : j + 4].any())):
                j += 1
            if j - i >= 6:
                pad = max(4, (j - i) // 2)
                faixas.append((max(0, i - pad), min(h, j + pad)))
            i = j
        else:
            i += 1
    return faixas


def ocr_texto_tela(quadro: np.ndarray, idioma: str, max_faixas: int = 6) -> list[str]:
    linhas: list[str] = []
    for m in mascaras_texto_tela(quadro):
        for y0, y1 in faixas_de_texto(m)[:max_faixas]:
            recorte = m[y0:y1]
            if np.count_nonzero(recorte) < 60:
                continue
            img = preparar_para_ocr(recorte, borda=20)
            if recorte.shape[0] < 40:  # texto pequeno: amplia para o tesseract
                img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
            psm = 6 if contar_linhas_texto(recorte) >= 2 else 7
            for lin in tesseract(img, psm=psm, idioma=idioma, timeout=15):
                t = _linha_tela_valida(lin)
                if t and t not in linhas:
                    linhas.append(t)
    return linhas


def extrair_texto_tela(
    video: Path, info: InfoVideo, faixa: Faixa | None, fps: float = 1.0
) -> list[Legenda]:
    """OCR fora da faixa de legenda: títulos de abertura, manchetes de clipes inseridos,
    nome da conta, faixas de identificação. Marcado com origem "tela"."""
    c = config()
    if info.duracao > 300:
        fps = 0.5
    leituras: list[tuple[float, list[str]]] = []
    anterior_peq: np.ndarray | None = None
    futuros: list[tuple[float, Future | str]] = []

    with ThreadPoolExecutor(max_workers=max(1, c.ocr_threads)) as pool:
        for t, quadro in ler_quadros(video, fps, info.largura, info.altura):
            if faixa:
                quadro = quadro.copy()
                quadro[faixa.y : faixa.y + faixa.altura, :] = 128
            peq = quadro[::8, ::8].mean(axis=2).astype(np.int16)
            if anterior_peq is not None and np.abs(peq - anterior_peq).mean() < 3:
                futuros.append((t, "__igual__"))
                continue
            anterior_peq = peq
            futuros.append((t, pool.submit(ocr_texto_tela, quadro, c.tesseract_idioma)))
        anterior_txt: list[str] = []
        for t, f in futuros:
            if isinstance(f, Future):
                anterior_txt = f.result()
            leituras.append((t, anterior_txt))

    # cada linha distinta vira uma entrada com intervalo [primeira, última aparição]
    abertas: dict[str, Legenda] = {}
    saida: list[Legenda] = []
    intervalo = 1.0 / fps
    for t, linhas in leituras:
        vistas = set()
        for lin in linhas:
            chave = next((k for k in abertas if similaridade(k, lin) >= 0.8), None)
            if chave:
                abertas[chave].t_fim = t + intervalo
                vistas.add(chave)
            else:
                abertas[lin] = Legenda(t, t + intervalo, lin, origem="tela")
                vistas.add(lin)
        for k in list(abertas):
            if k not in vistas:
                saida.append(abertas.pop(k))
    saida.extend(abertas.values())
    saida.sort(key=lambda x: x.t_ini)
    return saida


def rodar_ocr(video: Path, info: InfoVideo) -> ResultadoOCR:
    faixa = detectar_faixa(video, info)
    if faixa is None:
        modo: Modo = "sem_legenda"
        taxa = 0.0
        legendas: list[Legenda] = []
        cru: list[dict] = []
    else:
        modo, taxa = detectar_modo(video, info, faixa)
        legendas, cru = extrair_legendas(video, info, faixa, modo)
        if not legendas:
            modo = "sem_legenda"
    tela = extrair_texto_tela(video, info, faixa if legendas else None)
    # o que a faixa já leu não precisa aparecer de novo como "tela"
    tela = [
        x for x in tela
        if not any(similaridade(x.texto, lg.texto) >= 0.7 for lg in legendas)
    ]
    return ResultadoOCR(modo, faixa, taxa, legendas, cru, tela)
