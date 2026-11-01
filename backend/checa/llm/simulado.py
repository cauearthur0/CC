"""Clientes falsos do modelo, sem rede.

`ClienteSimulado` gera saídas determinísticas a partir do próprio pedido (transcrição,
alegação). Serve para testes de ponta a ponta e para ver a interface funcionando sem
chave de API. Todo relatório gerado assim sai marcado como "simulado" na interface.

`ClienteRoteirizado` devolve respostas pré-definidas, em ordem, por etapa (testes de retry).
"""

from __future__ import annotations

import json
import re
from collections import defaultdict, deque

from .cliente import RespostaLLM, normalizar_url
from .custos import Uso

_LINHA = re.compile(r"^\[(\d+):(\d+)(?::(\d+))?–(\d+):(\d+)(?::(\d+))?\] (FALA|LEGENDA)[^:]*: \"(.+?)\"")
_MARCA_JSON = re.compile(r"<<(ALEGACAO|VEREDITOS)>>\s*(.+?)\s*<</\1>>", re.DOTALL)

_CICLO = ["falso", "verdadeiro", "parcial", "enganoso", "sem_fonte", "falso"]


def _seg(h_ou_m: str, m_ou_s: str, s: str | None) -> float:
    if s is None:
        return int(h_ou_m) * 60 + int(m_ou_s)
    return int(h_ou_m) * 3600 + int(m_ou_s) * 60 + int(s)


def _texto_usuario(mensagens: list[dict]) -> str:
    partes = []
    for m in mensagens:
        if m["role"] != "user":
            continue
        c = m["content"]
        if isinstance(c, str):
            partes.append(c)
        else:
            partes += [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"]
    return "\n".join(partes)


class ClienteSimulado:
    simulado = True

    def criar(self, *, etapa, modelo, system, mensagens, max_tokens, effort, ferramentas=None, schema=None):
        texto = _texto_usuario(mensagens)
        fontes: dict[str, str] = {}
        if etapa == "extract":
            saida = self._extrair(texto)
        elif etapa == "verify":
            saida, fontes = self._verificar(texto)
        else:
            saida = self._sintetizar(texto)
        corpo = json.dumps(saida, ensure_ascii=False)
        return RespostaLLM(
            texto=corpo,
            conteudo=[{"type": "text", "text": corpo}],
            uso=Uso(entrada=len(texto) // 4, saida=len(corpo) // 4, chamadas=1),
            modelo=modelo,
            stop_reason="end_turn",
            fontes_vistas=fontes,
        )

    def _extrair(self, texto: str) -> dict:
        alegacoes = []
        for linha in texto.splitlines():
            m = _LINHA.match(linha.strip())
            if not m:
                continue
            g = m.groups()
            ini, fim = _seg(g[0], g[1], g[2]), _seg(g[3], g[4], g[5])
            frase = g[7]
            i = len(alegacoes) + 1
            opiniao = frase.endswith("!") or i % 4 == 0
            alegacoes.append({
                "id": i, "t_ini": float(ini), "t_fim": float(max(fim, ini + 1)), "citacao": frase,
                "tipo": "opiniao" if opiniao else "fato", "checavel": not opiniao,
                "o_que_checar": "" if opiniao else f"É verdade que: {frase}?",
                "importancia": 3 if i == 1 else 2, "derivada_de": 0,
            })
        return {
            "descricao_video": "[SIMULADO] Vídeo vertical com legenda branca na parte de baixo da tela.",
            "autor_ou_conta": "",
            "tese_central": "[SIMULADO] Tese gerada sem IA para demonstração.",
            "alegacoes": alegacoes,
            "moderacao": {"conteudo_ilegal": False, "motivo": ""},
        }

    def _verificar(self, texto: str) -> tuple[dict, dict[str, str]]:
        m = next((x for x in _MARCA_JSON.finditer(texto) if x.group(1) == "ALEGACAO"), None)
        alegacao = json.loads(m.group(2)) if m else {"id": 0, "citacao": ""}
        veredito = _CICLO[(alegacao["id"] - 1) % len(_CICLO)]
        url1 = f"https://exemplo.org/fonte-primaria/{alegacao['id']}"
        url2 = f"https://exemplo.net/checagem/{alegacao['id']}"
        fontes = [
            {"titulo": "Fonte primária (simulada)", "url": url1, "tipo": "primaria", "trecho": ""},
            {"titulo": "Agência de checagem (simulada)", "url": url2, "tipo": "checagem", "trecho": ""},
        ]
        saida = {
            "id": alegacao["id"],
            "veredito": veredito,
            "confianca": 0.8,
            "explicacao": "[SIMULADO] Explicação de demonstração, gerada sem consultar fontes.",
            "o_que_e_verdade_por_tras": "" if veredito == "verdadeiro" else "[SIMULADO] O fato real por trás.",
            "fontes": fontes,
        }
        return saida, {normalizar_url(url1): fontes[0]["titulo"], normalizar_url(url2): fontes[1]["titulo"]}

    def _sintetizar(self, texto: str) -> dict:
        return {
            "titulo": "Vídeo de demonstração (simulado)",
            "resumo": [
                "[SIMULADO] Este relatório foi gerado sem IA, só para testar a interface.",
                "[SIMULADO] Os vereditos foram sorteados em ciclo, não checados.",
                "[SIMULADO] Configure a chave da API para uma checagem real.",
            ],
            "acertos": ["[SIMULADO] Exemplo de acerto do vídeo."],
            "padrao_desinformacao": "",
            "limitacoes": ["Relatório simulado: nenhuma fonte foi consultada."],
        }


class ClienteRoteirizado:
    """Devolve, por etapa, as respostas de texto fornecidas, na ordem."""

    simulado = True

    def __init__(self, roteiro: dict[str, list[str]], fontes: dict[str, dict[str, str]] | None = None):
        self.roteiro = {k: deque(v) for k, v in roteiro.items()}
        self.fontes = fontes or {}
        self.chamadas: dict[str, list[list[dict]]] = defaultdict(list)

    def criar(self, *, etapa, modelo, system, mensagens, max_tokens, effort, ferramentas=None, schema=None):
        self.chamadas[etapa].append(list(mensagens))
        texto = self.roteiro[etapa].popleft()
        return RespostaLLM(
            texto=texto,
            conteudo=[{"type": "text", "text": texto}],
            uso=Uso(entrada=1000, saida=200, buscas=2 if etapa == "verify" else 0, chamadas=1),
            modelo=modelo,
            stop_reason="end_turn",
            fontes_vistas={normalizar_url(u): t for u, t in self.fontes.get(etapa, {}).items()},
        )
