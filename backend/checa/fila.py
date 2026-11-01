"""Fila de jobs: RQ + Redis em produção; thread local no modo "inline" (dev/testes)."""

from __future__ import annotations

import logging
import threading

from .config import config

log = logging.getLogger(__name__)

NOME_FILA = "checagens"
TIMEOUT_JOB_S = 30 * 60


def enfileirar(checagem_id: str) -> None:
    c = config()
    if c.fila == "inline":
        threading.Thread(target=_rodar_inline, args=(checagem_id,), daemon=True).start()
        return
    from redis import Redis
    from rq import Queue

    q = Queue(NOME_FILA, connection=Redis.from_url(c.redis_url))
    q.enqueue(
        "checa.worker.tarefa_checagem", checagem_id,
        job_id=f"checagem-{checagem_id}", job_timeout=TIMEOUT_JOB_S, result_ttl=3600, failure_ttl=86400,
    )


def _rodar_inline(checagem_id: str) -> None:
    from .pipeline import processar_checagem

    try:
        processar_checagem(checagem_id)
    except Exception:  # noqa: BLE001
        log.exception("job inline falhou")
