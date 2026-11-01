"""4.6 Extração de alegações (chamada 1): transcrição + contact sheets → alegações."""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import Callable
from pathlib import Path

from ..config import config
from ..llm import prompts
from ..llm.cliente import ClienteLLM, chamar_json
from ..llm.custos import Uso
from ..llm.esquemas import SaidaExtracao, schema_estrito
from ..media.frames import ContactSheet
from ..texto import hms

log = logging.getLogger(__name__)

FERRAMENTA_VER_QUADRO = {
    "name": "ver_quadro",
    "description": (
        "Devolve um quadro do vídeo em resolução alta no instante pedido. Use quando um mosaico "
        "não deixar ler um texto importante (manchete, nome de conta, documento mostrado) ou "
        "identificar um detalhe que muda o sentido. Não use para conferir o que já está legível."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "t": {"type": "number", "description": "instante em segundos"},
            "motivo": {"type": "string", "description": "o que você quer ver"},
        },
        "required": ["t", "motivo"],
        "additionalProperties": False,
    },
}


def _imagem_b64(caminho: Path) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.standard_b64encode(caminho.read_bytes()).decode(),
        },
    }


def _resultado_erro(tool_use_id: str, texto: str) -> dict:
    return {"type": "tool_result", "tool_use_id": tool_use_id, "is_error": True, "content": texto}


def montar_mensagem(
    metadados: dict, transcricao_txt: str, folhas: list[ContactSheet]
) -> list[dict]:
    blocos: list[dict] = [
        {
            "type": "text",
            "text": (
                "METADADOS DO VÍDEO\n"
                f"{json.dumps(metadados, ensure_ascii=False, indent=1)}\n\n"
                "TRANSCRIÇÃO UNIFICADA (FALA = áudio transcrito; LEGENDA = texto queimado na faixa "
                "de legenda; TELA = outros textos que aparecem no quadro)\n"
                f"{transcricao_txt}"
            ),
        }
    ]
    for i, f in enumerate(folhas, 1):
        blocos.append({
            "type": "text",
            "text": (
                f"Mosaico {i}: {hms(f.t_ini)}–{hms(f.t_fim)} (um quadro a cada {f.intervalo:g} s, "
                "da esquerda para a direita, de cima para baixo; o tempo está no canto de cada quadro)"
            ),
        })
        blocos.append(_imagem_b64(f.caminho))
    blocos.append({
        "type": "text",
        "text": "Extraia as alegações seguindo as regras. Responda só com o JSON no formato pedido.",
    })
    return [{"role": "user", "content": blocos}]


def extrair_alegacoes(
    cliente: ClienteLLM,
    metadados: dict,
    transcricao_txt: str,
    folhas: list[ContactSheet],
    ver_quadro: Callable[[float], Path] | None,
    duracao: float,
) -> tuple[SaidaExtracao, Uso, str]:
    c = config()
    system = prompts.carregar("extract")
    mensagens = montar_mensagem(metadados, transcricao_txt, folhas)
    uso = Uso()
    modelo_usado = c.model_extract
    ferramentas = [FERRAMENTA_VER_QUADRO] if (ver_quadro and c.ver_quadro_max > 0) else None
    schema = schema_estrito(SaidaExtracao)

    # laço curto para atender pedidos de "ver melhor" (quadros em alta sob demanda)
    pedidos = 0
    resp = None
    for _ in range(c.ver_quadro_max + 2):
        resp = cliente.criar(
            etapa="extract", modelo=c.model_extract, system=system, mensagens=mensagens,
            max_tokens=32000, effort=c.effort_extract, ferramentas=ferramentas, schema=schema,
        )
        uso.somar(resp.uso)
        modelo_usado = resp.modelo
        if not resp.chamadas_ferramenta or ver_quadro is None:
            break
        resultados = []
        for ch in resp.chamadas_ferramenta:
            if pedidos >= c.ver_quadro_max:
                resultados.append(_resultado_erro(ch["id"], "Limite de quadros extras atingido. "
                                                  "Siga com o que já tem e responda com o JSON."))
                continue
            t = min(max(0.0, float(ch["input"].get("t", 0))), max(0.0, duracao - 0.05))
            pedidos += 1
            try:
                caminho = ver_quadro(t)
                resultados.append({
                    "type": "tool_result", "tool_use_id": ch["id"],
                    "content": [{"type": "text", "text": f"Quadro em {hms(t)}"}, _imagem_b64(caminho)],
                })
            except Exception as e:  # noqa: BLE001
                resultados.append(_resultado_erro(ch["id"], f"Não consegui extrair o quadro: {e}"))
        mensagens = [
            *mensagens,
            {"role": "assistant", "content": resp.conteudo},
            {"role": "user", "content": resultados},
        ]
    assert resp is not None

    from ..llm.jsonparse import JSONInvalido, validar_json

    try:
        if resp.chamadas_ferramenta:
            raise JSONInvalido("ainda pedindo quadros", resp.texto)
        saida = validar_json(resp.texto, SaidaExtracao)
    except JSONInvalido:
        # pede o JSON de novo, anexando ao histórico (sem reescrevê-lo)
        pendentes = [_resultado_erro(ch["id"], "Sem mais quadros.") for ch in resp.chamadas_ferramenta]
        pedido = {"type": "text", "text": "Sua resposta não veio no formato JSON pedido. "
                  "Responda só com o objeto JSON completo e válido."}
        if resp.chamadas_ferramenta and mensagens[-1]["role"] == "user":
            historico = mensagens  # o laço já anexou a resposta e os tool_result
            historico = [*historico[:-1], {"role": "user", "content": [*historico[-1]["content"], pedido]}]
        else:
            historico = [
                *mensagens,
                {"role": "assistant", "content": resp.conteudo},
                {"role": "user", "content": [*pendentes, pedido]},
            ]
        saida, _, uso2 = chamar_json(
            cliente, SaidaExtracao, etapa="extract", modelo=c.model_extract, system=system,
            mensagens=historico, max_tokens=32000, effort=c.effort_extract,
            ferramentas=ferramentas, schema=schema, tentativas_json=1,
        )
        uso.somar(uso2)
    return normalizar_extracao(saida, duracao), uso, modelo_usado


def normalizar_extracao(saida: SaidaExtracao, duracao: float) -> SaidaExtracao:
    """Ordena, renumera e aplica as regras de checabilidade por tipo."""
    alegs = sorted(saida.alegacoes, key=lambda a: (a.t_ini, a.id))
    mapa = {a.id: i for i, a in enumerate(alegs, 1)}
    for i, a in enumerate(alegs, 1):
        a.derivada_de = mapa.get(a.derivada_de, 0) if a.derivada_de else 0
        a.id = i
        a.t_ini = min(max(0.0, a.t_ini), duracao)
        a.t_fim = min(max(a.t_ini, a.t_fim), duracao)
        if a.tipo == "atribuicao_de_citacao":
            a.checavel = True
        elif a.tipo in ("opiniao", "chamada_a_acao", "previsao"):
            a.checavel = False
        if a.checavel and not a.o_que_checar.strip():
            a.o_que_checar = a.citacao
    saida.alegacoes = alegs
    return saida
