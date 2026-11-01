"""Configuração lida do ambiente (.env). Veja .env.example para a lista comentada."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_REPO = Path(__file__).resolve().parents[2]


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Infra ---
    database_url: str = "sqlite:///./dados/checa.db"
    redis_url: str = "redis://localhost:6379/0"
    # "rq" (Redis + worker separado) ou "inline" (thread no próprio processo; só para dev/testes)
    fila: str = "rq"
    armazenamento: str = "local"  # local | s3
    dados_dir: Path = Path("./dados")
    s3_bucket: str = ""
    s3_prefixo: str = "checa/"
    prompts_dir: Path = RAIZ_REPO / "prompts"

    # --- Limites de upload ---
    max_upload_mb: int = 200
    max_duracao_s: int = 600
    formatos_aceitos: str = "mp4,mov,webm,m4v"
    rate_limit_uploads_por_hora: int = 10
    confiar_x_forwarded_for: bool = True

    # --- IA ---
    # "anthropic" (real) ou "simulado" (determinístico, sem rede; só testes/demonstração)
    llm_provedor: str = "anthropic"
    anthropic_api_key: str = ""
    model_extract: str = "claude-sonnet-5-5"
    model_verify: str = "claude-opus-5-5"
    model_synthesize: str = "claude-opus-5-5"
    effort_extract: str = "medium"
    effort_verify: str = "medium"
    effort_synthesize: str = "medium"
    # Reexecuta uma recusa em outro modelo, no servidor (fallbacks: "default"). Vazio desliga.
    fallbacks: str = "default"
    usar_structured_outputs: bool = True
    web_search_max_uses: int = 6
    web_fetch_max_uses: int = 3
    web_fetch_max_content_tokens: int = 8000
    dominios_bloqueados: str = ""  # lista separada por vírgula
    ver_quadro_max: int = 3  # quantos quadros em alta o modelo pode pedir na extração
    orcamento_usd_por_checagem: float = 1.00
    custo_estimado_por_alegacao_usd: float = 0.20  # estimativa inicial, recalibrada com o uso real
    cache_vereditos_dias: int = 7

    # --- Whisper ---
    whisper_modelo: str = "medium"
    whisper_dispositivo: str = "cpu"  # cpu | cuda | auto
    whisper_compute_type: str = "int8"  # int8 (CPU) | float16 (GPU)
    whisper_idioma: str = "pt"

    # --- OCR ---
    tesseract_idioma: str = "por"
    ocr_limiar_branco: int = 225
    ocr_min_pixels_mascara: int = 150
    ocr_busca_faixa_inicio: float = Field(0.45, ge=0.0, le=0.9)
    ocr_threads: int = 4
    fonte_ttf: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    fonte_ttf_negrito: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    # --- Web ---
    url_publica: str = "http://localhost:3000"

    @property
    def lista_dominios_bloqueados(self) -> list[str]:
        return [d.strip() for d in self.dominios_bloqueados.split(",") if d.strip()]

    @property
    def lista_formatos(self) -> list[str]:
        return [f.strip().lower() for f in self.formatos_aceitos.split(",") if f.strip()]


@lru_cache
def config() -> Config:
    return Config()


def recarregar_config() -> Config:
    config.cache_clear()
    return config()
