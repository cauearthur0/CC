"""Rate limit por IP (janela deslizante). Redis quando disponível; memória no modo inline."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from ..config import config


class Limitador:
    def __init__(self, limite: int, janela_s: int):
        self.limite = limite
        self.janela = janela_s
        self._mem: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._redis = None
        if config().fila == "rq":
            try:
                from redis import Redis

                self._redis = Redis.from_url(config().redis_url)
            except Exception:  # noqa: BLE001
                self._redis = None

    def permitir(self, chave: str) -> bool:
        if self.limite <= 0:
            return True
        agora = time.time()
        if self._redis is not None:
            try:
                k = f"ratelimit:{chave}"
                p = self._redis.pipeline()
                p.zremrangebyscore(k, 0, agora - self.janela)
                p.zcard(k)
                _, n = p.execute()
                if n >= self.limite:
                    return False
                p = self._redis.pipeline()
                p.zadd(k, {f"{agora}": agora})
                p.expire(k, self.janela)
                p.execute()
                return True
            except Exception:  # noqa: BLE001
                pass  # Redis fora do ar: cai para memória
        with self._lock:
            fila = self._mem[chave]
            while fila and fila[0] < agora - self.janela:
                fila.popleft()
            if len(fila) >= self.limite:
                return False
            fila.append(agora)
            return True
