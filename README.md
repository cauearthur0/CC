# LoopLoot · vídeos

Branch separada do app de eventos infantis: aqui só ficam os vídeos da LoopLoot.

## `video/` · "The Construct" (55 s)

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

Opções úteis: `--scale 0.5 --fps 12` para uma prévia leve, `--no-captions` para sair sem legendas, `--from 32 --to 40` para renderizar só um trecho.

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
