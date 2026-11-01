"""4.7 Checagem (chamada 2): uma chamada por alegação checável, com web search."""

from __future__ import annotations

import datetime as dt
import json
import logging
from dataclasses import dataclass, field

from ..config import config
from ..llm import prompts
from ..llm.cliente import ClienteLLM, chamar_json, dominio_registravel, normalizar_url
from ..llm.custos import Uso
from ..llm.esquemas import AlegacaoExtraida, SaidaVerificacao

log = logging.getLogger(__name__)


@dataclass
class ResultadoVerificacao:
    saida: SaidaVerificacao
    uso: Uso
    modelo: str
    fontes_descartadas: list[str] = field(default_factory=list)
    notas: list[str] = field(default_factory=list)
    do_cache: bool = False


def ferramentas_busca() -> list[dict]:
    c = config()
    bloqueados = c.lista_dominios_bloqueados
    busca: dict = {"type": "web_search_20260209", "name": "web_search", "max_uses": c.web_search_max_uses}
    if bloqueados:
        busca["blocked_domains"] = bloqueados
    tools = [busca]
    if c.web_fetch_max_uses > 0:
        fetch: dict = {
            "type": "web_fetch_20260209", "name": "web_fetch", "max_uses": c.web_fetch_max_uses,
            "max_content_tokens": c.web_fetch_max_content_tokens,
        }
        if bloqueados:
            fetch["blocked_domains"] = bloqueados
        tools.append(fetch)
    return tools


def montar_mensagem(
    alegacao: AlegacaoExtraida, tese_central: str, contexto_transcricao: str, hoje: dt.date
) -> list[dict]:
    dados = {
        "id": alegacao.id,
        "citacao": alegacao.citacao,
        "tipo": alegacao.tipo,
        "o_que_checar": alegacao.o_que_checar,
        "momento": f"{alegacao.t_ini:.0f}s–{alegacao.t_fim:.0f}s",
    }
    texto = (
        f"Data de hoje: {hoje.isoformat()}.\n\n"
        f"Tese central do vídeo (contexto, não é para checar): {tese_central}\n\n"
        "Trecho da transcrição ao redor da alegação:\n"
        f"{contexto_transcricao}\n\n"
        "ALEGAÇÃO A CHECAR:\n"
        f"<<ALEGACAO>>{json.dumps(dados, ensure_ascii=False)}<</ALEGACAO>>\n\n"
        "Pesquise, avalie e responda só com o JSON no formato pedido."
    )
    return [{"role": "user", "content": texto}]


def aplicar_regras(
    saida: SaidaVerificacao, fontes_vistas: dict[str, str], id_alegacao: int
) -> tuple[SaidaVerificacao, list[str], list[str]]:
    """Regras que não dependem do modelo obedecer:

    - só ficam fontes cujo URL apareceu de fato nos resultados de busca/fetch;
    - "verdadeiro"/"falso" com menos de 2 domínios independentes perdem confiança.
    """
    saida.id = id_alegacao
    notas: list[str] = []
    vistas = set(fontes_vistas)
    mantidas, descartadas = [], []
    for f in saida.fontes:
        if normalizar_url(f.url) in vistas:
            if not f.titulo.strip():
                f.titulo = fontes_vistas[normalizar_url(f.url)]
            mantidas.append(f)
        else:
            descartadas.append(f.url)
    if descartadas:
        log.warning("alegação %s: %d fonte(s) descartada(s) por não terem sido abertas na busca",
                    id_alegacao, len(descartadas))
    saida.fontes = mantidas
    if saida.veredito in ("verdadeiro", "falso"):
        dominios = {dominio_registravel(f.url) for f in mantidas}
        if len(dominios) < 2:
            saida.confianca = min(saida.confianca, 0.5)
            notas.append("Menos de duas fontes independentes localizadas para este veredito.")
    if saida.veredito == "sem_fonte" and not mantidas:
        notas.append("A busca não localizou fonte primária para a frase.")
    return saida, descartadas, notas


def verificar_alegacao(
    cliente: ClienteLLM,
    alegacao: AlegacaoExtraida,
    tese_central: str,
    contexto_transcricao: str,
    hoje: dt.date | None = None,
    max_usos_busca: int | None = None,
) -> ResultadoVerificacao:
    c = config()
    ferramentas = ferramentas_busca()
    if max_usos_busca is not None:
        ferramentas[0]["max_uses"] = max_usos_busca
    saida, resp, uso = chamar_json(
        cliente,
        SaidaVerificacao,
        etapa="verify",
        modelo=c.model_verify,
        system=prompts.carregar("verify"),
        mensagens=montar_mensagem(alegacao, tese_central, contexto_transcricao, hoje or dt.date.today()),
        max_tokens=32000,
        effort=c.effort_verify,
        ferramentas=ferramentas,
    )
    saida, descartadas, notas = aplicar_regras(saida, resp.fontes_vistas, alegacao.id)
    return ResultadoVerificacao(saida, uso, resp.modelo, descartadas, notas)
