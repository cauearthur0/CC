import numpy as np
import pytest
from PIL import Image

from checa.media.ocr import (
    agrupar_blocos,
    contar_linhas_texto,
    deduplicar,
    detectar_faixa_em_quadros,
    limpar_linha,
    mascara_legenda,
    mascara_quase_branco,
    preparar_para_ocr,
    reconstruir_cumulativa,
    taxa_de_mudanca,
    tesseract,
    transicoes_por_linha,
)
from checa.texto import similaridade

from .sintetico import desenhar_texto, fundo_bege_ruidoso, quadro_legenda


def _ampliar(q: np.ndarray) -> np.ndarray:
    return np.array(Image.fromarray(q).resize((q.shape[1] * 2, q.shape[0] * 2), Image.BICUBIC))


# ----------------------------------------------------------------- máscara (regressão do caso B)


@pytest.mark.parametrize("semente", [1, 2, 3, 7])
def test_regressao_mascara_quase_branco(semente):
    """Texto branco sobre fundo bege ruidoso: só a máscara recupera a frase.

    No caso B, o OCR cru devolvia lixo ("q "a pois ol ve 4 DO ads...") e a máscara devolvia
    "te impedir de falar". Este teste prova as duas metades: o cru falha, a máscara acerta.
    """
    alvo = "te impedir de falar"
    q = _ampliar(quadro_legenda(alvo, semente=semente))

    cru = " ".join(x.texto for x in tesseract(Image.fromarray(q).convert("L"), psm=7))
    assert limpar_linha(cru) != alvo, f"OCR cru não deveria acertar: {cru!r}"

    com_mascara = " ".join(x.texto for x in tesseract(preparar_para_ocr(mascara_legenda(q)), psm=7))
    assert limpar_linha(com_mascara) == alvo


def test_mascara_ignora_bege_e_pega_branco():
    img = np.zeros((2, 3, 3), dtype=np.uint8)
    img[0, 0] = (255, 255, 255)  # branco puro → texto
    img[0, 1] = (240, 230, 200)  # bege claro → fundo
    img[0, 2] = (230, 230, 230)  # cinza claro acima do limiar → texto
    img[1, :] = (250, 250, 210)  # amarelado → fundo (canal B baixo)
    m = mascara_quase_branco(img, 225)
    assert m.tolist() == [[True, False, True], [False, False, False]]


def test_preparar_para_ocr_inverte_e_poe_borda():
    m = np.zeros((10, 20), dtype=bool)
    m[3:7, 5:15] = True
    img = preparar_para_ocr(m, borda=30)
    assert img.size == (20 + 60, 10 + 60)
    arr = np.array(img)
    assert arr[0, 0] == 255  # borda branca
    assert arr[30 + 5, 30 + 10] == 0  # texto preto


def test_contar_linhas():
    uma = np.zeros((280, 1440, 3), dtype=np.uint8)
    uma = desenhar_texto(uma, "uma linha só", 100)
    assert contar_linhas_texto(mascara_quase_branco(uma)) == 1
    duas = np.zeros((280, 1440, 3), dtype=np.uint8)
    duas = desenhar_texto(duas, "primeira linha", 40)
    duas = desenhar_texto(duas, "segunda linha", 160)
    assert contar_linhas_texto(mascara_quase_branco(duas)) == 2


# ----------------------------------------------------------------- limpeza e dedupe


def test_limpar_linha_descarta_ruido():
    assert limpar_linha("q a p o l ve 4 DO") is None  # >40 % de tokens com 1 caractere
    assert limpar_linha("| te impedir de falar,") == "te impedir de falar"
    assert limpar_linha("   ") is None
    assert limpar_linha("12 34 56") is None  # sem letras suficientes
    assert limpar_linha("o decreto") == "o decreto"  # 2 tokens: começo de legenda cumulativa
    assert limpar_linha("o d") is None
    assert limpar_linha("O Lula assinou o decreto") == "O Lula assinou o decreto"


def test_deduplicar_consecutivos():
    obs = [(0, "te impedir"), (0.25, "te impedir"), (0.5, "Te impedir!"), (0.75, None), (1, None),
           (1.25, "te impedir")]
    assert deduplicar(obs) == [(0, "te impedir"), (0.75, None), (1.25, "te impedir")]


# ----------------------------------------------------------------- reconstrução cumulativa


def test_reconstrucao_cumulativa_mantem_versao_mais_longa():
    obs = [
        (0.0, "te"), (0.25, "te impedir"), (0.5, "te impedir de"), (0.75, "te impedir de falar"),
        (1.0, None), (1.25, None), (1.5, None),
        (1.75, "o PT"), (2.0, "o PT recorreu"), (2.25, "o PT recorreu ao STF"),
    ]
    leg = reconstruir_cumulativa(obs, 0.25)
    assert [x.texto for x in leg] == ["te impedir de falar", "o PT recorreu ao STF"]
    assert leg[0].t_ini == 0.0 and leg[0].t_fim == 1.0
    assert leg[1].t_ini == 1.75


def test_reconstrucao_tolera_erro_de_ocr_e_piscada():
    obs = [
        (0.0, "te impedlr"), (0.25, "te impedir de"), (0.5, None),  # 1 quadro perdido não quebra
        (0.75, "te impedir de falar"), (1.0, "te impedir de"),  # leitura mais curta (piscada)
    ]
    leg = reconstruir_cumulativa(obs, 0.25)
    assert [x.texto for x in leg] == ["te impedir de falar"]


def test_reconstrucao_janela_deslizante():
    obs = [(0, "eles querem te"), (0.25, "eles querem te impedir"), (0.5, "te impedir de falar")]
    leg = reconstruir_cumulativa(obs, 0.25)
    assert [x.texto for x in leg] == ["eles querem te impedir de falar"]


def test_reconstrucao_frase_nova_sem_pausa():
    obs = [(0, "o Lula"), (0.25, "o Lula assinou"), (0.5, "o amor venceu")]
    leg = reconstruir_cumulativa(obs, 0.25)
    assert [x.texto for x in leg] == ["o Lula assinou", "o amor venceu"]


def test_agrupar_blocos_escolhe_leitura_central():
    obs = [
        (0, "Lenin: usaremos o idiota util"), (1, "Lenin: usaremos o idiota útil"),
        (2, "Lenin usaremos o idiota útil"), (3, "Lenin: usaremos o idiota útil"),
        (4, None), (5, None),
        (6, "o ódio é a base do comunismo"), (7, "o odio e a base do comunismo"),
    ]
    leg = agrupar_blocos(obs, 1.0)
    assert len(leg) == 2
    assert leg[0].texto == "Lenin: usaremos o idiota útil"
    assert (leg[0].t_ini, leg[0].t_fim) == (0, 4)
    assert leg[1].t_ini == 6


# ----------------------------------------------------------------- faixa e modo


def _quadro_com_chapeu_e_legenda(texto: str | None, semente: int) -> np.ndarray:
    h, w = 640, 360
    q = np.full((h, w, 3), 90, dtype=np.uint8)
    q[20:90, 120:240] = 255  # chapéu branco no topo
    q[300:420, 90:270] = 250  # camiseta branca (bloco sólido)
    if texto:
        faixa = fundo_bege_ruidoso(w, 60, semente)
        q[440:500] = desenhar_texto(faixa, texto, 14, tamanho=24)
    return q


def test_detecta_faixa_ignora_chapeu_e_camiseta():
    textos = ["te impedir", "de falar", None, "o PT recorreu", "ao STF", "na calada", "da noite"]
    quadros = [(float(i), _quadro_com_chapeu_e_legenda(t, i)) for i, t in enumerate(textos * 3)]
    # sem recorte: varre o quadro inteiro (o chapéu e a camiseta estão lá)
    faixa = detectar_faixa_em_quadros(quadros, offset_y=0, altura_total=640)
    assert faixa is not None
    assert 420 <= faixa.y <= 458  # texto começa em ~459
    assert faixa.y + faixa.altura >= 482  # e termina em ~480
    assert faixa.altura < 130


def test_sem_legenda_nao_detecta_faixa():
    quadros = [(float(i), _quadro_com_chapeu_e_legenda(None, i)) for i in range(10)]
    assert detectar_faixa_em_quadros(quadros, offset_y=0, altura_total=640) is None


def test_transicoes_texto_vs_bloco():
    m = np.zeros((2, 100), dtype=bool)
    m[0, ::4] = True  # padrão de traços (texto)
    m[1, 20:80] = True  # bloco sólido (camiseta)
    tr = transicoes_por_linha(m)
    assert tr[0] > 20 and tr[1] == 1


def test_taxa_de_mudanca_palavra_vs_bloco():
    palavras = "eles querem te impedir de falar a verdade sobre isso agora".split()
    # palavra por palavra a 4 fps: uma palavra nova a cada 2 quadros
    seq_palavra = [
        mascara_legenda(quadro_legenda(" ".join(palavras[: 1 + i // 2]), semente=3)) for i in range(20)
    ]
    # bloco: a frase troca a cada 16 quadros (4 s)
    frases = ["eles querem te impedir", "de falar a verdade"]
    seq_bloco = [mascara_legenda(quadro_legenda(frases[i // 16], semente=3)) for i in range(20)]
    assert taxa_de_mudanca(seq_palavra, 4.0) >= 1.0
    assert taxa_de_mudanca(seq_bloco, 4.0) < 1.0
