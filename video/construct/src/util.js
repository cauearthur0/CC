import * as THREE from 'three';

export const ORANGE = 0xff7a2e;
export const CYAN = 0x22d3ee;

// ---------- matemática ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smoother = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const easeOutBack = (t, s = 1.7) => {
  t = clamp(t) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
// janela suave: 0 fora de [a,d], 1 dentro de [b,c]
export const win = (x, a, b, c, d) => smooth(invLerp(a, b, x)) * (1 - smooth(invLerp(c, d, x)));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- infinito (lemniscata de Bernoulli) ----------
export function lemniscatePoint(t, a = 1) {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const d = 1 + s * s;
  return [(a * c) / d, (a * s * c) / d];
}

export class InfinityCurve extends THREE.Curve {
  constructor(width = 1, depth = 0) {
    super();
    this.width = width;
    this.depth = depth; // leve profundidade no cruzamento para o tubo não se atravessar
  }
  getPoint(u, target = new THREE.Vector3()) {
    const t = u * Math.PI * 2;
    const [x, y] = lemniscatePoint(t, this.width / 2);
    // y da lemniscata é pequeno; abrimos um pouco os laços
    return target.set(x, y * 1.25, Math.sin(2 * t) * this.depth);
  }
}

export function infinityTube(width, radius, tubular = 160, radial = 12, depth = 0.0) {
  return new THREE.TubeGeometry(new InfinityCurve(width, depth), tubular, radius, radial, true);
}

// textura com o símbolo ∞ desenhado (traço branco com brilho)
export function infinityTexture(size = 256, lineFrac = 0.11, glow = true) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size / 2;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  drawInfinity(g, c.width / 2, c.height / 2, c.width * 0.8, c.height * lineFrac * 1.6, '#ffffff', glow ? c.height * 0.12 : 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function drawInfinity(g, cx, cy, width, lineWidth, color, blur = 0) {
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  const a = width / 2;
  for (let i = 0; i <= 200; i++) {
    const t = (i / 200) * Math.PI * 2;
    const [x, y] = lemniscatePoint(t, a);
    if (i === 0) g.moveTo(x, -y * 1.25);
    else g.lineTo(x, -y * 1.25);
  }
  g.closePath();
  g.lineWidth = lineWidth;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = color;
  if (blur > 0) {
    g.shadowColor = color;
    g.shadowBlur = blur;
  }
  g.stroke();
  if (blur > 0) {
    g.shadowBlur = blur * 0.4;
    g.stroke();
  }
  g.restore();
}

// textura radial suave (sombras de contato, brilhos)
export function radialTexture(size = 128, inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---------- voxels ----------
// Grade de voxels com remoção de faces escondidas. Cada voxel: cor [r,g,b] linear,
// flag glow (vai para a geometria emissiva) e anim (0 parado, 1 pula, 2 desliza, 3 gira).
export class VoxelGrid {
  constructor() {
    this.map = new Map();
  }
  key(x, y, z) {
    return x + ',' + y + ',' + z;
  }
  set(x, y, z, color, glow = false, anim = 0) {
    const c = new THREE.Color(color);
    this.map.set(this.key(x, y, z), { x, y, z, c, glow, anim });
  }
  box(x0, y0, z0, x1, y1, z1, color, glow = false, anim = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, color, glow, anim);
  }
  del(x, y, z) {
    this.map.delete(this.key(x, y, z));
  }
  has(x, y, z) {
    return this.map.has(this.key(x, y, z));
  }
  get(x, y, z) {
    return this.map.get(this.key(x, y, z));
  }
}

const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92 },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];

// Gera geometria a partir de uma grade. offset em unidades de voxel; size = tamanho do voxel.
// filter(v) escolhe quais voxels entram (ex.: só glow).
export function meshVoxels(grid, size, offset, filter = () => true, extra = null) {
  const pos = [];
  const nor = [];
  const col = [];
  const anim = [];
  const grp = [];
  for (const v of grid.map.values()) {
    if (!filter(v)) continue;
    for (const f of FACES) {
      const nb = grid.get(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2]);
      // face escondida se o vizinho existe, é do mesmo tipo (glow/sólido) e da mesma animação
      if (nb && nb.glow === v.glow && nb.anim === v.anim && filter(nb) && (nb.group ?? 0) === (v.group ?? 0)) continue;
      const quad = f.v.map((p) => [
        (v.x + p[0] + offset[0]) * size,
        (v.y + p[1] + offset[1]) * size,
        (v.z + p[2] + offset[2]) * size,
      ]);
      const idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx) {
        pos.push(...quad[i]);
        nor.push(...f.n);
        const s = v.glow ? 1 : f.shade;
        col.push(v.c.r * s, v.c.g * s, v.c.b * s);
        anim.push(v.anim);
        grp.push(v.group ?? 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aAnim', new THREE.Float32BufferAttribute(anim, 1));
  g.setAttribute('aGroup', new THREE.Float32BufferAttribute(grp, 1));
  return g;
}

// Cor em espaço linear a partir de hex sRGB
export const lin = (hex) => new THREE.Color(hex);
