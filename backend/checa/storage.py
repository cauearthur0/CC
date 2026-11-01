"""Armazenamento de uploads e artefatos.

O pipeline usa ffmpeg/tesseract, que precisam de arquivos locais. Por isso a interface
tem `caminho_local()`: no disco local é o próprio arquivo; no S3 é uma cópia em cache.
"""

from __future__ import annotations

import shutil
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

from .config import config


class Armazenamento(ABC):
    @abstractmethod
    def salvar_arquivo(self, chave: str, origem: Path) -> None: ...

    @abstractmethod
    def salvar_bytes(self, chave: str, dados: bytes) -> None: ...

    @abstractmethod
    def ler_bytes(self, chave: str) -> bytes: ...

    @abstractmethod
    def existe(self, chave: str) -> bool: ...

    @abstractmethod
    def caminho_local(self, chave: str) -> Path:
        """Caminho de arquivo local legível (baixa para cache se necessário)."""

    @abstractmethod
    def apagar_prefixo(self, prefixo: str) -> None: ...

    def abrir(self, chave: str) -> BinaryIO:
        return open(self.caminho_local(chave), "rb")


class ArmazenamentoLocal(Armazenamento):
    def __init__(self, raiz: Path):
        self.raiz = raiz.resolve()
        self.raiz.mkdir(parents=True, exist_ok=True)

    def _p(self, chave: str) -> Path:
        p = (self.raiz / chave).resolve()
        if self.raiz not in p.parents and p != self.raiz:
            raise ValueError("chave fora do diretório de dados")
        return p

    def salvar_arquivo(self, chave: str, origem: Path) -> None:
        destino = self._p(chave)
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(origem), destino)

    def salvar_bytes(self, chave: str, dados: bytes) -> None:
        destino = self._p(chave)
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(dados)

    def ler_bytes(self, chave: str) -> bytes:
        return self._p(chave).read_bytes()

    def existe(self, chave: str) -> bool:
        return self._p(chave).exists()

    def caminho_local(self, chave: str) -> Path:
        return self._p(chave)

    def apagar_prefixo(self, prefixo: str) -> None:
        alvo = self._p(prefixo)
        if alvo.is_dir():
            shutil.rmtree(alvo, ignore_errors=True)
        elif alvo.exists():
            alvo.unlink()


class ArmazenamentoS3(Armazenamento):
    """Implementação mínima com boto3 (experimental, não coberta pelos testes)."""

    def __init__(self, bucket: str, prefixo: str, cache_dir: Path):
        import boto3  # dependência opcional

        self.s3 = boto3.client("s3")
        self.bucket = bucket
        self.prefixo = prefixo
        self.cache = cache_dir
        self.cache.mkdir(parents=True, exist_ok=True)

    def _k(self, chave: str) -> str:
        return f"{self.prefixo}{chave}"

    def salvar_arquivo(self, chave: str, origem: Path) -> None:
        self.s3.upload_file(str(origem), self.bucket, self._k(chave))
        local = self.cache / chave
        local.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(origem), local)

    def salvar_bytes(self, chave: str, dados: bytes) -> None:
        self.s3.put_object(Bucket=self.bucket, Key=self._k(chave), Body=dados)

    def ler_bytes(self, chave: str) -> bytes:
        return self.s3.get_object(Bucket=self.bucket, Key=self._k(chave))["Body"].read()

    def existe(self, chave: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=self._k(chave))
            return True
        except Exception:
            return False

    def caminho_local(self, chave: str) -> Path:
        local = self.cache / chave
        if not local.exists():
            local.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=local.parent, delete=False) as tmp:
                self.s3.download_fileobj(self.bucket, self._k(chave), tmp)
            Path(tmp.name).rename(local)
        return local

    def apagar_prefixo(self, prefixo: str) -> None:
        pag = self.s3.get_paginator("list_objects_v2")
        for pagina in pag.paginate(Bucket=self.bucket, Prefix=self._k(prefixo)):
            objs = [{"Key": o["Key"]} for o in pagina.get("Contents", [])]
            if objs:
                self.s3.delete_objects(Bucket=self.bucket, Delete={"Objects": objs})
        shutil.rmtree(self.cache / prefixo, ignore_errors=True)


_instancia: Armazenamento | None = None


def armazenamento() -> Armazenamento:
    global _instancia
    if _instancia is None:
        c = config()
        if c.armazenamento == "s3":
            _instancia = ArmazenamentoS3(c.s3_bucket, c.s3_prefixo, c.dados_dir / "cache_s3")
        else:
            _instancia = ArmazenamentoLocal(c.dados_dir / "arquivos")
    return _instancia


def redefinir_armazenamento() -> None:
    global _instancia
    _instancia = None
