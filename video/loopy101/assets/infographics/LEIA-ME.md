# Gráficos das lições

Coloque aqui os PNGs prontos (os que estão em `looploot-craft\reports\outreach\infographics\` no seu computador), com estes nomes exatos:

| Arquivo | Aparece em |
|---|---|
| `empty-coins.png` | 10–13 s (lição 1) |
| `coin-to-game.png` | 18–22 s (lição 2) |
| `fee-flow.png` | 27,2–31 s (lição 3, com zoom lento no 0.8%) |
| `buy-builds.png` | 44–48 s (lição 4) |

Enquanto a pasta estiver vazia, o filme usa versões provisórias desenhadas no código (`src/infographics.js`), com o mesmo conteúdo e só o número 0.8%.

Depois de copiar os arquivos, refaça só os trechos dos gráficos:

```bash
node render.mjs --redo 10-13,18-22,27-31,44-48
```

O zoom do `fee-flow.png` vai para o ponto definido em `timeline.json` (`"focus": [x, y]`, de 0 a 1 a partir do canto de cima à esquerda). Ajuste para onde o 0.8% estiver na sua imagem.
