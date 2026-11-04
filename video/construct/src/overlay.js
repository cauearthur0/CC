import { clamp, smooth, invLerp, drawInfinity, easeOutCubic } from './util.js';

// Legendas da edição (pequenas, caixa alta, monoespaçadas, embaixo) e a cartela final.
export function makeOverlay(W, H, tl, { vertical = false, captions = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const U = vertical ? W / 1080 : H / 1080; // unidade (1 = 1px em 1080p)
  const capSize = (vertical ? 34 : 25) * U;
  const subSize = (vertical ? 24 : 17) * U;
  const capY = vertical ? H * 0.8 : H * 0.885;

  function caption(t, c) {
    if (t < c.start || t > c.end) return;
    const text = c.text;
    const typed = Math.min(text.length, Math.floor((t - c.start) * 40));
    const fadeOut = 1 - smooth(invLerp(c.end - 0.35, c.end, t));
    const fadeIn = smooth(invLerp(c.start, c.start + 0.2, t));
    const a = fadeIn * fadeOut;
    if (a <= 0) return;
    const dark = c.tone === 'dark';
    ctx.save();
    ctx.font = `500 ${capSize}px "JetBrains Mono", monospace`;
    ctx.letterSpacing = `${capSize * 0.2}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const full = ctx.measureText(text).width;
    const shown = text.slice(0, typed);
    // alinha pelo texto inteiro para a frase não "andar" enquanto digita
    const x0 = W / 2 - full / 2;
    ctx.textAlign = 'left';
    if (!dark) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 10 * U;
    }
    ctx.fillStyle = dark ? `rgba(14,16,20,${0.9 * a})` : `rgba(242,245,248,${0.94 * a})`;
    ctx.fillText(shown, x0, capY);
    // cursor de bloco enquanto digita
    if (typed < text.length || Math.sin(t * 9) > 0) {
      const w = ctx.measureText(shown).width;
      ctx.fillStyle = dark ? `rgba(255,122,46,${0.95 * a})` : `rgba(255,122,46,${0.95 * a})`;
      ctx.shadowBlur = 0;
      ctx.fillRect(x0 + w + capSize * 0.12, capY - capSize * 0.8, capSize * 0.5, capSize * 0.95);
    }
    if (c.sub) {
      const st = c.start + text.length / 40 + 0.5;
      if (t > st) {
        const sa = smooth(invLerp(st, st + 0.4, t)) * fadeOut;
        ctx.font = `400 ${subSize}px "JetBrains Mono", monospace`;
        ctx.letterSpacing = `${subSize * 0.16}px`;
        ctx.textAlign = 'center';
        ctx.fillStyle = dark ? `rgba(40,44,52,${0.85 * sa})` : `rgba(230,235,240,${0.85 * sa})`;
        ctx.fillText(c.sub, W / 2, capY + capSize * 1.75);
      }
    }
    ctx.restore();
  }

  function endCard(t) {
    const e = tl.end;
    if (t < e.infinity) return;
    const k = smooth(invLerp(e.infinity, e.infinity + 0.9, t));
    const pulse = 1 + 0.035 * Math.sin((t - e.infinity) * Math.PI * 1.25);
    const cx = W / 2;
    const cy = vertical ? H * 0.4 : H * 0.4;
    const w = (vertical ? W * 0.36 : W * 0.15) * pulse * (0.92 + 0.08 * easeOutCubic(k));
    ctx.save();
    ctx.globalAlpha = k;
    const glow = 18 + 14 * (0.5 + 0.5 * Math.sin((t - e.infinity) * Math.PI * 1.25));
    drawInfinity(ctx, cx, cy, w, w * 0.095, '#FF7A2E', glow * U);
    ctx.restore();

    const l1 = e.line1;
    if (t > l1.start) {
      const a = smooth(invLerp(l1.start, l1.start + 0.7, t));
      const rise = (1 - easeOutCubic(invLerp(l1.start, l1.start + 0.9, t))) * 14 * U;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#0f1115';
      ctx.font = `600 ${(vertical ? 62 : 58) * U}px "Inter", sans-serif`;
      ctx.letterSpacing = `${-0.5 * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(l1.text, cx, (vertical ? H * 0.56 : H * 0.62) + rise);
      ctx.restore();
    }
    const l2 = e.line2;
    if (t > l2.start) {
      const a = smooth(invLerp(l2.start, l2.start + 0.7, t));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#5d6472';
      ctx.font = `500 ${(vertical ? 30 : 24) * U}px "JetBrains Mono", monospace`;
      ctx.letterSpacing = `${(vertical ? 3 : 2.5) * U}px`;
      ctx.textAlign = 'center';
      ctx.fillText(l2.text, cx, vertical ? H * 0.61 : H * 0.69);
      ctx.restore();
    }
  }

  function draw(t, glCanvas, skip3D = false) {
    if (skip3D) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    } else ctx.drawImage(glCanvas, 0, 0, W, H);
    if (captions) for (const c of tl.captions) caption(t, c);
    endCard(t);
    return canvas;
  }

  return { canvas, draw };
}

export { clamp };
