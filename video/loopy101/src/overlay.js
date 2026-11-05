import { smooth, invLerp, easeOutCubic, easeInOutSine, clamp } from './util.js';

// Legendas (pílula escura, fala de aluno entre aspas, texto digitado, "correct." com estrela),
// gráficos em tela cheia com zoom lento, e a cartela final com o ∞ da marca.
export function makeOverlay(W, H, tl, graphics, logo, { captions = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const U = H / 1080;
  const WHO = { cat: '#d8553f', whale: '#4a86d6', frog: '#63bf47', shiba: '#e58e3c' };

  function star(x, y, r, color = '#ffc83d') {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(255,200,61,0.7)';
    ctx.shadowBlur = 16 * U;
    ctx.fill();
    ctx.restore();
  }

  function caption(t, c) {
    if (t < c.start || t > c.end) return;
    const style = c.style || 'pill';
    const fin = smooth(invLerp(c.start, c.start + 0.18, t));
    const fout = 1 - smooth(invLerp(c.end - 0.22, c.end, t));
    const a = fin * fout;
    const rise = (1 - easeOutCubic(invLerp(c.start, c.start + 0.3, t))) * 14 * U;
    const mono = style === 'typed';
    const size = (mono ? 34 : 38) * U;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = mono ? `500 ${size}px "JetBrains Mono", monospace` : `${style === 'quote' ? 'italic ' : ''}600 ${size}px "Inter", sans-serif`;
    let text = c.text;
    if (style === 'quote') text = `“${c.text}”`;
    let shown = text;
    if (mono) {
      const n = text.length;
      shown = text.slice(0, Math.min(n, Math.floor(n * invLerp(c.start, c.typeEnd, t) + 0.0001)));
    }
    const full = ctx.measureText(text).width;
    const extraL = mono ? size * 0.9 : style === 'quote' ? size * 0.75 : 0;
    const extraR = style === 'star' ? size * 1.3 : 0;
    const padX = size * 0.75;
    const bw = full + padX * 2 + extraL + extraR;
    const bh = size * 1.7;
    const cx = W / 2;
    const y = H * 0.875 + rise;
    ctx.fillStyle = 'rgba(14,16,22,0.72)';
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, y - bh * 0.66, bw, bh, bh / 2);
    ctx.fill();
    const x0 = cx - bw / 2 + padX + extraL;
    ctx.textBaseline = 'alphabetic';
    if (mono) {
      ctx.fillStyle = '#ff7a2e';
      ctx.fillText('›', x0 - size * 0.85, y);
    }
    if (style === 'quote') {
      ctx.fillStyle = WHO[c.who] || '#fff';
      ctx.beginPath();
      ctx.arc(x0 - size * 0.42, y - size * 0.32, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f6f7f9';
    ctx.fillText(shown, x0, y);
    if (mono && (shown.length < text.length || Math.sin(t * 9) > 0)) {
      const w = ctx.measureText(shown).width;
      ctx.fillStyle = '#ff7a2e';
      ctx.fillRect(x0 + w + size * 0.1, y - size * 0.8, size * 0.5, size * 0.95);
    }
    if (style === 'star') {
      const pop = easeOutCubic(invLerp(c.start + 0.1, c.start + 0.45, t));
      star(x0 + full + size * 0.75, y - size * 0.33, size * 0.55 * (0.4 + 0.6 * pop) * (1 + 0.1 * Math.sin(t * 6)));
    }
    ctx.restore();
  }

  function graphic(t) {
    for (const gr of tl.graphics) {
      if (t < gr.start || t >= gr.end) continue;
      const g = graphics[gr.file];
      const u = (t - gr.start) / (gr.end - gr.start);
      const z = gr.zoom[0] + (gr.zoom[1] - gr.zoom[0]) * easeInOutSine(u);
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, W, H);
      const img = g.img;
      const s = Math.min(W / img.width, H / img.height) * z;
      const fx = gr.focus[0] * img.width;
      const fy = gr.focus[1] * img.height;
      // o ponto de foco vai do centro da imagem para o centro da tela
      const k = (z - gr.zoom[0]) / Math.max(1e-6, gr.zoom[1] - gr.zoom[0]);
      const ox = W / 2 - (img.width / 2 + (fx - img.width / 2) * k) * s;
      const oy = H / 2 - (img.height / 2 + (fy - img.height / 2) * k) * s;
      ctx.drawImage(img, ox, oy, img.width * s, img.height * s);
      // entrada e saída rápidas (flash suave)
      const fin = 1 - smooth(invLerp(gr.start, gr.start + 0.18, t));
      const fout = smooth(invLerp(gr.end - 0.15, gr.end, t));
      if (fin > 0) {
        ctx.fillStyle = `rgba(255,255,255,${fin * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (fout > 0) {
        ctx.fillStyle = `rgba(255,255,255,${fout * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
      return true;
    }
    return false;
  }
  function inGraphic(t) {
    return tl.graphics.some((g) => t >= g.start && t < g.end);
  }

  function endCard(t, endK) {
    if (endK <= 0) return;
    ctx.save();
    ctx.globalAlpha = endK;
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, W, H);
    if (logo) {
      const pulse = 1 + 0.02 * Math.sin(t * 2.4);
      const h = H * 0.34 * pulse;
      const w = (h * logo.width) / logo.height;
      ctx.shadowColor = 'rgba(255,122,46,0.75)';
      ctx.shadowBlur = (50 + 15 * Math.sin(t * 2.4)) * U;
      ctx.drawImage(logo, W / 2 - w / 2, H * 0.4 - h / 2, w, h);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    const [l1, l2] = tl.end.lines;
    if (t > l1.start) {
      const a = smooth(invLerp(l1.start, l1.start + 0.6, t));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${64 * U}px "Inter", sans-serif`;
      ctx.letterSpacing = `${-1 * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(tl.end.lines[0].text, W / 2, H * 0.7);
      ctx.restore();
    }
    if (t > l2.start) {
      const a = smooth(invLerp(l2.start, l2.start + 0.6, t));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#9aa3b2';
      ctx.font = `500 ${28 * U}px "JetBrains Mono", monospace`;
      ctx.letterSpacing = `${2.5 * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(l2.text, W / 2, H * 0.785);
      ctx.restore();
    }
  }

  function draw(t, glCanvas, { skip3D = false, endK = 0 } = {}) {
    const g = graphic(t);
    if (!g) {
      if (skip3D) {
        ctx.fillStyle = '#07090c';
        ctx.fillRect(0, 0, W, H);
      } else ctx.drawImage(glCanvas, 0, 0, W, H);
    }
    if (captions && !g) for (const c of tl.captions) caption(t, c);
    endCard(t, endK);
    return canvas;
  }
  return { canvas, draw, inGraphic };
}
export { clamp };
