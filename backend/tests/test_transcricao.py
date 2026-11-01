from checa.media.audio import Palavra, ResultadoAudio, SegmentoFala
from checa.media.ocr import Legenda
from checa.transcricao import comparar_legenda_fala, para_texto, unificar


def _seg(ini, fim, texto, conf=0.9):
    palavras = texto.split()
    passo = (fim - ini) / len(palavras)
    return SegmentoFala(
        ini, fim, texto, conf,
        [Palavra(ini + i * passo, ini + (i + 1) * passo, p) for i, p in enumerate(palavras)],
    )


AUDIO = ResultadoAudio(
    "fala",
    [
        _seg(0.0, 3.0, "Em 2023 eles tentaram passar o PL 2630"),
        _seg(3.5, 6.0, "e o Facebook recorreu ao Supremo"),
        _seg(7.0, 9.0, "isso é um absurdo total"),
    ],
)


def test_legenda_que_confere_com_erro_de_ocr():
    lg = Legenda(0.2, 2.9, "Em 2023 eles tentaram passar o PL 263O")
    estado, cob = comparar_legenda_fala(lg, AUDIO)
    assert estado == "confere" and cob >= 0.8


def test_legenda_divergente_e_marcada():
    lg = Legenda(3.6, 5.9, "o PT recorreu ao STF")  # áudio diz "Facebook recorreu ao Supremo"
    estado, _ = comparar_legenda_fala(lg, AUDIO)
    assert estado == "diverge"
    trechos = unificar(AUDIO, [lg], [])
    fala = next(t for t in trechos if t.texto.startswith("e o Facebook"))
    assert fala.divergencia is True
    assert fala.legenda == "o PT recorreu ao STF"
    assert "LEGENDA DIVERGE" in para_texto(trechos)


def test_merge_ordena_e_mantem_camadas():
    legendas = [
        Legenda(0.2, 2.9, "Em 2023 eles tentaram passar o PL 2630"),
        Legenda(12.0, 14.0, "frase que só aparece na legenda"),
    ]
    tela = [Legenda(0.0, 3.0, "URGENTE! O Lula aproveitou", origem="tela")]
    trechos = unificar(AUDIO, legendas, tela)
    origens = [(t.origem, round(t.t_ini, 1)) for t in trechos]
    assert origens[0] == ("tela", 0.0)
    assert origens[1] == ("fala", 0.0)
    assert ("legenda", 12.0) in origens
    primeira_fala = trechos[1]
    assert primeira_fala.legenda_confere is True and not primeira_fala.divergencia


def test_sem_audio_usa_so_legenda():
    audio = ResultadoAudio("sem_audio", [])
    legendas = [Legenda(1, 4, "Lenin disse: usaremos o idiota útil")]
    trechos = unificar(audio, legendas, [])
    assert [t.origem for t in trechos] == ["legenda"]
    assert trechos[0].divergencia is False


def test_texto_para_modelo_tem_timestamps():
    txt = para_texto(unificar(AUDIO, [], []))
    assert txt.splitlines()[0].startswith("[00:00–00:03] FALA:")
