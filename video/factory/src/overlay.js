import { smooth, invLerp, drawInfinity, easeOutCubic } from './util.js';

// Legendas: "documentário" (serifada itálica, tom de vídeo institucional) e "digitada"
// (monoespaçada com cursor laranja). Cartela final sobre preto.
export function makeOverlay(W, H, tl, { captions = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const U = H / 1080;

  function doc(t, c) {
    if (t < c.start || t > c.end) return;
    const a = smooth(invLerp(c.start, c.start + 0.45, t)) * (1 - smooth(invLerp(c.end - 0.4, c.end, t)));
    ctx.save();
    ctx.globalAlpha = a;
    const band = ctx.createLinearGradient(0, H * 0.74, 0, H);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = band;
    ctx.fillRect(0, H * 0.74, W, H * 0.26);
    ctx.font = `italic 400 ${46 * U}px "Libre Baskerville", serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 12 * U;
    ctx.shadowOffsetY = 2 * U;
    ctx.fillStyle = '#f4efe2';
    ctx.fillText(c.text, W / 2, H * 0.88);
    ctx.restore();
  }

  function typed(t, c) {
    if (t < c.start || t > c.end) return;
    const n = c.text.length;
    const shown = Math.min(n, Math.floor(n * invLerp(c.start, c.typeEnd, t) + 0.0001));
    const a = 1 - smooth(invLerp(c.end - 0.25, c.end, t));
    const size = 34 * U;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `500 ${size}px "JetBrains Mono", monospace`;
    ctx.letterSpacing = `${size * 0.02}px`;
    const full = ctx.measureText(c.text).width;
    const x0 = W / 2 - full / 2;
    const y = H * 0.87;
    // faixa escura discreta atrás do texto
    ctx.fillStyle = 'rgba(10,12,16,0.55)';
    const pad = size * 0.55;
    ctx.beginPath();
    ctx.roundRect(x0 - pad - size * 0.9, y - size * 1.05, full + pad * 2 + size * 1.6, size * 1.55, size * 0.35);
    ctx.fill();
    ctx.fillStyle = '#ff7a2e';
    ctx.fillText('›', x0 - size * 0.85, y);
    ctx.fillStyle = '#f5f7fa';
    const txt = c.text.slice(0, shown);
    ctx.fillText(txt, x0, y);
    if (shown < n || Math.sin(t * 9) > 0) {
      const w = ctx.measureText(txt).width;
      ctx.fillStyle = '#ff7a2e';
      ctx.fillRect(x0 + w + size * 0.1, y - size * 0.82, size * 0.52, size * 0.98);
    }
    ctx.restore();
  }

  function endCard(t) {
    const e = tl.end;
    if (t < e.infinity) return;
    const k = smooth(invLerp(e.infinity, e.infinity + 0.8, t));
    const pulse = 1 + 0.03 * Math.sin((t - e.infinity) * Math.PI * 1.3);
    ctx.save();
    ctx.globalAlpha = k;
    const w = W * 0.13 * pulse;
    drawInfinity(ctx, W / 2, H * 0.36, w, w * 0.095, '#FF7A2E', (20 + 12 * Math.sin((t - e.infinity) * 4)) * U);
    ctx.restore();
    const [l1, l2, l3] = e.lines;
    if (t > l1.start) {
      const a = smooth(invLerp(l1.start, l1.start + 0.6, t));
      const dim = t > l2.start ? 1 - 0.45 * smooth(invLerp(l2.start, l2.start + 0.5, t)) : 1;
      ctx.save();
      ctx.globalAlpha = a * dim;
      ctx.fillStyle = '#d7dbe2';
      ctx.font = `600 ${46 * U}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(l1.text, W / 2, H * 0.56);
      ctx.restore();
    }
    if (t > l2.start) {
      const a = smooth(invLerp(l2.start, l2.start + 0.5, t));
      const pop = 1 + (1 - easeOutCubic(invLerp(l2.start, l2.start + 0.45, t))) * 0.12;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, H * 0.655);
      ctx.scale(pop, pop);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${66 * U}px "Inter", sans-serif`;
      ctx.letterSpacing = `${-1 * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(l2.text, 0, 0);
      ctx.restore();
    }
    if (t > l3.start) {
      const a = smooth(invLerp(l3.start, l3.start + 0.6, t));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#8c94a3';
      ctx.font = `500 ${26 * U}px "JetBrains Mono", monospace`;
      ctx.letterSpacing = `${2.5 * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(l3.text, W / 2, H * 0.74);
      ctx.restore();
    }
  }

  function draw(t, glCanvas, mode = '3d') {
    if (mode === 'black') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    } else ctx.drawImage(glCanvas, 0, 0, W, H);
    if (captions)
      for (const c of tl.captions) {
        if (c.style === 'doc') doc(t, c);
        else typed(t, c);
      }
    endCard(t);
    return canvas;
  }
  return { canvas, draw };
}
