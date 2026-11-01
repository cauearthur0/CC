# Fixtures dos testes de aceitação

Coloque aqui os dois vídeos reais usados como gabarito (§7 do spec). Eles **não vão para o git**
(estão no `.gitignore`):

| Arquivo | Caso | Gabarito |
|---|---|---|
| `caso_a_lenin.mp4` | Montagem de 90 s, imagens de IA, legenda em bloco, frases atribuídas a Lenin | `backend/tests/gabaritos/caso_a_lenin.json` |
| `caso_b_decretos.mp4` | Homem falando à câmera, 179 s, legenda palavra por palavra, decretos da ANPD | `backend/tests/gabaritos/caso_b_decretos.json` |

Para rodar (custa dinheiro: API da Anthropic + buscas; o teto padrão do teste é US$ 5 por vídeo):

```bash
ANTHROPIC_API_KEY_ACEITACAO=sk-ant-... make aceitacao
```

Variáveis opcionais: `WHISPER_MODELO_ACEITACAO` (padrão `medium`) e `ORCAMENTO_ACEITACAO` (padrão `5`).
O relatório gerado fica em `backend/dados/aceitacao_<caso>.json`, junto com o custo real, para
calibrar a estimativa do README.

Tolerâncias: ±1 alegação na contagem; veredito igual ou adjacente ("falso"↔"enganoso",
"verdadeiro"↔"parcial").
