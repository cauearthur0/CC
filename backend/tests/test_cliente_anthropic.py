"""O cliente real do SDK da Anthropic contra um servidor local que fala o protocolo de
streaming da Messages API. Não usa rede nem chave de verdade."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from checa.llm.cliente import BETA_FALLBACK_DEFAULT, ClienteAnthropic

URL_FONTE = "https://www.planalto.gov.br/ccivil_03/decreto/d12975.htm"


def _evento(tipo: str, dados: dict) -> bytes:
    return f"event: {tipo}\ndata: {json.dumps(dados)}\n\n".encode()


def _resposta_sse(texto_final: str) -> bytes:
    msg = {
        "id": "msg_teste", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": [], "stop_reason": None, "stop_sequence": None,
        "usage": {"input_tokens": 1200, "output_tokens": 1, "cache_read_input_tokens": 300},
    }
    partes = [
        _evento("message_start", {"type": "message_start", "message": msg}),
        _evento("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {
            "type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": {}}}),
        _evento("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {
            "type": "input_json_delta", "partial_json": '{"query": "decreto 12.975"}'}}),
        _evento("content_block_stop", {"type": "content_block_stop", "index": 0}),
        _evento("content_block_start", {"type": "content_block_start", "index": 1, "content_block": {
            "type": "web_search_tool_result", "tool_use_id": "srvtoolu_1", "content": [{
                "type": "web_search_result", "url": URL_FONTE, "title": "Decreto nº 12.975",
                "encrypted_content": "xyz", "page_age": "2026-05-20"}]}}),
        _evento("content_block_stop", {"type": "content_block_stop", "index": 1}),
        _evento("content_block_start", {"type": "content_block_start", "index": 2, "content_block": {
            "type": "text", "text": ""}}),
        _evento("content_block_delta", {"type": "content_block_delta", "index": 2, "delta": {
            "type": "text_delta", "text": texto_final}}),
        _evento("content_block_stop", {"type": "content_block_stop", "index": 2}),
        _evento("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                                  "usage": {"output_tokens": 250, "server_tool_use": {"web_search_requests": 1}}}),
        _evento("message_stop", {"type": "message_stop"}),
    ]
    return b"".join(partes)


@pytest.fixture
def servidor():
    estado = {"pedidos": [], "recusar_fallback": False, "recusar_fetch": False}
    ClienteAnthropic._sem_web_fetch = False

    class Manipulador(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):
            corpo = json.loads(self.rfile.read(int(self.headers["content-length"])))
            estado["pedidos"].append({"corpo": corpo, "beta": self.headers.get("anthropic-beta", "")})
            tem_fetch = any(t.get("name") == "web_fetch" for t in corpo.get("tools", []))
            if (estado["recusar_fallback"] and "fallbacks" in corpo) or (estado["recusar_fetch"] and tem_fetch):
                resposta = json.dumps({"type": "error", "error": {"type": "invalid_request_error",
                                                                  "message": "fallbacks: not supported"}}).encode()
                self.send_response(400)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(resposta)))
                self.end_headers()
                self.wfile.write(resposta)
                return
            dados = _resposta_sse('{"id": 1, "veredito": "parcial"}')
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Manipulador)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    estado["url"] = f"http://127.0.0.1:{srv.server_address[1]}"
    yield estado
    srv.shutdown()


def _cliente(url: str) -> ClienteAnthropic:
    import anthropic

    c = ClienteAnthropic(api_key="sk-ant-teste")
    c.client = anthropic.Anthropic(api_key="sk-ant-teste", base_url=url, max_retries=0)
    return c


FERRAMENTAS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 6, "blocked_domains": ["exemplo-bloqueado.com"]},
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 3, "max_content_tokens": 8000},
]


def test_pedido_e_resposta_com_busca(servidor):
    resp = _cliente(servidor["url"]).criar(
        etapa="verify", modelo="claude-opus-5-5", system="regras", effort="medium", max_tokens=32000,
        mensagens=[{"role": "user", "content": "checar"}], ferramentas=FERRAMENTAS,
        schema={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    )
    pedido = servidor["pedidos"][0]
    corpo = pedido["corpo"]
    assert corpo["model"] == "claude-opus-5-5" and corpo["stream"] is True
    assert corpo["fallbacks"] == "default" and BETA_FALLBACK_DEFAULT in pedido["beta"]
    assert corpo["output_config"]["effort"] == "medium"
    assert corpo["output_config"]["format"]["type"] == "json_schema"
    assert corpo["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert corpo["tools"][0]["type"] == "web_search_20260209"
    assert "thinking" not in corpo and "temperature" not in corpo

    assert resp.texto == '{"id": 1, "veredito": "parcial"}'
    assert resp.stop_reason == "end_turn"
    assert resp.fontes_vistas == {"https://planalto.gov.br/ccivil_03/decreto/d12975.htm": "Decreto nº 12.975"}
    assert resp.uso.entrada == 1200 and resp.uso.saida == 250
    assert resp.uso.cache_leitura == 300 and resp.uso.buscas == 1


def test_repete_sem_recursos_opcionais_quando_recusados(servidor):
    servidor["recusar_fallback"] = True
    resp = _cliente(servidor["url"]).criar(
        etapa="verify", modelo="claude-opus-5-5", system="regras", effort="medium", max_tokens=1000,
        mensagens=[{"role": "user", "content": "checar"}], ferramentas=FERRAMENTAS,
    )
    # 1º sem web_fetch (ainda com fallbacks → recusado), 2º sem fallbacks também
    assert len(servidor["pedidos"]) == 3
    assert "fallbacks" not in servidor["pedidos"][2]["corpo"]
    assert resp.texto.startswith('{"id": 1')


def test_web_fetch_recusado_sai_e_fica_desligado(servidor):
    """Caso real: a API recusa web_fetch vindo de rede restrita. A busca continua."""
    servidor["recusar_fetch"] = True
    cliente = _cliente(servidor["url"])
    for _ in range(2):
        resp = cliente.criar(
            etapa="verify", modelo="claude-opus-5-5", system="regras", effort="medium", max_tokens=1000,
            mensagens=[{"role": "user", "content": "checar"}], ferramentas=FERRAMENTAS,
        )
        assert resp.texto.startswith('{"id": 1')
    corpos = [p["corpo"] for p in servidor["pedidos"]]
    assert len(corpos) == 3  # recusa, sucesso sem fetch, e a 2ª chamada já vai sem fetch
    assert [t["name"] for t in corpos[1]["tools"]] == ["web_search"]
    assert corpos[1]["fallbacks"] == "default"  # fallbacks preservados
    assert [t["name"] for t in corpos[2]["tools"]] == ["web_search"]
