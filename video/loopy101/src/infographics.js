import { drawInfinity } from './util.js';

// Gráficos das lições. Se o PNG de verdade existir em assets/infographics/ ele é usado;
// senão, desenhamos uma versão provisória com o mesmo conteúdo (só o número 0.8%).
const W = 1920;
const H = 1080;
const OR = '#FF7A2E';
const CY = '#22D3EE';
const BG = '#0b0d12';

async function tryLoad(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return null;
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H / 2, W * 0.7);
  grd.addColorStop(0, '#141923');
  grd.addColorStop(1, BG);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // grade sutil
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  return { c, g };
}
const label = (g, text, x, y, size = 30, color = '#c9d1dc', weight = 600, font = 'Inter') => {
  g.font = `${weight} ${size}px "${font}", sans-serif`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
};
const header = (g, text) => {
  g.font = `500 26px "JetBrains Mono", monospace`;
  g.letterSpacing = '6px';
  g.fillStyle = '#7f8a9a';
  g.textAlign = 'center';
  g.fillText(text, W / 2, 130);
  g.letterSpacing = '0px';
};
function coin(g, x, y, r, { grey = false, hollow = false, logo = null } = {}) {
  g.save();
  const grd = g.createLinearGradient(x - r, y - r, x + r, y + r);
  if (grey) {
    grd.addColorStop(0, '#9aa1aa');
    grd.addColorStop(1, '#5d636c');
  } else {
    grd.addColorStop(0, '#ffb066');
    grd.addColorStop(1, '#e8601c');
  }
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = r * 0.08;
  g.strokeStyle = grey ? '#c4cad2' : '#ffd2a8';
  g.beginPath();
  g.arc(x, y, r * 0.8, 0, Math.PI * 2);
  g.stroke();
  if (hollow) {
    g.fillStyle = 'rgba(11,13,18,0.85)';
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  if (logo) {
    const w = r * 1.25;
    const h = (w * logo.height) / logo.width;
    g.drawImage(logo, x - w / 2, y - h / 2, w, h);
  }
  g.restore();
}
function arrow(g, x0, y0, x1, y1, color = '#5d6676', w = 8) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1 - 18, y1);
  g.stroke();
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - 28, y1 - 18);
  g.lineTo(x1 - 28, y1 + 18);
  g.closePath();
  g.fill();
  g.restore();
}
function gameIcon(g, x, y, s) {
  // mini mundo de voxel visto de lado: plataforma + blocos coloridos + brilho
  g.save();
  g.translate(x, y);
  const cols = ['#2ecc71', '#e74c3c', '#2ecc71', '#2ecc71', '#e74c3c', '#2ecc71'];
  const hs = [0.35, 0.55, 0.45, 0.8, 0.65, 1.0];
  g.shadowColor = 'rgba(34,211,238,0.6)';
  g.shadowBlur = 30;
  g.fillStyle = '#123e4a';
  g.fillRect(-s, s * 0.35, s * 2, s * 0.22);
  g.shadowBlur = 0;
  g.fillStyle = CY;
  g.fillRect(-s, s * 0.33, s * 2, s * 0.05);
  hs.forEach((h, i) => {
    g.fillStyle = cols[i];
    g.fillRect(-s * 0.85 + i * s * 0.3, s * 0.33 - h * s * 0.8, s * 0.2, h * s * 0.8);
  });
  g.fillStyle = '#63bf47';
  g.beginPath();
  g.ellipse(-s * 0.25, s * 0.33 - 0.62 * s * 0.8 - s * 0.12, s * 0.13, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
function sentenceCard(g, x, y, text) {
  g.save();
  g.font = `500 34px "JetBrains Mono", monospace`;
  const w = g.measureText(text).width + 90;
  g.fillStyle = '#161b25';
  g.strokeStyle = 'rgba(34,211,238,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x - w / 2, y - 48, w, 96, 20);
  g.fill();
  g.stroke();
  g.fillStyle = OR;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('›', x - w / 2 + 26, y);
  g.fillStyle = '#eef2f6';
  g.fillText(text, x - w / 2 + 58, y);
  g.restore();
}

function drawEmptyCoins(logo) {
  const { c, g } = canvas();
  header(g, 'MOST LAUNCHPADS');
  for (let i = 0; i < 5; i++) {
    const x = W / 2 + (i - 2) * 250;
    coin(g, x, 520, 95, { grey: true, hollow: true });
    g.strokeStyle = 'rgba(200,210,222,0.35)';
    g.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(x, 520, 95 + k * 18, -0.5, 0.5);
      g.stroke();
    }
  }
  label(g, 'a coin.', W / 2 - 150, 760, 58, '#eef2f6', 800);
  label(g, 'nothing inside.', W / 2 + 175, 760, 58, '#7f8a9a', 800);
  void logo;
  return c;
}
function drawCoinToGame(logo) {
  const { c, g } = canvas();
  header(g, 'ON LOOPLOOT');
  coin(g, 340, 520, 120, { logo });
  arrow(g, 500, 520, 640, 520);
  sentenceCard(g, 960, 520, 'one sentence');
  arrow(g, 1290, 520, 1420, 520);
  gameIcon(g, 1600, 520, 150);
  label(g, 'your coin', 340, 720, 40, '#c9d1dc', 700);
  label(g, 'you write', 960, 720, 40, '#c9d1dc', 700);
  label(g, 'its own game', 1600, 720, 40, OR, 800);
  return c;
}
export const FEE_FOCUS = [0.5, 0.47];
function drawFeeFlow(logo) {
  const { c, g } = canvas();
  header(g, 'WHERE THE FEE GOES');
  // troca (duas setas)
  g.save();
  g.translate(330, 510);
  g.strokeStyle = '#c9d1dc';
  g.lineWidth = 10;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(0, 0, 80, s > 0 ? -2.6 : 0.55, s > 0 ? -0.55 : 2.6);
    g.stroke();
  }
  g.restore();
  label(g, 'every trade', 330, 690, 40, '#c9d1dc', 700);
  arrow(g, 470, 510, 720, 510, OR, 12);
  // 0.8% em destaque
  g.save();
  g.shadowColor = 'rgba(255,122,46,0.55)';
  g.shadowBlur = 50;
  label(g, '0.8%', W * FEE_FOCUS[0], H * FEE_FOCUS[1], 170, OR, 900);
  g.restore();
  arrow(g, 1200, 510, 1400, 510, OR, 12);
  // baú com ∞ e console
  g.save();
  g.translate(1600, 500);
  g.fillStyle = '#5a3b22';
  g.strokeStyle = '#c9a26b';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(-130, -40, 260, 150, 16);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(-130, -40);
  g.quadraticCurveTo(0, -150, 130, -40);
  g.closePath();
  g.fillStyle = '#6d4a2c';
  g.fill();
  g.stroke();
  if (logo) {
    const w = 150;
    const h = (w * logo.height) / logo.width;
    g.drawImage(logo, -w / 2, 35 - h / 2, w, h);
  } else drawInfinity(g, 0, 35, 140, 14, OR, 12);
  g.restore();
  label(g, "the coin's own game", 1600, 690, 40, OR, 800);
  return c;
}
function drawBuyBuilds(logo) {
  const { c, g } = canvas();
  header(g, 'SAME BUY');
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(W / 2 - 2, 220, 4, 640);
  label(g, 'elsewhere', W * 0.27, 250, 34, '#7f8a9a', 600, 'JetBrains Mono');
  label(g, 'on looploot', W * 0.73, 250, 34, OR, 600, 'JetBrains Mono');
  coin(g, W * 0.27, 520, 120, { grey: true, hollow: true });
  label(g, '...', W * 0.27, 720, 64, '#7f8a9a', 800);
  coin(g, W * 0.73 - 170, 520, 100, { logo });
  arrow(g, W * 0.73 - 50, 520, W * 0.73 + 60, 520, OR, 10);
  gameIcon(g, W * 0.73 + 200, 540, 110);
  label(g, 'builds a game', W * 0.73, 720, 46, OR, 800);
  return c;
}

export async function loadGraphics(tl, logo, base = '../assets/infographics/') {
  const draw = { 'empty-coins.png': drawEmptyCoins, 'coin-to-game.png': drawCoinToGame, 'fee-flow.png': drawFeeFlow, 'buy-builds.png': drawBuyBuilds };
  const out = {};
  for (const gr of tl.graphics) {
    const img = await tryLoad(base + gr.file);
    out[gr.file] = img ? { img, real: true } : { img: draw[gr.file](logo), real: false };
  }
  return out;
}
