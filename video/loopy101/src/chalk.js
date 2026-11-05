import * as THREE from 'three';
import { mulberry32, clamp, drawInfinity } from './util.js';

// Lousa: texto e desenhos de giz que aparecem aos poucos (como se o Loopy escrevesse),
// com textura de giz seco. Devolve a ponta do giz para a mão do Loopy acompanhar.
export const BW = 2200;
export const BH = 800;

function noiseMask() {
  const c = document.createElement('canvas');
  c.width = BW;
  c.height = BH;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BW, BH);
  const r = mulberry32(11);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26000; i++) {
    g.globalAlpha = 0.15 + r() * 0.55;
    g.fillRect(r() * BW, r() * BH, 1 + r() * 3.5, 1 + r() * 2);
  }
  return c;
}

function slate(logo) {
  const c = document.createElement('canvas');
  c.width = BW;
  c.height = BH;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, BH);
  grd.addColorStop(0, '#2f5440');
  grd.addColorStop(1, '#294a38');
  g.fillStyle = grd;
  g.fillRect(0, 0, BW, BH);
  const r = mulberry32(4);
  // marcas de apagador e pó de giz
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = `rgba(230,240,230,${0.025 + r() * 0.03})`;
    g.lineWidth = 50 + r() * 70;
    g.lineCap = 'round';
    g.beginPath();
    const x = r() * BW;
    const y = r() * BH;
    g.arc(x, y, 120 + r() * 260, r() * 6, r() * 6 + 1.2 + r());
    g.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
    g.fillRect(r() * BW, r() * BH, 2, 2);
  }
  return c;
}

export function buildChalk(tl, logoImg) {
  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const g = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  layer.width = BW;
  layer.height = BH;
  const lg = layer.getContext('2d');
  const mask = noiseMask();
  const base = slate();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const chalkStyle = (ctx, w = 10) => {
    ctx.strokeStyle = 'rgba(248,250,245,0.95)';
    ctx.fillStyle = 'rgba(248,250,245,0.95)';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  // texto pré-desenhado (revelado por recorte, da esquerda para a direita)
  function textSprite(text, size, cx, cy) {
    const c = document.createElement('canvas');
    c.width = BW;
    c.height = BH;
    const x = c.getContext('2d');
    x.font = `700 ${size}px "Caveat", cursive`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    chalkStyle(x);
    x.fillText(text, cx, cy);
    x.lineWidth = 2;
    x.strokeText(text, cx, cy);
    const w = x.measureText(text).width;
    return { c, x0: cx - w / 2, x1: cx + w / 2, cy, size };
  }
  const title = textSprite(tl.board.title.text, 200, BW / 2, 205);
  const homework = textSprite(tl.board.homework.text, 128, BW / 2, 668);

  // desenhos: listas de polilinhas, reveladas pelo comprimento
  const P = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const circle = (cx, cy, r, n = 48, a0 = -Math.PI / 2) => P(Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + (i / n) * Math.PI * 2) * r, cy + Math.sin(a0 + (i / n) * Math.PI * 2) * r * 0.96]));
  const wob = (pts, amt = 2.2, seed = 1) => {
    const r = mulberry32(seed);
    return pts.map((p) => new THREE.Vector2(p.x + (r() - 0.5) * amt, p.y + (r() - 0.5) * amt));
  };
  const inf = (cx, cy, w) => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const s = Math.sin(t);
      const c = Math.cos(t);
      const d = 1 + s * s;
      pts.push([cx + ((w / 2) * c) / d, cy - ((w / 2) * s * c * 1.25) / d]);
    }
    return P(pts);
  };
  const diagram = [
    wob(circle(400, 450, 82), 2, 1),
    wob(circle(400, 450, 50), 2, 2),
    P([
      [505, 450],
      [835, 450],
    ]),
    P([
      [800, 422],
      [840, 450],
      [800, 478],
    ]),
    wob(
      P([
        [880, 400],
        [1160, 400],
        [1160, 540],
        [880, 540],
        [880, 400],
      ]),
      2,
      3
    ),
    wob(
      P([
        [880, 400],
        [900, 345],
        [1140, 345],
        [1160, 400],
      ]),
      2,
      4
    ),
    inf(1020, 472, 150),
    P([
      [1200, 450],
      [1515, 450],
    ]),
    P([
      [1480, 422],
      [1520, 450],
      [1480, 478],
    ]),
    wob(
      P([
        [1580, 375],
        [1840, 375],
        [1860, 395],
        [1860, 515],
        [1840, 535],
        [1580, 535],
        [1560, 515],
        [1560, 395],
        [1580, 375],
      ]),
      2,
      5
    ),
    P([
      [1650, 400],
      [1770, 400],
      [1770, 470],
      [1650, 470],
      [1650, 400],
    ]),
    P([
      [1595, 450],
      [1625, 450],
    ]),
    P([
      [1610, 435],
      [1610, 465],
    ]),
    wob(circle(1815, 445, 9, 16), 1, 6),
    wob(circle(1800, 480, 9, 16), 1, 7),
  ];
  const lens = diagram.map((pl) => pl.reduce((s, p, i) => (i ? s + p.distanceTo(pl[i - 1]) : 0), 0));
  const total = lens.reduce((a, b) => a + b, 0);

  function drawPolyPartial(ctx, pl, len) {
    let acc = 0;
    ctx.beginPath();
    ctx.moveTo(pl[0].x, pl[0].y);
    let tip = pl[0].clone();
    for (let i = 1; i < pl.length; i++) {
      const d = pl[i].distanceTo(pl[i - 1]);
      if (acc + d <= len) {
        ctx.lineTo(pl[i].x, pl[i].y);
        tip = pl[i].clone();
        acc += d;
      } else {
        const f = (len - acc) / d;
        tip = pl[i - 1].clone().lerp(pl[i], f);
        ctx.lineTo(tip.x, tip.y);
        break;
      }
    }
    ctx.stroke();
    return tip;
  }

  const prog = (t, [a, b]) => clamp((t - a) / (b - a));
  let last = '';

  // devolve a ponta do giz (px da lousa) ou null
  function update(t) {
    const T = tl.board;
    const pTitle = prog(t, T.title.write);
    const pU1 = prog(t, T.title.underline[0]);
    const pU2 = prog(t, T.title.underline[1]);
    const pDia = prog(t, T.diagram.draw);
    const pHw = prog(t, T.homework.write);
    const pFade = prog(t, T.fade);
    const key = [pTitle, pU1, pU2, pDia, pHw, pFade].map((v) => v.toFixed(3)).join(',');
    let tip = null;
    const writingTitle = pTitle > 0 && pTitle < 1;
    const writingHw = pHw > 0 && pHw < 1;
    const wave = (x, size) => Math.sin(x * 0.09) * size * 0.18;
    if (writingTitle) {
      const x = title.x0 + (title.x1 - title.x0) * pTitle;
      tip = new THREE.Vector2(x, title.cy + wave(x, title.size));
    } else if (pU1 > 0 && pU1 < 1) tip = new THREE.Vector2(title.x0 + (title.x1 - title.x0) * pU1, 312);
    else if (pU2 > 0 && pU2 < 1) tip = new THREE.Vector2(title.x0 + 30 + (title.x1 - title.x0 - 60) * pU2, 338);
    else if (writingHw) {
      const x = homework.x0 + (homework.x1 - homework.x0) * pHw;
      tip = new THREE.Vector2(x, homework.cy + wave(x, homework.size));
    }
    if (key === last && !(pDia > 0 && pDia < 1)) return tip;
    last = key;

    lg.clearRect(0, 0, BW, BH);
    chalkStyle(lg);
    if (pTitle > 0) {
      lg.save();
      lg.beginPath();
      lg.rect(0, 0, title.x0 + (title.x1 - title.x0) * pTitle + 4, BH);
      lg.clip();
      lg.drawImage(title.c, 0, 0);
      lg.restore();
    }
    for (const [p, y, inset] of [
      [pU1, 312, 0],
      [pU2, 338, 30],
    ]) {
      if (p <= 0) continue;
      lg.lineWidth = 9;
      lg.beginPath();
      const x0 = title.x0 + inset;
      const x1 = title.x1 - inset;
      for (let i = 0; i <= 40 * p; i++) {
        const x = x0 + ((x1 - x0) * i) / 40;
        const yy = y + Math.sin(i * 0.7 + y) * 2.5;
        if (i === 0) lg.moveTo(x, yy);
        else lg.lineTo(x, yy);
      }
      lg.stroke();
    }
    if (pDia > 0) {
      let len = total * pDia;
      lg.lineWidth = 10;
      for (let i = 0; i < diagram.length; i++) {
        if (len <= 0) break;
        const t2 = drawPolyPartial(lg, diagram[i], Math.min(len, lens[i]));
        if (pDia < 1 && len <= lens[i]) tip = t2;
        len -= lens[i];
      }
    }
    if (pHw > 0) {
      lg.save();
      lg.beginPath();
      lg.rect(0, 0, homework.x0 + (homework.x1 - homework.x0) * pHw + 4, BH);
      lg.clip();
      lg.drawImage(homework.c, 0, 0);
      lg.restore();
    }
    // textura de giz seco
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(mask, 0, 0);
    lg.globalCompositeOperation = 'source-over';

    g.globalAlpha = 1;
    g.drawImage(base, 0, 0);
    g.drawImage(layer, 0, 0);
    if (pFade > 0) {
      g.globalAlpha = pFade;
      g.fillStyle = '#07090c';
      g.fillRect(0, 0, BW, BH);
      if (logoImg) {
        const h = BH * 0.62;
        const w = (h * logoImg.width) / logoImg.height;
        g.globalAlpha = pFade;
        g.shadowColor = 'rgba(255,122,46,0.9)';
        g.shadowBlur = 60;
        g.drawImage(logoImg, BW / 2 - w / 2, BH / 2 - h / 2, w, h);
        g.shadowBlur = 0;
      } else drawInfinity(g, BW / 2, BH / 2, BW * 0.4, 40, '#FF7A2E', 40);
      g.globalAlpha = 1;
    }
    tex.needsUpdate = true;
    return tip;
  }
  update(0);
  return { tex, update, canvas };
}
