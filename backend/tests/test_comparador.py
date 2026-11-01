"""O comparador dos testes de aceitação também precisa estar certo."""

import json
from pathlib import Path

from checa.relatorio import estatisticas

from .aceitacao import comparar, veredito_aceito

GAB_B = json.loads((Path(__file__).parent / "gabaritos" / "caso_b_decretos.json").read_text())


def _a(i, citacao, veredito, explicacao="", fontes=()):
    return {"id": i, "t_ini": float(i), "t_fim": i + 1.0, "citacao": citacao, "tipo": "fato", "checavel": True,
            "veredito": veredito, "status": "verificada", "explicacao": explicacao,
            "o_que_e_verdade_por_tras": "", "fontes": [{"url": u, "titulo": u} for u in fontes]}


def _rel_caso_b(trocar_pt_por: str = "falso") -> dict:
    alegs = [
        _a(1, "Em 2023 eles tentaram passar o PL 2.630 na Câmara", "verdadeiro"),
        _a(2, "O relator era do PCdoB", "verdadeiro"),
        _a(3, "O PT recorreu ao STF", trocar_pt_por, "Os recursos foram do Facebook e do Google."),
        _a(4, "Fizeram isso na calada da noite", "falso"),
        _a(5, "Vão derrubar seu vídeo sem direito de defesa", "enganoso"),
        _a(6, "Se você falar que o Lula é ladrão, derrubam", "falso", "Crimes contra a honra exigem ordem judicial."),
        _a(7, "Os decretos 12.975 e 12.976 dão poder à ANPD", "parcial"),
        _a(8, "Multa de até 10% do faturamento", "parcial"),
        _a(9, "a", "parcial"), _a(10, "b", "parcial"), _a(11, "c", "parcial"),
        _a(12, "d", "falso"), _a(13, "e", "falso"), _a(14, "f", "enganoso"), _a(15, "g", "falso"),
    ]
    return {
        "alegacoes": alegs, "estatisticas": estatisticas(alegs), "acertos": [], "descricao_video": "",
        "padrao_desinformacao": "Fatos reais com troca de agente, um mecanismo inventado e a omissão da "
                                "salvaguarda da ordem judicial.",
    }


def test_relatorio_compativel_passa():
    assert comparar(_rel_caso_b(), GAB_B) == []


def test_veredito_errado_e_apontado():
    falhas = comparar(_rel_caso_b(trocar_pt_por="verdadeiro"), GAB_B)
    assert any("PT recorreu" in f for f in falhas)


def test_adjacencia():
    assert veredito_aceito("enganoso", ["falso"])
    assert veredito_aceito("parcial", ["verdadeiro"])
    assert not veredito_aceito("verdadeiro", ["falso"])
    assert not veredito_aceito(None, ["falso"])
