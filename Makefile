.PHONY: dev down logs test test-backend test-web test-docker aceitacao local demo

PY ?= python3

## Sobe tudo com Docker (redis, api, worker, web) em http://localhost:3000
dev: .env
	docker compose up --build

.env:
	cp .env.example .env
	@echo "Criei .env a partir do .env.example. Preencha ANTHROPIC_API_KEY (ou use LLM_PROVEDOR=simulado)."

down:
	docker compose down

logs:
	docker compose logs -f api worker

## Testes (precisam de ffmpeg e tesseract-ocr-por instalados)
test: test-backend test-web

test-backend:
	cd backend && $(PY) -m pytest -q

test-web:
	cd web && npm ci --no-audit --no-fund && npm run typecheck && npm run build

## Os mesmos testes do backend, dentro da imagem Docker
test-docker:
	docker compose run --rm --no-deps -e FILA=inline api python -m pytest -q

## Casos reais A e B (custam dinheiro: API da Anthropic + buscas). Veja fixtures/README.md
aceitacao:
	cd backend && ANTHROPIC_API_KEY_ACEITACAO=$${ANTHROPIC_API_KEY_ACEITACAO:?defina ANTHROPIC_API_KEY_ACEITACAO} \
	  $(PY) -m pytest -q -m aceitacao tests/test_aceitacao.py

## Sem Docker: API com fila inline (sem Redis) + Next em modo dev
local: .env
	cd backend && FILA=inline $(PY) -m uvicorn checa.api.main:app --port 8000 & \
	cd web && npm install --no-audit --no-fund && API_INTERNA_URL=http://127.0.0.1:8000 npm run dev

## Como `local`, mas sem chave de API: IA simulada e Whisper desligado (só para ver a interface)
demo:
	cd backend && FILA=inline LLM_PROVEDOR=simulado WHISPER_MODELO=desligado $(PY) -m uvicorn checa.api.main:app --port 8000 & \
	cd web && npm install --no-audit --no-fund && API_INTERNA_URL=http://127.0.0.1:8000 npm run dev
