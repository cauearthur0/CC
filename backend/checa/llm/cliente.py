"""Cliente do modelo: Anthropic (real) e simulado (testes/demonstração)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import BaseModel

from ..config import config
from .custos import Uso
from .jsonparse import JSONInvalido, validar_json

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

BETA_FALLBACK_DEFAULT = "server-side-fallback-2026-07-01"


class RecusaModelo(Exception):
    """O modelo recusou (stop_reason == "refusal") mesmo depois do fallback."""


@dataclass
class RespostaLLM:
    texto: str
    conteudo: list[Any]  # blocos crus, para reenviar como turno do assistente
    uso: Uso
    modelo: str
    stop_reason: str
    fontes_vistas: dict[str, str] = field(default_factory=dict)  # url normalizada → título
    chamadas_ferramenta: list[dict] = field(default_factory=list)  # tool_use do cliente


class ClienteLLM(Protocol):
    simulado: bool

    def criar(
        self,
        *,
        etapa: str,
        modelo: str,
        system: str,
        mensagens: list[dict],
        max_tokens: int,
        effort: str,
        ferramentas: list[dict] | None = None,
        schema: dict | None = None,
    ) -> RespostaLLM: ...


# ------------------------------------------------------------------ URLs


_RASTREIO = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}


def normalizar_url(url: str) -> str:
    try:
        p = urlsplit(url.strip())
    except ValueError:
        return url.strip()
    host = p.netloc.lower().removeprefix("www.")
    q = urlencode([(k, v) for k, v in parse_qsl(p.query) if k.lower() not in _RASTREIO])
    caminho = p.path.rstrip("/") or ""
    return urlunsplit(("https" if p.scheme in ("http", "https") else p.scheme, host, caminho, q, ""))


def dominio_registravel(url: str) -> str:
    host = urlsplit(url).netloc.lower().removeprefix("www.").split(":")[0]
    partes = host.split(".")
    if len(partes) >= 3 and partes[-2] in {"com", "gov", "org", "jus", "leg", "edu", "net", "mil", "co", "ac"}:
        return ".".join(partes[-3:])
    return ".".join(partes[-2:])


# ------------------------------------------------------------------ Anthropic


def _fontes_dos_blocos(blocos: list[Any]) -> dict[str, str]:
    vistas: dict[str, str] = {}
    for b in blocos:
        tipo = getattr(b, "type", None)
        if tipo == "web_search_tool_result":
            conteudo = getattr(b, "content", None)
            if isinstance(conteudo, list):  # em erro, vem um objeto, não lista
                for r in conteudo:
                    url = getattr(r, "url", None)
                    if url:
                        vistas[normalizar_url(url)] = getattr(r, "title", "") or url
        elif tipo == "web_fetch_tool_result":
            c = getattr(b, "content", None)
            url = getattr(c, "url", None)
            if url:
                doc = getattr(c, "content", None)
                vistas[normalizar_url(url)] = getattr(doc, "title", None) or url
        elif tipo == "text":
            for cit in getattr(b, "citations", None) or []:
                url = getattr(cit, "url", None)
                if url:
                    vistas.setdefault(normalizar_url(url), getattr(cit, "title", "") or url)
    return vistas


def _texto_final(blocos: list[Any]) -> str:
    """Texto depois do último bloco de ferramenta (é onde fica o JSON final)."""
    ultimo = -1
    for i, b in enumerate(blocos):
        if getattr(b, "type", "") in (
            "server_tool_use", "web_search_tool_result", "web_fetch_tool_result", "tool_use",
        ) or getattr(b, "type", "").endswith("_tool_result"):
            ultimo = i
    textos = [getattr(b, "text", "") for b in blocos[ultimo + 1 :] if getattr(b, "type", "") == "text"]
    if not "".join(textos).strip():
        textos = [getattr(b, "text", "") for b in blocos if getattr(b, "type", "") == "text"]
    return "".join(textos)


def _uso_da_mensagem(msg: Any) -> Uso:
    u = msg.usage
    stu = getattr(u, "server_tool_use", None)
    return Uso(
        entrada=u.input_tokens or 0,
        saida=u.output_tokens or 0,
        cache_escrita=getattr(u, "cache_creation_input_tokens", 0) or 0,
        cache_leitura=getattr(u, "cache_read_input_tokens", 0) or 0,
        buscas=getattr(stu, "web_search_requests", 0) or 0 if stu else 0,
        fetches=getattr(stu, "web_fetch_requests", 0) or 0 if stu else 0,
        chamadas=1,
    )


class ClienteAnthropic:
    simulado = False
    _sem_web_fetch = False  # vira True se a API recusar o web_fetch (ex.: rede restrita)

    def __init__(self, api_key: str | None = None):
        import anthropic

        c = config()
        self._anthropic = anthropic
        chave = api_key or c.anthropic_api_key or None
        self.client = anthropic.Anthropic(api_key=chave, max_retries=3, timeout=600.0)
        self.fallbacks = c.fallbacks.strip()
        self.structured = c.usar_structured_outputs

    def criar(
        self,
        *,
        etapa: str,
        modelo: str,
        system: str,
        mensagens: list[dict],
        max_tokens: int,
        effort: str,
        ferramentas: list[dict] | None = None,
        schema: dict | None = None,
    ) -> RespostaLLM:
        params: dict[str, Any] = {
            "model": modelo,
            "max_tokens": max_tokens,
            # o system prompt é idêntico entre as alegações: cacheável
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": list(mensagens),
            "output_config": {"effort": effort},
        }
        if ferramentas:
            params["tools"] = ferramentas
        usar_schema = bool(schema) and self.structured
        usar_fallback = bool(self.fallbacks)
        # Recursos opcionais saem um de cada vez se a API responder 400 (um 400 não é cobrado):
        # primeiro o web_fetch (a busca continua), depois structured outputs e fallbacks.
        # O que for recusado fica desligado nas próximas chamadas deste processo.
        degradacoes = ["web_fetch", "schema_fallback"]
        while True:
            p = dict(params)
            p["output_config"] = dict(params["output_config"])
            if ferramentas and ClienteAnthropic._sem_web_fetch:
                p["tools"] = [t for t in ferramentas if t.get("name") != "web_fetch"]
            betas: list[str] = []
            if usar_schema:
                p["output_config"]["format"] = {"type": "json_schema", "schema": schema}
            if usar_fallback:
                betas.append(BETA_FALLBACK_DEFAULT)
                p["fallbacks"] = self.fallbacks
            try:
                return self._executar(p, betas, modelo)
            except self._anthropic.BadRequestError as e:
                tem_fetch = any(t.get("name") == "web_fetch" for t in p.get("tools", []))
                while degradacoes:
                    proxima = degradacoes.pop(0)
                    if proxima == "web_fetch" and tem_fetch:
                        log.warning("[%s] 400; repetindo sem web_fetch: %s", etapa, e)
                        ClienteAnthropic._sem_web_fetch = True
                        break
                    if proxima == "schema_fallback" and (usar_schema or usar_fallback):
                        log.warning("[%s] 400; repetindo sem structured outputs e fallbacks: %s", etapa, e)
                        usar_schema = usar_fallback = False
                        break
                else:
                    raise

    def _executar(self, params: dict, betas: list[str], modelo: str) -> RespostaLLM:
        uso = Uso()
        conteudo: list[Any] = []
        mensagens_base = params["messages"]
        msg = None
        for _ in range(5):  # retomadas de pause_turn (loop de ferramentas do servidor)
            kwargs = dict(params)
            if betas:
                kwargs["betas"] = betas
            with self.client.beta.messages.stream(**kwargs) as stream:
                msg = stream.get_final_message()
            uso.somar(_uso_da_mensagem(msg))
            conteudo.extend(msg.content)
            if msg.stop_reason == "pause_turn":
                params = dict(params)
                params["messages"] = [*mensagens_base, {"role": "assistant", "content": conteudo}]
                continue
            break
        assert msg is not None
        if msg.stop_reason == "refusal":
            categoria = getattr(getattr(msg, "stop_details", None), "category", None)
            raise RecusaModelo(f"o modelo recusou (categoria: {categoria})")
        chamadas = [
            {"id": b.id, "name": b.name, "input": b.input}
            for b in conteudo if getattr(b, "type", "") == "tool_use"
        ]
        return RespostaLLM(
            texto=_texto_final(conteudo),
            conteudo=conteudo,
            uso=uso,
            modelo=getattr(msg, "model", modelo),
            stop_reason=msg.stop_reason or "",
            fontes_vistas=_fontes_dos_blocos(conteudo),
            chamadas_ferramenta=chamadas,
        )


# ------------------------------------------------------------------ chamada com retry de JSON


def chamar_json(
    cliente: ClienteLLM,
    modelo_saida: type[T],
    *,
    etapa: str,
    modelo: str,
    system: str,
    mensagens: list[dict],
    max_tokens: int,
    effort: str,
    ferramentas: list[dict] | None = None,
    schema: dict | None = None,
    tentativas_json: int = 2,
) -> tuple[T, RespostaLLM, Uso]:
    """Chama o modelo e valida a saída. Se o JSON vier inválido, devolve o erro ao modelo
    (anexando ao histórico, sem reescrevê-lo) e pede só o JSON corrigido."""
    uso_total = Uso()
    fontes: dict[str, str] = {}
    msgs = list(mensagens)
    ultimo_erro: JSONInvalido | None = None
    for tentativa in range(tentativas_json + 1):
        resp = cliente.criar(
            etapa=etapa, modelo=modelo, system=system, mensagens=msgs, max_tokens=max_tokens,
            effort=effort, ferramentas=ferramentas, schema=schema,
        )
        uso_total.somar(resp.uso)
        fontes.update(resp.fontes_vistas)
        try:
            saida = validar_json(resp.texto, modelo_saida)
            resp.fontes_vistas = fontes
            return saida, resp, uso_total
        except JSONInvalido as e:
            ultimo_erro = e
            log.warning("[%s] JSON inválido (tentativa %d): %s", etapa, tentativa + 1, e.motivo)
            msgs = [
                *msgs,
                {"role": "assistant", "content": resp.conteudo or [{"type": "text", "text": resp.texto or "(vazio)"}]},
                {
                    "role": "user",
                    "content": (
                        f"Sua resposta não pôde ser lida: {e.motivo}. "
                        "Responda de novo só com o objeto JSON completo e válido, no formato pedido, "
                        "sem texto antes ou depois e sem fazer novas buscas."
                    ),
                },
            ]
    assert ultimo_erro is not None
    raise ultimo_erro


def criar_cliente() -> ClienteLLM:
    c = config()
    if c.llm_provedor == "simulado":
        from .simulado import ClienteSimulado

        return ClienteSimulado()
    return ClienteAnthropic()
