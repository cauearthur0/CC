from checa.exportar import gerar_card, gerar_pdf
from checa.relatorio import (
    estatisticas,
    fontes_consolidadas,
    importantes,
    markdown,
    porcentagens_maior_resto,
    rotulo_confianca,
)


def _alegs(vereditos: list[str | None], nao_checaveis: int = 0) -> list[dict]:
    saida = []
    for i, v in enumerate(vereditos, 1):
        saida.append({
            "id": i, "t_ini": float(i * 5), "t_fim": float(i * 5 + 3), "citacao": f"alegação {i}",
            "tipo": "fato", "checavel": True, "veredito": v,
            "status": "verificada" if v else "nao_verificada", "importancia": 3 if i == 2 else 2,
            "confianca": 0.8, "explicacao": "explicação", "o_que_e_verdade_por_tras": "",
            "fontes": [{"titulo": f"Fonte {i % 2}", "url": f"https://exemplo.org/{i % 2}", "tipo": "primaria"}],
        })
    for j in range(nao_checaveis):
        saida.append({
            "id": 100 + j, "t_ini": 0.0, "t_fim": 1.0, "citacao": "opinião", "tipo": "opiniao",
            "checavel": False, "veredito": "nao_checavel", "status": "nao_checavel", "fontes": [],
        })
    return saida


def test_porcentagens_somam_100():
    p = porcentagens_maior_resto({"a": 1, "b": 1, "c": 1})
    assert sum(p.values()) == 100 and sorted(p.values()) == [33, 33, 34]
    assert porcentagens_maior_resto({"a": 0, "b": 0}) == {"a": 0, "b": 0}


def test_estatisticas_caso_b():
    """Gabarito do caso B: 15 checáveis — 2 verdadeiras, 5 parciais, 8 falsas/enganosas."""
    vereditos = ["verdadeiro"] * 2 + ["parcial"] * 5 + ["falso"] * 5 + ["enganoso"] * 3
    est = estatisticas(_alegs(vereditos, nao_checaveis=4))
    assert est["total"] == 19 and est["checaveis"] == 15 and est["nao_checaveis"] == 4
    assert est["por_veredito"]["falso"] == 5
    assert sum(est["porcentagens"].values()) == 100
    assert est["pct_errado_ou_distorcido"] == 53
    assert est["frase"] == "Somando falso e enganoso, 53 % do conteúdo checável está errado ou distorcido."


def test_estatisticas_caso_a_inclui_sem_fonte_na_frase():
    est = estatisticas(_alegs(["sem_fonte"] * 10 + ["falso"] * 2))
    assert est["porcentagens"]["verdadeiro"] == 0
    assert "Contando também as citações sem fonte, 100 %" in est["frase"]


def test_nao_verificadas_ficam_fora_da_porcentagem():
    est = estatisticas(_alegs(["falso", None, "verdadeiro"]))
    assert est["checaveis"] == 2 and est["nao_verificadas"] == 1
    assert est["porcentagens"]["falso"] == 50


def test_rotulo_confianca():
    assert [rotulo_confianca(x) for x in (0.9, 0.6, 0.2, None)] == ["alta", "média", "baixa", ""]


def test_fontes_consolidadas_e_importantes():
    alegs = _alegs(["falso", "verdadeiro", "parcial", "sem_fonte"])
    fontes = fontes_consolidadas(alegs)
    assert len(fontes) == 2 and fontes[0]["alegacoes"] in ([2, 4], [1, 3])
    top = importantes(alegs)
    assert top[0]["id"] == 2  # importância 3 vem primeiro
    assert [a["veredito"] for a in top[1:]] == ["falso", "sem_fonte"]


def _relatorio(simulado=False) -> dict:
    alegs = _alegs(["falso", "verdadeiro", "parcial"], nao_checaveis=1)
    alegs[0]["o_que_e_verdade_por_tras"] = "O julgamento existiu."
    return {
        "titulo": "Vídeo sobre decretos das redes sociais",
        "checado_em": "2026-11-01T12:00:00Z",
        "simulado": simulado,
        "video": {"duracao": 179.0},
        "autor_ou_conta": "@conta",
        "resumo": ["Linha 1", "Linha 2", "Linha 3"],
        "alegacoes": alegs,
        "acertos": ["O PL 2630 existiu."],
        "estatisticas": estatisticas(alegs),
        "padrao_desinformacao": "Fatos reais + troca de agente.",
        "limitacoes": ["Áudio pouco claro em 00:10–00:12."],
        "fontes_consolidadas": fontes_consolidadas(alegs),
    }


def test_markdown_segue_formato_do_relatorio_manual():
    md = markdown(_relatorio(), "https://checa.exemplo/checagem/abc")
    ordem = ["## Linha do tempo", "## Acertos", "## Contagem", "## Como a desinformação é construída",
             "## Limitações", "## Fontes"]
    posicoes = [md.index(x) for x in ordem]
    assert posicoes == sorted(posicoes)
    assert "❌ **Falso**" in md and "O que é verdade por trás: O julgamento existiu." in md
    assert "Porcentagens calculadas sobre as 3 alegações checáveis." in md
    assert "Checagem assistida por IA" in md
    assert "[Fonte 1](https://exemplo.org/1)" in md


def test_card_e_pdf():
    from PIL import Image
    import io

    png = gerar_card(_relatorio(simulado=True), "https://checa.exemplo/checagem/abc")
    img = Image.open(io.BytesIO(png))
    assert img.size == (1080, 1350)
    pdf = gerar_pdf(_relatorio(), "https://checa.exemplo/checagem/abc")
    assert pdf.startswith(b"%PDF") and len(pdf) > 2000
