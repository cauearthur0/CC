"""Montagem do relatório: estatísticas, fontes consolidadas e exportação em Markdown."""

from __future__ import annotations

import math

from .llm.cliente import normalizar_url
from .llm.esquemas import VEREDITOS_CHECAVEIS
from .texto import hms

AVISO = "Checagem assistida por IA. Pode conter erros. Confira as fontes antes de compartilhar."

VEREDITOS: dict[str, dict[str, str]] = {
    "verdadeiro": {
        "rotulo": "Verdadeiro", "emoji": "✅",
        "definicao": "Confere com fontes confiáveis, sem distorção relevante.",
    },
    "parcial": {
        "rotulo": "Parcial", "emoji": "🟡",
        "definicao": "Tem base real, mas omite, exagera ou simplifica de forma que muda o sentido.",
    },
    "enganoso": {
        "rotulo": "Enganoso", "emoji": "🟠",
        "definicao": "Mistura fato real com conclusão que o fato não sustenta.",
    },
    "falso": {"rotulo": "Falso", "emoji": "❌", "definicao": "Contrariado por fontes confiáveis."},
    "sem_fonte": {
        "rotulo": "Sem fonte", "emoji": "❓",
        "definicao": "Citação/atribuição que não aparece em nenhuma fonte primária.",
    },
    "nao_checavel": {
        "rotulo": "Não checável", "emoji": "💬",
        "definicao": "Opinião, previsão, sarcasmo, chamada à ação.",
    },
}

TIPOS_ALEGACAO = {
    "fato": "Fato",
    "atribuicao_de_citacao": "Citação atribuída",
    "opiniao": "Opinião",
    "previsao": "Previsão",
    "chamada_a_acao": "Chamada à ação",
}


def rotulo_confianca(c: float | None) -> str:
    if c is None:
        return ""
    if c >= 0.75:
        return "alta"
    if c >= 0.5:
        return "média"
    return "baixa"


def porcentagens_maior_resto(contagens: dict[str, int]) -> dict[str, int]:
    """Porcentagens inteiras que somam exatamente 100 (método do maior resto)."""
    total = sum(contagens.values())
    if total == 0:
        return {k: 0 for k in contagens}
    brutas = {k: v * 100 / total for k, v in contagens.items()}
    inteiras = {k: math.floor(v) for k, v in brutas.items()}
    faltam = 100 - sum(inteiras.values())
    for k in sorted(brutas, key=lambda k: (brutas[k] - inteiras[k], contagens[k]), reverse=True)[:faltam]:
        inteiras[k] += 1
    return inteiras


def estatisticas(alegacoes: list[dict]) -> dict:
    """Contagem sobre as alegações. Porcentagens só sobre as checáveis verificadas."""
    por_veredito = {v: 0 for v in VEREDITOS}
    nao_verificadas = 0
    for a in alegacoes:
        if a.get("status") == "nao_verificada" or a.get("veredito") is None:
            if a.get("checavel"):
                nao_verificadas += 1
            else:
                por_veredito["nao_checavel"] += 1
            continue
        por_veredito[a["veredito"]] += 1
    checaveis = {v: por_veredito[v] for v in VEREDITOS_CHECAVEIS}
    n_checaveis = sum(checaveis.values())
    pct = porcentagens_maior_resto(checaveis)
    errado = pct["falso"] + pct["enganoso"]
    frase = ""
    if n_checaveis:
        frase = (
            f"Somando falso e enganoso, {errado} % do conteúdo checável está errado ou distorcido."
        )
        if checaveis["sem_fonte"]:
            frase += (
                f" Contando também as citações sem fonte, {errado + pct['sem_fonte']} %."
            )
    return {
        "total": len(alegacoes),
        "checaveis": n_checaveis,
        "nao_checaveis": por_veredito["nao_checavel"],
        "nao_verificadas": nao_verificadas,
        "por_veredito": por_veredito,
        "porcentagens": pct,
        "pct_errado_ou_distorcido": errado,
        "frase": frase,
    }


def fontes_consolidadas(alegacoes: list[dict]) -> list[dict]:
    vistas: dict[str, dict] = {}
    for a in alegacoes:
        for f in a.get("fontes", []):
            chave = normalizar_url(f["url"])
            if chave not in vistas:
                vistas[chave] = {**f, "alegacoes": []}
            if a["id"] not in vistas[chave]["alegacoes"]:
                vistas[chave]["alegacoes"].append(a["id"])
    ordem = {"primaria": 0, "checagem": 1, "academica": 2, "imprensa": 3}
    return sorted(vistas.values(), key=lambda f: (ordem.get(f.get("tipo", ""), 9), f["titulo"]))


def importantes(alegacoes: list[dict], n: int = 3) -> list[dict]:
    """As alegações mais importantes para o card: verificadas, por importância e gravidade."""
    gravidade = {"falso": 0, "sem_fonte": 1, "enganoso": 2, "parcial": 3, "verdadeiro": 4}
    cand = [a for a in alegacoes if a.get("veredito") in gravidade]
    cand.sort(key=lambda a: (-a.get("importancia", 2), gravidade[a["veredito"]], a["t_ini"]))
    return cand[:n]


# ------------------------------------------------------------------ Markdown


def markdown(rel: dict, url: str = "") -> str:
    L: list[str] = []
    titulo = rel.get("titulo") or "Checagem de vídeo"
    L.append(f"# {titulo}")
    meta = [f"Duração: {hms(rel['video']['duracao'])}", f"Checado em: {rel['checado_em'][:10]}"]
    if rel.get("autor_ou_conta"):
        meta.append(f"Conta: {rel['autor_ou_conta']}")
    L.append(" · ".join(meta))
    if url:
        L.append(f"Relatório: {url}")
    if rel.get("simulado"):
        L.append("\n> **RELATÓRIO SIMULADO** — gerado sem IA, só para demonstração.")
    L.append("")
    for linha in rel.get("resumo", []):
        L.append(f"> {linha}")
    L.append("")
    L.append("## Linha do tempo")
    for a in rel["alegacoes"]:
        v = a.get("veredito") or ("nao_checavel" if not a.get("checavel") else None)
        if v is None:
            L.append(f"- **{hms(a['t_ini'])}** — “{a['citacao']}” — ⏳ não verificada ({a.get('nota', '')})")
            continue
        meta_v = VEREDITOS[v]
        if v == "nao_checavel":
            L.append(f"- {hms(a['t_ini'])} — “{a['citacao']}” — {meta_v['emoji']} {meta_v['rotulo']} "
                     f"({TIPOS_ALEGACAO.get(a['tipo'], a['tipo']).lower()})")
            continue
        conf = rotulo_confianca(a.get("confianca"))
        L.append(f"- **{hms(a['t_ini'])}** — “{a['citacao']}”")
        L.append(f"  - {meta_v['emoji']} **{meta_v['rotulo']}** (confiança {conf}). {a.get('explicacao', '')}")
        if a.get("o_que_e_verdade_por_tras"):
            L.append(f"  - O que é verdade por trás: {a['o_que_e_verdade_por_tras']}")
        if a.get("fontes"):
            fontes = "; ".join(f"[{f['titulo']}]({f['url']})" for f in a["fontes"])
            L.append(f"  - Fontes: {fontes}")
    L.append("")
    L.append("## Acertos")
    if rel.get("acertos"):
        L += [f"- {x}" for x in rel["acertos"]]
    else:
        L.append("- Nenhum acerto factual identificado.")
    L.append("")
    est = rel["estatisticas"]
    L.append("## Contagem")
    L.append(f"{est['total']} alegações no total; {est['checaveis']} checáveis; "
             f"{est['nao_checaveis']} não checáveis (opinião, previsão, chamada à ação).")
    for v in VEREDITOS_CHECAVEIS:
        n = est["por_veredito"][v]
        L.append(f"- {VEREDITOS[v]['emoji']} {VEREDITOS[v]['rotulo']}: {n} ({est['porcentagens'][v]} %)")
    L.append(f"\nPorcentagens calculadas sobre as {est['checaveis']} alegações checáveis.")
    if est.get("frase"):
        L.append(f"\n**{est['frase']}**")
    if est.get("nao_verificadas"):
        L.append(f"\n{est['nao_verificadas']} alegação(ões) checável(is) não foram verificadas (veja limitações).")
    if rel.get("padrao_desinformacao"):
        L.append("\n## Como a desinformação é construída")
        L.append(rel["padrao_desinformacao"])
    L.append("\n## Limitações")
    L += [f"- {x}" for x in rel.get("limitacoes", [])] or ["- Nenhuma registrada."]
    L.append(f"\n_{AVISO}_")
    if rel.get("fontes_consolidadas"):
        L.append("\n## Fontes")
        for f in rel["fontes_consolidadas"]:
            L.append(f"- [{f['titulo']}]({f['url']}) — {f.get('tipo', '')}")
    return "\n".join(L) + "\n"
