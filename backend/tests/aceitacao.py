"""Comparação de um relatório com um gabarito (tolerâncias do spec, §7).

- contagem de checáveis: ± tolerância (1);
- contagem por veredito: ± 1 (alvo) ou limites min/max;
- veredito por alegação esperada: igual ou adjacente (falso↔enganoso, verdadeiro↔parcial).
"""

from __future__ import annotations

from checa.llm.cliente import dominio_registravel
from checa.texto import normalizar

ADJACENTES = {
    "falso": {"enganoso"},
    "enganoso": {"falso"},
    "verdadeiro": {"parcial"},
    "parcial": {"verdadeiro"},
}


def _contem_algum(texto: str, alternativas: list[str]) -> bool:
    t = f" {normalizar(texto)} "
    return any(normalizar(a) and f"{normalizar(a)}" in t if not a.startswith(" ") else f" {normalizar(a)} " in t
               for a in alternativas)


def _casa(texto: str, grupos: list[list[str]]) -> bool:
    """Cada grupo é um E; dentro do grupo, alternativas em OU."""
    return all(_contem_algum(texto, g) for g in grupos)


def veredito_aceito(obtido: str | None, esperados: list[str]) -> bool:
    if obtido is None:
        return False
    if obtido in esperados:
        return True
    return any(obtido in ADJACENTES.get(e, set()) for e in esperados)


def _contar(rel: dict, chave: str) -> int:
    pv = rel["estatisticas"]["por_veredito"]
    return sum(pv.get(k, 0) for k in chave.split("+"))


def comparar(rel: dict, gab: dict) -> list[str]:
    falhas: list[str] = []
    est = rel["estatisticas"]
    tol = gab.get("tolerancia_contagem", 1)
    if abs(est["checaveis"] - gab["checaveis"]) > tol:
        falhas.append(f"checáveis: {est['checaveis']} (esperado {gab['checaveis']} ± {tol})")
    for chave, regra in gab.get("contagem", {}).items():
        n = _contar(rel, chave)
        if "alvo" in regra and abs(n - regra["alvo"]) > tol:
            falhas.append(f"{chave}: {n} (esperado {regra['alvo']} ± {tol})")
        if "min" in regra and n < regra["min"]:
            falhas.append(f"{chave}: {n} (esperado ≥ {regra['min']})")
        if "max" in regra and n > regra["max"]:
            falhas.append(f"{chave}: {n} (esperado ≤ {regra['max']})")

    for esp in gab.get("alegacoes_esperadas", []):
        candidatas = [a for a in rel["alegacoes"] if _casa(a["citacao"], esp["palavras_chave"])]
        if not candidatas:
            falhas.append(f"alegação não encontrada: {esp['nome']}")
            continue
        boas = [a for a in candidatas if veredito_aceito(a.get("veredito"), esp["vereditos"])]
        if not boas:
            obtidos = sorted({str(a.get("veredito")) for a in candidatas})
            falhas.append(f"{esp['nome']}: veredito {obtidos} (esperado {esp['vereditos']} ou adjacente)")
            continue
        if "explicacao_contem" in esp and not any(
            _casa(f"{a.get('explicacao', '')} {a.get('o_que_e_verdade_por_tras', '')}", esp["explicacao_contem"])
            for a in boas
        ):
            falhas.append(f"{esp['nome']}: explicação não menciona {esp['explicacao_contem']}")
        if "fontes_de_algum_dominio" in esp:
            dominios = {dominio_registravel(f["url"]) for a in boas for f in a.get("fontes", [])}
            alvo = {dominio_registravel("https://" + d) for d in esp["fontes_de_algum_dominio"]}
            if not dominios & alvo:
                falhas.append(f"{esp['nome']}: nenhuma fonte de {sorted(alvo)} (veio {sorted(dominios)})")

    acertos = " ".join(rel.get("acertos", []))
    for grupo in gab.get("acertos_contem", []):
        if not _contem_algum(acertos, grupo):
            falhas.append(f"acertos não mencionam {grupo}")
    for grupo in gab.get("descricao_contem", []):
        if not _contem_algum(rel.get("descricao_video", ""), grupo):
            falhas.append(f"descrição do vídeo não menciona {grupo}")
    for grupo in gab.get("padrao_contem", []):
        if not _contem_algum(rel.get("padrao_desinformacao", ""), grupo):
            falhas.append(f"padrão de desinformação não menciona {grupo}")
    return falhas
