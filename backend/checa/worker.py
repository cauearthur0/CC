"""Worker RQ. Rode com: python -m checa.worker"""

from __future__ import annotations

import logging

from .config import config
from .fila import NOME_FILA


def tarefa_checagem(checagem_id: str) -> None:
    from .pipeline import processar_checagem

    processar_checagem(checagem_id)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    from redis import Redis
    from rq import Queue, Worker

    from .db import engine

    engine()  # cria as tabelas, se preciso
    conexao = Redis.from_url(config().redis_url)
    Worker([Queue(NOME_FILA, connection=conexao)], connection=conexao).work(with_scheduler=False)


if __name__ == "__main__":
    main()
