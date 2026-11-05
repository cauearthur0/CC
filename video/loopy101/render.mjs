// Renderiza o filme quadro a quadro num Chromium sem tela e codifica com ffmpeg.
//   node render.mjs --still 3,10,16.5            -> out/stills/*.png (prévia rápida)
//   node render.mjs                              -> out/looploot-101.mp4 (16:9)
//   node render.mjs --redo 10-13,27-31           -> refaz só esses trechos (ex.: depois de trocar os gráficos)
//   (o formato 9x16 ainda funciona com --format 9x16, mas este filme é só 16:9)
// Opções: --fps 24 --from 0 --to 61 --workers 2 --no-captions --out arquivo.mp4
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes('--' + k);
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json'), 'utf8'));
const format = opt('format', '16x9');
const scale = +opt('scale', 1);
const [W, H] = (format === '9x16' ? [1080, 1920] : [1920, 1080]).map((v) => Math.round((v * scale) / 2) * 2);
const fps = +opt('fps', tl.fps);
const from = +opt('from', 0);
const to = +opt('to', tl.duration);
const workers = +opt('workers', 2);
const captions = !flag('no-captions');
const outDir = path.join(ROOT, 'out');
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        rsp.writeHead(404);
        return rsp.end();
      }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(port) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: Math.min(W, 1920), height: Math.min(H, 1920) }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?w=${W}&h=${H}&captions=${captions ? 1 : 0}${opt("query", "")}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  return { browser, page };
}

const b64 = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

async function stills(port, times) {
  const dir = path.join(outDir, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage(port);
  for (const t of times) {
    const t0 = Date.now();
    const url = await page.evaluate(([t]) => window.renderFrame(t, 'image/png'), [t]);
    const f = path.join(dir, `${format}-${String(t.toFixed(2)).padStart(6, '0')}.png`);
    fs.writeFileSync(f, b64(url));
    console.log(f, `${Date.now() - t0} ms`);
  }
  await browser.close();
}

function encoder(file, crf = 12) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  return { ff, done };
}

async function renderRange(port, f0, f1, file, label) {
  const { browser, page } = await openPage(port);
  const { ff, done } = encoder(file);
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const url = await page.evaluate(([t]) => window.renderFrame(t, 'image/jpeg', 0.96), [f / fps]);
    const buf = b64(url);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 24 === 0) {
      const el = (Date.now() - t0) / 1000;
      const per = el / (f - f0 + 1);
      console.log(`[${label}] quadro ${f}/${f1 - 1}  ${per.toFixed(2)} s/quadro  faltam ~${((f1 - f) * per / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
}

function writeSrt() {
  const ts = (t) => {
    const ms = Math.round(t * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  const items = tl.captions.map((c) => ({ start: c.start, end: c.end, text: c.style === 'quote' ? `“${c.text}”` : c.text }));
  tl.end.lines.forEach((l, i) => items.push({ start: l.start, end: tl.duration, text: l.text }));
  const srt = items.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(outDir, 'legendas.srt'), srt);
}

if (flag('srt')) {
  writeSrt();
  console.log('legendas.srt pronto');
  process.exit(0);
}

const srv = await serve();
const port = srv.address().port;
if (flag('still')) {
  const times = (opt('still', '') || '').split(',').filter(Boolean).map(Number);
  await stills(port, times);
} else {
  // Renderiza em pedaços de 2 s gravados em disco: se o processo cair, roda de novo e
  // ele continua de onde parou. Para refazer um trecho, apague os pedaços dele.
  const CH = 2 * fps;
  const F0 = Math.round(from * fps);
  const F1 = Math.round(to * fps);
  const tag = `${format}${captions ? '' : '-sem-legenda'}${scale !== 1 ? '-x' + scale : ''}-${fps}fps`;
  const partsDir = path.join(outDir, '.parts', tag);
  fs.mkdirSync(partsDir, { recursive: true });
  const chunks = [];
  for (let a = F0; a < F1; a += CH) {
    const file = path.join(partsDir, `q${String(a).padStart(5, '0')}-${String(Math.min(F1, a + CH)).padStart(5, '0')}.mp4`);
    chunks.push({ a, b: Math.min(F1, a + CH), file });
  }
  const redo = (opt('redo', '') || '').split(',').filter(Boolean).map((r) => r.split('-').map(Number));
  for (const c of chunks) {
    const a = c.a / fps;
    const b = c.b / fps;
    if (redo.some(([r0, r1]) => a < r1 && b > r0) && fs.existsSync(c.file)) fs.unlinkSync(c.file);
  }
  const todo = chunks.filter((c) => !fs.existsSync(c.file));
  console.log(`${chunks.length} pedaços, ${todo.length} para renderizar (${partsDir})`);
  let next = 0;
  const worker = async (wi) => {
    let ctx = null;
    while (next < todo.length) {
      const c = todo[next++];
      if (!ctx) ctx = await openPage(port);
      const tmp = c.file.replace(/\.mp4$/, '.tmp.mp4');
      const { ff, done } = encoder(tmp);
      const t0 = Date.now();
      for (let f = c.a; f < c.b; f++) {
        const url = await ctx.page.evaluate(([t]) => window.renderFrame(t, 'image/jpeg', 0.96), [f / fps]);
        const buf = b64(url);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end();
      await done;
      fs.renameSync(tmp, c.file);
      const per = (Date.now() - t0) / 1000 / (c.b - c.a);
      const left = todo.length - next;
      console.log(`[w${wi}] ${(c.a / fps).toFixed(0)}-${(c.b / fps).toFixed(0)} s pronto  ${per.toFixed(2)} s/quadro  faltam ${left} pedaços`);
    }
    if (ctx) await ctx.browser.close();
  };
  await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, i) => worker(i + 1)));
  const list = path.join(partsDir, 'lista.txt');
  fs.writeFileSync(list, chunks.map((c) => `file '${c.file}'`).join('\n'));
  const out = opt('out', path.join(outDir, `looploot-101${format === '16x9' ? '' : '-' + format}${captions ? '' : '-sem-legenda'}.mp4`));
  const audio = path.join(outDir, 'trilha.wav');
  const hasAudio = fs.existsSync(audio);
  // duas passadas com taxa fixa: o grão de filme deixaria o arquivo enorme em CRF
  const mbps = opt('mbps', '6');
  const q = (arr) => arr.map((a) => `'${a}'`).join(' ');
  const video = ['-f', 'concat', '-safe', '0', '-i', list];
  const venc = ['-c:v', 'libx264', '-preset', 'slow', '-b:v', `${mbps}M`, '-maxrate', `${mbps * 1.6}M`, '-bufsize', `${mbps * 3}M`, '-pix_fmt', 'yuv420p', '-r', String(fps), '-passlogfile', path.join(partsDir, 'x264')];
  execSync('ffmpeg -y -loglevel error ' + q([...video, ...venc, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']), { stdio: 'inherit' });
  const ffArgs = ['-y', '-loglevel', 'error', ...video];
  if (hasAudio) ffArgs.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  ffArgs.push(...venc, '-pass', '2');
  if (hasAudio) ffArgs.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  ffArgs.push('-movflags', '+faststart', out);
  execSync('ffmpeg ' + q(ffArgs), { stdio: 'inherit' });
  writeSrt();
  console.log('pronto:', out);
}
srv.close();
