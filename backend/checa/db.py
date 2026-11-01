"""Banco (SQLModel). SQLite para começar; DATABASE_URL aceita Postgres sem mudar o código."""

from __future__ import annotations

import datetime as dt
import secrets
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Column, Text
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import config


def agora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def utc(d: dt.datetime) -> dt.datetime:
    """SQLite devolve datetimes sem fuso; tratamos todos como UTC."""
    return d.replace(tzinfo=dt.timezone.utc) if d.tzinfo is None else d.astimezone(dt.timezone.utc)


def iso(d: dt.datetime | None) -> str | None:
    if d is None:
        return None
    return utc(d).isoformat().replace("+00:00", "Z")


def novo_id() -> str:
    return secrets.token_urlsafe(12)


class Video(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    sha256: str = Field(index=True, unique=True)
    chave_arquivo: str
    nome_original: str = ""
    duracao: float
    largura: int
    altura: int
    fps: float
    tem_audio: bool
    tamanho_bytes: int
    criado_em: dt.datetime = Field(default_factory=agora)


class Checagem(SQLModel, table=True):
    """Job e relatório (o relatório final fica em `relatorio_json`)."""

    id: str = Field(default_factory=novo_id, primary_key=True)
    video_id: int | None = Field(default=None, foreign_key="video.id", index=True)
    status: str = Field(default="fila", index=True)  # fila|processando|concluida|erro|rejeitada
    etapa: str = "fila"
    etapa_detalhe: str = ""
    progresso_atual: int = 0
    progresso_total: int = 0
    n_alegacoes: int = 0
    erro_msg: str = ""
    origem_informada: str = ""
    titulo: str = ""
    relatorio_json: str = Field(default="", sa_column=Column(Text))
    custo_usd: float = 0.0
    simulado: bool = False
    criado_em: dt.datetime = Field(default_factory=agora)
    iniciado_em: dt.datetime | None = None
    concluido_em: dt.datetime | None = None


class Alegacao(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    checagem_id: str = Field(foreign_key="checagem.id", index=True)
    numero: int
    t_ini: float
    t_fim: float
    citacao: str = Field(sa_column=Column(Text))
    tipo: str
    checavel: bool
    veredito: str | None = None
    confianca: float | None = None
    explicacao: str = Field(default="", sa_column=Column(Text))
    verdade_por_tras: str = Field(default="", sa_column=Column(Text))
    importancia: int = 2


class Fonte(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    alegacao_id: int = Field(foreign_key="alegacao.id", index=True)
    titulo: str
    url: str
    tipo: str
    trecho: str = Field(default="", sa_column=Column(Text))


class HistoricoSessao(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    sessao: str = Field(index=True)
    checagem_id: str = Field(foreign_key="checagem.id")
    criado_em: dt.datetime = Field(default_factory=agora)


class CacheVerificacao(SQLModel, table=True):
    """Vereditos reaproveitáveis entre vídeos (mesma alegação, mesmo modelo e prompt)."""

    chave: str = Field(primary_key=True)
    resultado_json: str = Field(sa_column=Column(Text))
    criado_em: dt.datetime = Field(default_factory=agora)


_engine = None


def engine():
    global _engine
    if _engine is None:
        url = config().database_url
        kwargs: dict = {}
        if url.startswith("sqlite"):
            caminho = url.split("///", 1)[-1]
            if caminho and caminho != ":memory:":
                from pathlib import Path

                Path(caminho).parent.mkdir(parents=True, exist_ok=True)
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        _engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):
            with _engine.connect() as con:
                con.exec_driver_sql("PRAGMA journal_mode=WAL")
        SQLModel.metadata.create_all(_engine)
    return _engine


def redefinir_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


@contextmanager
def sessao() -> Iterator[Session]:
    with Session(engine(), expire_on_commit=False) as s:
        yield s


def atualizar_checagem(checagem_id: str, **campos) -> None:
    with sessao() as s:
        ch = s.get(Checagem, checagem_id)
        if ch is None:
            return
        for k, v in campos.items():
            setattr(ch, k, v)
        s.add(ch)
        s.commit()


__all__ = [
    "Alegacao", "CacheVerificacao", "Checagem", "Fonte", "HistoricoSessao", "Video",
    "agora", "atualizar_checagem", "engine", "iso", "novo_id", "redefinir_engine", "select", "sessao",
    "utc",
]
