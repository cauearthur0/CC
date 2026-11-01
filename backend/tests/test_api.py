import time

import pytest
from fastapi.testclient import TestClient

from .sintetico import ffmpeg_disponivel, gerar_video_legendado

pytestmark = pytest.mark.skipif(not ffmpeg_disponivel(), reason="ffmpeg não instalado")

FRASES = [(0.5, 3.0, "o decreto saiu em maio de 2026"), (3.5, 6.0, "eles querem te impedir de falar")]


@pytest.fixture
def cliente():
    from checa.api.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def video(tmp_path_factory):
    return gerar_video_legendado(tmp_path_factory.mktemp("v") / "curto.mp4", FRASES, duracao=7.0)


def _enviar(cliente, video, **extra):
    with open(video, "rb") as f:
        return cliente.post("/api/checagens", files={"arquivo": ("curto.mp4", f, "video/mp4")}, data=extra)


def _esperar(cliente, cid, limite=180):
    fim = time.time() + limite
    while time.time() < fim:
        d = cliente.get(f"/api/checagens/{cid}").json()
        if d["status"] in ("concluida", "erro", "rejeitada"):
            return d
        time.sleep(0.5)
    raise AssertionError("checagem não terminou a tempo")


def test_fluxo_completo(cliente, video):
    r = _enviar(cliente, video, origem="grupo da família no WhatsApp")
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert "cv_sessao" in r.cookies or "cv_sessao" in cliente.cookies

    d = cliente.get(f"/api/checagens/{cid}").json()
    assert d["status"] in ("fila", "processando", "concluida")
    assert [e["codigo"] for e in d["etapas"]][0] == "lendo"
    assert d["definicoes"]["sem_fonte"]["definicao"].startswith("Citação/atribuição")

    d = _esperar(cliente, cid)
    assert d["status"] == "concluida", d["erro_msg"]
    rel = d["relatorio"]
    assert rel["simulado"] is True and rel["alegacoes"]
    assert d["url"].endswith(f"/checagem/{cid}")

    md = cliente.get(f"/api/checagens/{cid}/relatorio.md")
    assert md.status_code == 200 and "## Linha do tempo" in md.text
    assert cliente.get(f"/api/checagens/{cid}/relatorio.pdf").content.startswith(b"%PDF")
    assert cliente.get(f"/api/checagens/{cid}/card.png").headers["content-type"] == "image/png"
    assert cliente.get(f"/api/checagens/{cid}/thumb.jpg").status_code == 200

    parcial = cliente.get(f"/api/checagens/{cid}/video", headers={"Range": "bytes=0-99"})
    assert parcial.status_code == 206 and len(parcial.content) == 100

    # mesmo vídeo = mesmo relatório
    r2 = _enviar(cliente, video)
    assert r2.status_code == 200 and r2.json() == {"id": cid, "reutilizado": True}
    # "checar de novo"
    r3 = cliente.post(f"/api/checagens/{cid}/rechecar")
    assert r3.status_code == 201 and r3.json()["id"] != cid
    _esperar(cliente, r3.json()["id"])

    hist = cliente.get("/api/historico").json()["itens"]
    ids = [h["id"] for h in hist]
    assert cid in ids and r3.json()["id"] in ids
    assert hist[0]["estatisticas"] is not None

    # outra sessão não vê o histórico desta
    from checa.api.main import app

    with TestClient(app) as outro:
        assert outro.get("/api/historico").json()["itens"] == []


def test_formulario_sem_js_redireciona(cliente, video):
    with open(video, "rb") as f:
        r = cliente.post(
            "/api/checagens", files={"arquivo": ("curto.mp4", f, "video/mp4")},
            headers={"Accept": "text/html"}, follow_redirects=False,
        )
    assert r.status_code == 303 and r.headers["location"].startswith("/checagem/")


def test_arquivo_invalido(cliente, tmp_path):
    falso = tmp_path / "falso.mp4"
    falso.write_text("isto não é um vídeo")
    with open(falso, "rb") as f:
        r = cliente.post("/api/checagens", files={"arquivo": ("falso.mp4", f, "video/mp4")})
    assert r.status_code == 400 and "vídeo" in r.json()["erro"]
    with open(falso, "rb") as f:
        r = cliente.post("/api/checagens", files={"arquivo": ("x.avi", f, "video/x-msvideo")})
    assert r.status_code == 400 and "Formato" in r.json()["erro"]
    with open(falso, "rb") as f:
        r = cliente.post("/api/checagens", files={"arquivo": ("x.mp4", f)}, headers={"Accept": "text/html"},
                         follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/?erro=")


def test_video_longo_demais(cliente, tmp_path, monkeypatch):
    from checa.config import recarregar_config

    monkeypatch.setenv("MAX_DURACAO_S", "3")
    recarregar_config()
    v = gerar_video_legendado(tmp_path / "longo.mp4", FRASES, duracao=5.0)
    r = _enviar(cliente, v)
    assert r.status_code == 400 and "limite" in r.json()["erro"]


def test_rate_limit_por_ip(cliente, video, monkeypatch):
    from checa.api import main
    from checa.config import recarregar_config

    monkeypatch.setenv("RATE_LIMIT_UPLOADS_POR_HORA", "1")
    recarregar_config()
    main._limitador = None
    try:
        h = {"X-Forwarded-For": "203.0.113.9"}
        with open(video, "rb") as f:
            r1 = cliente.post("/api/checagens", files={"arquivo": ("a.mp4", f)}, headers=h)
        with open(video, "rb") as f:
            r2 = cliente.post("/api/checagens", files={"arquivo": ("a.mp4", f)}, headers=h)
        assert r1.status_code in (200, 201) and r2.status_code == 429
        with open(video, "rb") as f:
            r3 = cliente.post("/api/checagens", files={"arquivo": ("a.mp4", f)},
                              headers={"X-Forwarded-For": "198.51.100.7"})
        assert r3.status_code in (200, 201)
    finally:
        main._limitador = None


def test_checagem_inexistente(cliente):
    assert cliente.get("/api/checagens/nao-existe").status_code == 404
