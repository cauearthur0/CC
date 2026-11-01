"""4.8 Síntese (chamada 3): resumo, acertos, padrão da desinformação, limitações."""

from __future__ import annotations

import json
import logging

from ..config import config
from ..llm import prompts
from ..llm.cliente import ClienteLLM, chamar_json
from ..llm.custos import Uso
from ..llm.esquemas import SaidaSintese, schema_estrito

log = logging.getLogger(__name__)


def montar_mensagem(contexto: dict, alegacoes: list[dict], estatisticas: dict, limitacoes: list[str]) -> list[dict]:
    texto = (
        "CONTEXTO DO VÍDEO\n"
        f"{json.dumps(contexto, ensure_ascii=False, indent=1)}\n\n"
        "ALEGAÇÕES E VEREDITOS\n"
        f"<<VEREDITOS>>{json.dumps(alegacoes, ensure_ascii=False, indent=1)}<</VEREDITOS>>\n\n"
        "CONTAGEM (já calculada; use estes números, não recalcule)\n"
        f"{json.dumps(estatisticas, ensure_ascii=False, indent=1)}\n\n"
        "LIMITAÇÕES TÉCNICAS JÁ DETECTADAS PELO SISTEMA\n"
        + ("\n".join(f"- {x}" for x in limitacoes) if limitacoes else "- nenhuma")
        + "\n\nEscreva a síntese. Responda só com o JSON no formato pedido."
    )
    return [{"role": "user", "content": texto}]


def sintetizar(
    cliente: ClienteLLM, contexto: dict, alegacoes: list[dict], estatisticas: dict, limitacoes: list[str]
) -> tuple[SaidaSintese, Uso, str]:
    c = config()
    saida, resp, uso = chamar_json(
        cliente,
        SaidaSintese,
        etapa="synthesize",
        modelo=c.model_synthesize,
        system=prompts.carregar("synthesize"),
        mensagens=montar_mensagem(contexto, alegacoes, estatisticas, limitacoes),
        max_tokens=16000,
        effort=c.effort_synthesize,
        schema=schema_estrito(SaidaSintese),
    )
    saida.resumo = [x.strip() for x in saida.resumo if x.strip()][:3]
    return saida, uso, resp.modelo


def sintese_minima(estatisticas: dict, tese: str) -> SaidaSintese:
    """Usada se a chamada de síntese falhar: o relatório sai mesmo assim."""
    pv = estatisticas["por_veredito"]
    return SaidaSintese(
        titulo=(tese[:67] + "…") if len(tese) > 70 else (tese or "Vídeo checado"),
        resumo=[
            f"{estatisticas['checaveis']} alegações checáveis encontradas.",
            f"{pv.get('verdadeiro', 0)} verdadeiras, {pv.get('parcial', 0)} parciais, "
            f"{pv.get('enganoso', 0) + pv.get('falso', 0)} falsas ou enganosas, "
            f"{pv.get('sem_fonte', 0)} sem fonte.",
            "O resumo automático falhou; veja os detalhes de cada alegação abaixo.",
        ],
        acertos=[],
        padrao_desinformacao="",
        limitacoes=["A etapa de síntese falhou; resumo gerado só a partir da contagem."],
    )
