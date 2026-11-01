# Imagem única para a API e o worker (o comando muda no docker-compose).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_THREAD_LIMIT=1 \
    HF_HOME=/modelos \
    PROMPTS_DIR=/app/prompts \
    DADOS_DIR=/dados \
    DATABASE_URL=sqlite:////dados/checa.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg tesseract-ocr tesseract-ocr-por tesseract-ocr-eng fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/pyproject.toml ./
COPY backend/checa ./checa
RUN pip install ".[dev]"
COPY backend/tests ./tests
COPY prompts /app/prompts

# Opcional: baixa o modelo do Whisper na construção (ex.: --build-arg WHISPER_PRELOAD=medium).
# Sem isso, o worker baixa na primeira checagem e guarda no volume /modelos.
ARG WHISPER_PRELOAD=""
RUN if [ -n "$WHISPER_PRELOAD" ]; then \
      python -c "from faster_whisper import WhisperModel; WhisperModel('$WHISPER_PRELOAD', device='cpu', compute_type='int8')"; \
    fi

EXPOSE 8000
CMD ["uvicorn", "checa.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
