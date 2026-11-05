# LoopLoot · vídeos

Branch separada do app de eventos infantis: aqui só ficam os vídeos da LoopLoot.

| Filme | Pasta | Arquivo pronto |
|---|---|---|
| "The Construct" (55 s) | `video/construct/` | `out/the-construct-16x9.mp4` e `out/the-construct-9x16.mp4` |
| "The Empty Coin Factory" (48 s) | `video/factory/` | `out/the-empty-coin-factory.mp4` (só 16:9) |
| "LoopLoot 101" (61 s) | `video/loopy101/` | `out/looploot-101.mp4` (só 16:9) |

Os projetos funcionam do mesmo jeito: `timeline.json` com os tempos, cena em Three.js em `src/`, trilha em `audio/trilha.py` e `render.mjs` para renderizar.

## `video/loopy101/` · "LoopLoot 101" (61 s, 16:9)

- `video/PROMPT_VIDEO_IA_LOOPLOOT_101.md`: o roteiro original, para gerador de vídeo com IA.
- `video/loopy101/`: o mesmo roteiro feito por código. O Loopy professor dá aula para um sapo de óculos e mochila, um shiba com taco de espuma, um gato de gorro e uma baleia de gravata.

```bash
cd video/loopy101
npm install
python3 audio/trilha.py
node render.mjs                              # out/looploot-101.mp4
```

**Gráficos das lições:** coloque `empty-coins.png`, `coin-to-game.png`, `fee-flow.png` e `buy-builds.png` em `video/loopy101/assets/infographics/` e rode `node render.mjs --redo 10-13,18-22,27-31,44-48` para refazer só esses trechos. Enquanto a pasta estiver vazia, o filme usa versões provisórias desenhadas em `src/infographics.js`. Instruções em `assets/infographics/LEIA-ME.md`.

**O ∞ da marca:** `assets/looploot-infinity.webp` é a imagem original; `assets/looploot-infinity.png` é a mesma com o fundo preto removido, usada no fim da lousa e na cartela final.

Onde mexer: `src/classroom.js` (sala, lousa, relógio, porta, sinal), `src/chalk.js` (giz que aparece enquanto o Loopy escreve), `src/students.js` (a turma), `src/infographics.js` (gráficos provisórios), `src/main.js` (câmera e atuação de cada plano), `src/overlay.js` (legendas, gráficos em tela cheia e cartela final). As vozes dos alunos são balbucio de desenho animado, sem palavras: as falas estão nas legendas.

## `video/factory/` · "The Empty Coin Factory" (48 s, 16:9)

- `video/PROMPT_VIDEO_IA_EMPTY_COIN_FACTORY.md`: o roteiro original, para gerador de vídeo com IA.
- `video/factory/`: o mesmo roteiro feito por código.

```bash
cd video/factory
npm install
python3 audio/trilha.py
node render.mjs                              # out/the-empty-coin-factory.mp4
```

Onde mexer: `src/factory.js` (salão, esteiras, prensas, caixas, carimbo e a parede que descasca), `src/people.js` (operários e supervisor), `src/games.js` (os 5 mini mundos de meme), `src/coin.js` (a moeda que racha), `src/outside.js` (o mundo colorido do final), `src/main.js` (câmera e atuação de cada plano), `src/overlay.js` (legendas de documentário, legendas digitadas e cartela final).

Cuidados: só arquétipos genéricos (sapo de gravata, shiba de chapéu, baleia de terno, gato CEO, touro de olhos laser); nada de Pepe, Wojak, foto do Doge ou personagem com dono. Nenhuma pessoa real e nenhum concorrente; a placa diz só "COIN FACTORY". Os únicos textos na imagem são a placa, o carimbo EMPTY, o botão BUY e os "+1" de pontuação, todos descritos no roteiro.

## `video/construct/` · "The Construct" (55 s)

- `video/PROMPT_VIDEO_IA_CONSTRUCT.md`: o roteiro original, plano a plano, escrito para gerador de vídeo com IA.
- `video/construct/`: o mesmo roteiro **feito por código**, sem gerador de IA. É uma cena 3D em Three.js renderizada quadro a quadro num Chromium sem tela, com trilha sintetizada em Python e legendas aplicadas na edição.

### Arquivos prontos (`video/construct/out/`)

| Arquivo | O que é |
|---|---|
| `the-construct-16x9.mp4` | 1920×1080, 24 fps, com trilha e legendas |
| `the-construct-9x16.mp4` | 1080×1920 para Reels/TikTok/Shorts, mesma trilha |
| `trilha.wav` | só a trilha (48 kHz, 24 bits), para editar por fora |
| `legendas.srt` | as legendas em texto, se quiser aplicar no editor |

### Como refazer

Precisa de Node 18+, Python 3 com `numpy` e `scipy`, `ffmpeg` e o Chromium do Playwright.

```bash
cd video/construct
npm install
python3 audio/trilha.py                      # gera out/trilha.wav
node render.mjs --still 12.5,38              # prévia rápida de quadros soltos (out/stills/)
node render.mjs --format 16x9                # filme horizontal
node render.mjs --format 9x16                # filme vertical
```

Opções úteis: `--scale 0.5 --fps 12` para uma prévia leve, `--no-captions` para sair sem legendas, `--from 32 --to 40` para renderizar só um trecho, `--mbps 10` para um arquivo com mais qualidade (o padrão é 6 Mbps, uns 42 MB). A renderização é feita em pedaços de 2 s guardados em `out/.parts/`: se cair, é só rodar de novo que ela continua de onde parou.

### Onde mexer

- `timeline.json`: tempos de tudo (planos, legendas, giro do Loopy, chegada das prateleiras, pouso das fichas). Imagem e som leem o mesmo arquivo.
- `src/loopy.js`: o personagem.
- `src/worldA.js`: o salão cinza.
- `src/rain.js`: a chuva de ∞ e a dissolução.
- `src/worldB.js` e `src/dioramas.js`: a sala branca, as prateleiras e os mini mundos de voxel.
- `src/main.js`: câmera, pose e cor de cada plano.
- `src/overlay.js`: legendas e cartela final.
- `audio/trilha.py`: a trilha.

### Regras seguidas

- Homenagem de estilo: nada de personagens, falas, música, nome do filme ou código verde do original.
- Nenhum concorrente citado. O único número na tela é 0.8%.
- Sem preço, retorno, "playable", "live now" ou "coming soon".
- O Loopy foi modelado a partir da descrição do prompt, porque a imagem de referência (`hero-desktop-2560.webp`) ficou no computador local.
