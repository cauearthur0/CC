import json

import pytest

from checa.etapas.extrair import normalizar_extracao
from checa.etapas.verificar import aplicar_regras, verificar_alegacao
from checa.llm.cliente import chamar_json, dominio_registravel, normalizar_url
from checa.llm.esquemas import (
    AlegacaoExtraida,
    SaidaExtracao,
    SaidaSintese,
    SaidaVerificacao,
    schema_estrito,
)
from checa.llm.jsonparse import JSONInvalido, extrair_json, validar_json
from checa.llm.simulado import ClienteRoteirizado

VERIF_OK = {
    "id": 1, "veredito": "falso", "confianca": 0.9,
    "explicacao": "Os recursos ao STF foram do Facebook e do Google.",
    "o_que_e_verdade_por_tras": "Houve julgamento no STF sobre o artigo 19.",
    "fontes": [
        {"titulo": "STF", "url": "https://portal.stf.jus.br/noticias/x", "tipo": "primaria", "trecho": ""},
        {"titulo": "Aos Fatos", "url": "https://www.aosfatos.org/noticias/y/?utm_source=t", "tipo": "checagem", "trecho": ""},
        {"titulo": "Inventada", "url": "https://site-que-nao-foi-aberto.com/z", "tipo": "imprensa", "trecho": ""},
    ],
}
VISTAS = {
    "https://portal.stf.jus.br/noticias/x": "STF",
    "https://aosfatos.org/noticias/y": "Aos Fatos",
}


# ------------------------------------------------------------------ parser


def test_extrair_json_puro_cercado_e_com_texto():
    assert extrair_json('{"a": 1}') == {"a": 1}
    assert extrair_json('Aqui está:\n```json\n{"a": 2}\n```') == {"a": 2}
    texto = 'Pesquisei bastante. {"x": "chave } dentro de string", "b": {"c": 3}} fim'
    assert extrair_json(texto) == {"x": "chave } dentro de string", "b": {"c": 3}}


def test_extrair_json_invalido():
    with pytest.raises(JSONInvalido):
        extrair_json("sem json aqui")
    with pytest.raises(JSONInvalido):
        extrair_json('{"a": 1,,}')


def test_validar_json_aponta_campo_errado():
    with pytest.raises(JSONInvalido) as e:
        validar_json('{"id": 1, "veredito": "talvez", "confianca": 1, "explicacao": "x"}', SaidaVerificacao)
    assert "veredito" in e.value.motivo


def test_confianca_e_importancia_sao_limitadas():
    v = SaidaVerificacao.model_validate({**VERIF_OK, "confianca": 1.7})
    assert v.confianca == 1.0
    a = AlegacaoExtraida(id=1, t_ini=0, t_fim=1, citacao="x", tipo="fato", checavel=True, importancia=9)
    assert a.importancia == 3


def test_schema_estrito_sem_ref_e_tudo_obrigatorio():
    for modelo in (SaidaExtracao, SaidaVerificacao, SaidaSintese):
        s = schema_estrito(modelo)
        texto = json.dumps(s)
        assert "$ref" not in texto and "minimum" not in texto and '"default"' not in texto
        assert s["additionalProperties"] is False
        assert set(s["required"]) == set(s["properties"])
    alegacao = schema_estrito(SaidaExtracao)["properties"]["alegacoes"]["items"]
    assert alegacao["properties"]["tipo"]["enum"][0] == "fato"
    assert alegacao["additionalProperties"] is False


# ------------------------------------------------------------------ retry de JSON


def test_retry_em_json_invalido_anexa_erro_ao_historico():
    cliente = ClienteRoteirizado({"verify": ["Não achei nada {quebrado", json.dumps(VERIF_OK)]})
    saida, _, uso = chamar_json(
        cliente, SaidaVerificacao, etapa="verify", modelo="m", system="s",
        mensagens=[{"role": "user", "content": "checar"}], max_tokens=10, effort="low",
    )
    assert saida.veredito == "falso"
    assert uso.chamadas == 2
    segunda = cliente.chamadas["verify"][1]
    assert [m["role"] for m in segunda] == ["user", "assistant", "user"]
    assert "não pôde ser lida" in segunda[-1]["content"]


def test_retry_desiste_depois_das_tentativas():
    cliente = ClienteRoteirizado({"verify": ["lixo", "lixo", "lixo"]})
    with pytest.raises(JSONInvalido):
        chamar_json(
            cliente, SaidaVerificacao, etapa="verify", modelo="m", system="s",
            mensagens=[{"role": "user", "content": "x"}], max_tokens=10, effort="low",
        )
    assert len(cliente.chamadas["verify"]) == 3


# ------------------------------------------------------------------ regras de fonte


def test_fontes_nao_abertas_sao_descartadas():
    saida = SaidaVerificacao.model_validate(VERIF_OK)
    saida, descartadas, notas = aplicar_regras(saida, VISTAS, 7)
    assert saida.id == 7
    assert [f.titulo for f in saida.fontes] == ["STF", "Aos Fatos"]
    assert descartadas == ["https://site-que-nao-foi-aberto.com/z"]
    assert saida.confianca == 0.9 and notas == []


def test_falso_com_uma_fonte_perde_confianca():
    saida = SaidaVerificacao.model_validate(VERIF_OK)
    saida, _, notas = aplicar_regras(saida, {"https://portal.stf.jus.br/noticias/x": "STF"}, 1)
    assert saida.confianca == 0.5
    assert notas and "duas fontes" in notas[0]


def test_duas_paginas_do_mesmo_site_nao_contam_como_independentes():
    d = dict(VERIF_OK)
    d["fontes"] = [
        {"titulo": "a", "url": "https://g1.globo.com/a", "tipo": "imprensa"},
        {"titulo": "b", "url": "https://oglobo.globo.com/b", "tipo": "imprensa"},
    ]
    saida = SaidaVerificacao.model_validate(d)
    vistas = {normalizar_url(f["url"]): "" for f in d["fontes"]}
    saida, _, notas = aplicar_regras(saida, vistas, 1)
    assert saida.confianca == 0.5 and notas


def test_dominio_registravel():
    assert dominio_registravel("https://www.planalto.gov.br/ccivil_03") == "planalto.gov.br"
    assert dominio_registravel("https://g1.globo.com/x") == "globo.com"
    assert dominio_registravel("https://portal.stf.jus.br/x") == "stf.jus.br"
    assert dominio_registravel("https://en.wikiquote.org/wiki/Lenin") == "wikiquote.org"


def test_verificar_alegacao_ponta_a_ponta_com_roteiro():
    cliente = ClienteRoteirizado({"verify": [json.dumps(VERIF_OK)]}, fontes={"verify": VISTAS})
    a = AlegacaoExtraida(id=3, t_ini=10, t_fim=14, citacao="O PT recorreu ao STF", tipo="fato",
                         checavel=True, o_que_checar="Quem recorreu ao STF?")
    r = verificar_alegacao(cliente, a, "tese", "[00:10–00:14] FALA: \"o PT recorreu ao STF\"")
    assert r.saida.id == 3 and len(r.saida.fontes) == 2
    msg = cliente.chamadas["verify"][0][0]["content"]
    assert "<<ALEGACAO>>" in msg and "Data de hoje" in msg


# ------------------------------------------------------------------ normalização da extração


def test_normalizar_extracao_aplica_regras_de_tipo():
    saida = SaidaExtracao.model_validate({
        "descricao_video": "d", "tese_central": "t",
        "alegacoes": [
            {"id": 9, "t_ini": 30, "t_fim": 33, "citacao": "vão derrubar seu vídeo por telefonema",
             "tipo": "previsao", "checavel": True, "o_que_checar": ""},
            {"id": 4, "t_ini": 2, "t_fim": 5, "citacao": "Lenin disse: usaremos o idiota útil",
             "tipo": "atribuicao_de_citacao", "checavel": False, "o_que_checar": ""},
            {"id": 12, "t_ini": 31, "t_fim": 999, "citacao": "existe mecanismo de derrubada por telefonema",
             "tipo": "fato", "checavel": True, "o_que_checar": "a norma prevê isso?", "derivada_de": 9},
        ],
    })
    n = normalizar_extracao(saida, duracao=60)
    assert [a.id for a in n.alegacoes] == [1, 2, 3]
    assert n.alegacoes[0].tipo == "atribuicao_de_citacao" and n.alegacoes[0].checavel
    assert n.alegacoes[0].o_que_checar  # preenchido com a citação
    assert n.alegacoes[1].tipo == "previsao" and not n.alegacoes[1].checavel
    assert n.alegacoes[2].derivada_de == 2  # renumerado junto
    assert n.alegacoes[2].t_fim == 60
