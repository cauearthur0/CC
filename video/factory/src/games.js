import * as THREE from 'three';
import { VoxelGrid, meshVoxels, mulberry32, clamp, smooth, lerp, easeOutBack } from './util.js';

// Os mini mundos que saem das moedas. Cada um: { group, update(a) } com a = segundos desde o "pop".
// Só arquétipos genéricos (sapo, shiba de chapéu, baleia, gato, touro), em voxel.

const SOLID = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
GLOW.color.setScalar(2.4);

export function vox(build, vs, center) {
  const V = new VoxelGrid();
  build(V);
  const off = [-center[0], -center[1], -center[2]];
  const g = new THREE.Group();
  const s = meshVoxels(V, vs, off, (v) => !v.glow);
  if (s.attributes.position.count) {
    const m = new THREE.Mesh(s, SOLID);
    m.castShadow = true;
    g.add(m);
  }
  const gl = meshVoxels(V, vs, off, (v) => v.glow);
  if (gl.attributes.position.count) g.add(new THREE.Mesh(gl, GLOW));
  return g;
}

function textTex(text, { w = 256, h = 128, fg = '#ffffff', bg = null, font = '900 92px "Inter", sans-serif', stroke = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) {
    g.lineWidth = 14;
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2 + 4);
  }
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const N = 16;
const VS = 0.03;
const W = N * VS;

// borda que brilha embaixo de cada mundo (laranja e ciano)
function rim(group) {
  const geo = new THREE.BoxGeometry(W + 0.03, 0.012, W + 0.03);
  const edges = new THREE.EdgesGeometry(geo);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: new THREE.Color(0xff7a2e).multiplyScalar(2.5) }));
  line.position.y = -0.006;
  group.add(line);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.9, W * 1.9),
    new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0xff9a4a).multiplyScalar(0.9) })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.02;
  group.add(glow);
}
let _glowTex = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

function baseBlock(V, top, side, depth = 2) {
  for (let x = 0; x < N; x++)
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < depth - 1; y++) V.set(x, y, z, side);
      V.set(x, depth - 1, z, typeof top === 'function' ? top(x, z) : top);
    }
}
const cell = (x, z) => [(x + 0.5 - N / 2) * VS, (z + 0.5 - N / 2) * VS];

// ---------- 1. sapo de gravata pulando em velas ----------
function frogWorld() {
  const group = new THREE.Group();
  const candles = [
    { x: 1, h: 4 },
    { x: 4, h: 6 },
    { x: 6, h: 5 },
    { x: 9, h: 8 },
    { x: 11, h: 7 },
    { x: 13, h: 10 },
  ];
  candles.forEach((c, i) => (c.green = i === 0 || c.h > candles[i - 1].h));
  group.add(
    vox(
      (V) => {
        for (let x = 0; x < N; x++)
          for (let z = 0; z < N; z++) {
            const edge = x === 0 || z === 0 || x === N - 1 || z === N - 1;
            V.set(x, 0, z, 0x3f5f4a);
            if (edge) V.set(x, 1, z, (x + z) % 3 ? 0x6b8f71 : 0x7fa383);
            else V.set(x, 1, z, 0x22d3ee, true);
          }
        for (const c of candles) {
          const col = c.green ? 0x2ecc71 : 0xe74c3c;
          V.box(c.x, 2, 7, c.x + 1, c.h, 8, col);
          V.box(c.x, c.h, 7, c.x + 1, c.h, 8, c.green ? 0x7dffb0 : 0xff8a80);
          V.set(c.x, c.h + 1, 7, 0x2b2b2b);
        }
        for (const [x, z] of [
          [2, 2],
          [13, 3],
          [3, 13],
          [12, 13],
        ])
          V.box(x, 2, z, x, 4, z, 0x4caf50);
      },
      VS,
      [N / 2, 0, N / 2]
    )
  );
  const frog = vox(
    (V) => {
      V.box(0, 0, 0, 3, 1, 3, 0x58c45a);
      V.box(0, 2, 1, 3, 2, 3, 0x58c45a);
      V.box(1, 0, 3, 2, 1, 3, 0xb8e986);
      V.set(0, 3, 2, 0xffffff);
      V.set(3, 3, 2, 0xffffff);
      V.set(0, 3, 3, 0x111111);
      V.set(3, 3, 3, 0x111111);
      V.set(1, 1, 4, 0xff7a2e);
      V.set(2, 1, 4, 0xff7a2e);
      V.set(1, 0, 4, 0xff7a2e);
      V.box(-1, 0, 0, -1, 0, 1, 0x3f9b42);
      V.box(4, 0, 0, 4, 0, 1, 0x3f9b42);
    },
    VS * 0.8,
    [2, 0, 2]
  );
  group.add(frog);
  const plusTex = textTex('+1', { fg: '#ffffff', stroke: '#ff7a2e', font: '800 84px "JetBrains Mono", monospace' });
  const pops = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: plusTex, transparent: true, depthWrite: false }));
    s.scale.set(0.09, 0.045, 1);
    group.add(s);
    pops.push(s);
  }
  rim(group);
  const top = (i) => {
    const c = candles[i];
    const [x, z] = cell(c.x + 0.5, 7.5);
    return new THREE.Vector3(x, (c.h + 1) * VS, z);
  };
  function update(a) {
    const T = 0.6;
    const u = Math.max(0, a - 0.45) / T;
    const k = Math.floor(u);
    const f = u - k;
    const i0 = k % candles.length;
    const i1 = (k + 1) % candles.length;
    const p0 = top(i0);
    const p1 = top(i1);
    const big = i1 === 0;
    const hop = clamp(f / 0.7);
    const p = p0.clone().lerp(p1, smooth(hop));
    p.y += Math.sin(hop * Math.PI) * (big ? 0.2 : 0.08);
    frog.position.copy(p);
    frog.rotation.y = big ? -Math.PI * 0.5 : Math.PI * 0.5 - 0.25;
    const land = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 0;
    frog.scale.set(1 + land * 0.25, 1 - land * 0.3, 1 + land * 0.25);
    if (a < 0.45) frog.position.copy(top(0));
    pops.forEach((s, j) => {
      const kk = k - j;
      const age = (u - kk - 0.7) * T;
      if (kk < 0 || age < 0 || age > 0.7 || a < 0.45) {
        s.visible = false;
        return;
      }
      s.visible = true;
      const pp = top((kk + 1) % candles.length);
      s.position.set(pp.x, pp.y + 0.08 + age * 0.12, pp.z);
      s.material.opacity = 1 - age / 0.7;
    });
  }
  return { group, update };
}

// ---------- 2. shiba de chapéu surfando a vela vermelha ----------
function shibaWorld() {
  const group = new THREE.Group();
  const slope = (x) => Math.round(11 - x * 0.6);
  group.add(
    vox(
      (V) => {
        baseBlock(V, (x, z) => ((x * 3 + z) % 7 ? 0x2f80ed : 0x56ccf2), 0x1b4f91, 2);
        for (let x = 0; x < N; x++) {
          const y = slope(x);
          for (let z = 4; z <= 11; z++) {
            for (let yy = Math.max(2, y - 2); yy <= y; yy++) V.set(x, yy, z, yy === y ? 0xff6b5e : 0xd63a2f);
          }
          if (x < 3) V.set(x, y + 1, 7, 0x2b2b2b);
        }
        for (let x = 11; x < N; x++) for (let z = 3; z <= 12; z++) if ((x + z) % 2) V.set(x, 2, z, 0xffffff, true);
      },
      VS,
      [N / 2, 0, N / 2]
    )
  );
  const surfer = new THREE.Group();
  const board = vox((V) => V.box(0, 0, 0, 7, 0, 2, 0x22d3ee) || V.box(0, 0, 1, 7, 0, 1, 0xff7a2e), VS * 0.7, [4, 0, 1.5]);
  surfer.add(board);
  const dog = vox(
    (V) => {
      const tan = 0xe8a04f;
      const white = 0xfff3e0;
      V.box(0, 1, 0, 4, 2, 2, tan);
      V.box(3, 1, 0, 4, 1, 2, white);
      for (const [x, z] of [
        [0, 0],
        [0, 2],
        [4, 0],
        [4, 2],
      ])
        V.set(x, 0, z, tan);
      V.box(4, 3, 0, 6, 5, 2, tan);
      V.box(6, 3, 0, 7, 3, 2, white);
      V.set(7, 4, 1, 0x111111);
      V.set(6, 5, 0, 0x111111);
      V.set(6, 5, 2, 0x111111);
      V.set(4, 6, 0, tan);
      V.set(4, 6, 2, tan);
      V.box(4, 6, 0, 6, 6, 2, 0x1d1d1d);
      V.box(5, 7, 1, 5, 8, 1, 0x1d1d1d);
      V.set(5, 7, 0, 0x1d1d1d);
      V.set(5, 7, 2, 0x1d1d1d);
      V.box(4, 7, 0, 6, 7, 2, 0x1d1d1d);
      V.box(4, 7, 0, 6, 7, 0, 0xff7a2e);
      V.box(-1, 3, 1, -1, 4, 1, tan);
      V.set(0, 4, 1, white);
    },
    VS * 0.7,
    [3, 0, 1]
  );
  dog.position.y = VS * 0.7;
  surfer.add(dog);
  group.add(surfer);
  const coinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.003, 10);
  const coinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd166).multiplyScalar(1.6) });
  const NC = 22;
  const flying = new THREE.InstancedMesh(coinGeo, coinMat, NC);
  group.add(flying);
  rim(group);
  const r = mulberry32(4);
  const cs = Array.from({ length: NC }, () => ({ ph: r(), vx: (r() - 0.3) * 0.25, vy: 0.3 + r() * 0.35, vz: (r() - 0.5) * 0.3 }));
  const m4 = new THREE.Matrix4();
  const pos = (u) => {
    const x = lerp(1, 14, u);
    const [wx, wz] = cell(x, 7.5);
    return new THREE.Vector3(wx, (slope(x) + 1) * VS, wz);
  };
  function update(a) {
    const T = 1.5;
    const u = ((a % T) + T) % T;
    let p;
    if (u < 1.1) {
      p = pos(u / 1.1);
      surfer.rotation.set(0, 0, -0.54 + Math.sin(a * 9) * 0.06);
      surfer.rotation.y = Math.sin(a * 5) * 0.1;
    } else {
      const k = (u - 1.1) / 0.4;
      p = pos(1).lerp(pos(0), smooth(k));
      p.y += Math.sin(k * Math.PI) * 0.22;
      surfer.rotation.set(0, 0, -0.54 - k * Math.PI * 2);
    }
    surfer.position.copy(p);
    cs.forEach((c, i) => {
      const age = (((a + c.ph * 0.9) % 0.9) + 0.9) % 0.9;
      const born = a - age;
      const b = u < 1.1 ? pos(clamp(((born % T) + T) % T / 1.1)) : pos(1);
      const q = new THREE.Vector3(b.x + c.vx * age - age * 0.1, b.y + c.vy * age - 1.5 * age * age, b.z + c.vz * age);
      m4.makeRotationX(age * 12 + i);
      m4.setPosition(q);
      flying.setMatrixAt(i, age > 0.05 && a > 0.2 ? m4 : m4.makeScale(0, 0, 0));
    });
    flying.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}

// ---------- 3. baleia de terno apertando o BUY ----------
function whaleWorld() {
  const group = new THREE.Group();
  group.add(vox((V) => baseBlock(V, (x, z) => ((x + z) % 2 ? 0x223355 : 0x2a3d63), 0x16213a, 2), VS, [N / 2, 0, N / 2]));
  const stripe = (() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#2ecc71';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#1e9e55';
    g.fillRect(0, 13, 16, 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const stackMat = new THREE.MeshLambertMaterial({ map: stripe });
  const stack = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 1, W * 0.7).translate(0, 0.5, 0), stackMat);
  stack.position.y = 2 * VS;
  group.add(stack);
  const plat = new THREE.Group();
  group.add(plat);
  const whale = vox(
    (V) => {
      const b = 0x3d7bd9;
      const belly = 0x9cc7ff;
      const suit = 0x1f2a44;
      for (let x = 0; x <= 8; x++)
        for (let y = 0; y <= 4; y++)
          for (let z = 0; z <= 4; z++) {
            const cx = (x - 4.5) / 4.8;
            const cy = (y - 2) / 2.6;
            const cz = (z - 2) / 2.6;
            if (cx * cx + cy * cy + cz * cz > 1.05) continue;
            let c = y <= 1 ? belly : b;
            if (x >= 4 && x <= 6 && y >= 1) c = suit;
            V.set(x, y, z, c);
          }
      V.box(7, 1, 1, 8, 2, 3, 0xffffff);
      V.box(8, 0, 2, 8, 2, 2, 0xc0392b);
      V.set(7, 3, 0, 0x111111);
      V.set(7, 3, 4, 0x111111);
      V.box(-2, 3, 0, -1, 4, 4, b);
      V.box(-1, 2, 1, -1, 2, 3, b);
    },
    VS * 0.85,
    [4, 0, 2]
  );
  whale.position.set(-0.06, 0, 0);
  plat.add(whale);
  const btnTex = textTex('BUY', { fg: '#ffffff', bg: '#27ae60', w: 256, h: 256, font: '900 104px "Inter", sans-serif' });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 24), new THREE.MeshLambertMaterial({ color: 0x8a96a6 }));
  ped.position.set(0.15, 0.025, 0);
  plat.add(ped);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 32), [
    new THREE.MeshLambertMaterial({ color: 0x27ae60, emissive: 0x0b4d26 }),
    new THREE.MeshBasicMaterial({ map: btnTex }),
    new THREE.MeshLambertMaterial({ color: 0x27ae60 }),
  ]);
  btn.rotation.y = -Math.PI / 2;
  plat.add(btn);
  rim(group);
  function update(a) {
    const T = 0.42;
    const n = Math.max(0, Math.floor(a / T));
    const f = Math.max(0, a / T - n);
    const level = n % 14;
    const h = (level + smooth(clamp(f * 3)) * (n > 0 ? 0 : 0)) * VS * 0.9 + 0.02;
    stack.scale.y = h;
    stackMat.map.repeat.set(1, Math.max(1, h / (VS * 0.9)));
    plat.position.y = 2 * VS + h;
    const nod = f < 0.35 ? Math.sin((f / 0.35) * Math.PI) : 0;
    whale.rotation.z = -nod * 0.35;
    whale.position.y = nod * 0.01;
    btn.position.set(0.15, 0.065 - nod * 0.012, 0);
  }
  return { group, update };
}

// ---------- 4. gato CEO demitindo todo mundo ----------
function catWorld() {
  const group = new THREE.Group();
  group.add(
    vox(
      (V) => {
        baseBlock(V, (x, z) => (Math.floor(x / 2) % 2 ? 0x9b6b3d : 0x8a5a2f), 0x5a3b22, 2);
        V.box(3, 2, 5, 12, 4, 10, 0x6d4024);
        V.box(3, 5, 5, 12, 5, 10, 0x8e5a32);
        for (let y = 6; y <= 9; y++) {
          const o = y % 3 === 0 ? 1 : 0;
          V.box(6 + o, y, 6, 9 + o, y, 9, y % 2 ? 0xffffff : 0xe8e8e8);
        }
        V.box(10, 6, 9, 11, 7, 9, 0x2b2b2b);
      },
      VS,
      [N / 2, 0, N / 2]
    )
  );
  const cat = vox(
    (V) => {
      const o = 0xf0a04b;
      const st = 0xc06a1f;
      const suit = 0x2c2f36;
      V.box(0, 0, 0, 3, 2, 3, suit);
      V.box(1, 1, 3, 2, 2, 3, 0xffffff);
      V.box(1, 0, 3, 1, 2, 3, 0xc0392b);
      V.box(0, 3, 0, 3, 5, 3, o);
      V.box(0, 5, 0, 3, 5, 3, st);
      V.set(0, 6, 0, o);
      V.set(3, 6, 0, o);
      V.set(0, 6, 3, o);
      V.set(3, 6, 3, o);
      V.set(0, 4, 3, 0x7ee081, true);
      V.set(3, 4, 3, 0x7ee081, true);
      V.box(1, 3, 3, 2, 3, 3, 0xffd7c4);
      V.box(-1, 0, 1, -1, 3, 1, st);
    },
    VS * 0.8,
    [1.5, 0, 1.5]
  );
  cat.position.set(...cell(7.5, 7.5).flatMap((v, i) => (i === 0 ? [v, 10 * VS] : [v])));
  group.add(cat);
  const paw = vox((V) => V.box(0, -4, 0, 0, 0, 0, 0xf0a04b) || V.set(0, -4, 0, 0xffffff), VS * 0.8, [0.5, 0, 0.5]);
  const pawPivot = new THREE.Group();
  pawPivot.position.set(cat.position.x - 2.2 * VS * 0.8, cat.position.y + 2.5 * VS * 0.8, cat.position.z + 0.01);
  pawPivot.add(paw);
  group.add(pawPivot);
  const workers = [];
  for (let i = 0; i < 3; i++) {
    const w = vox(
      (V) => {
        V.box(0, 0, 0, 0, 1, 0, 0x6b7480);
        V.set(0, 2, 0, 0x9aa2ab);
      },
      VS * 0.9,
      [0.5, 0, 0.5]
    );
    group.add(w);
    workers.push(w);
  }
  rim(group);
  const deskY = 6 * VS;
  function update(a) {
    const T = 0.8;
    let swing = 0;
    workers.forEach((w, i) => {
      const u = (((a - i * (T / 3)) % T) + T) % T;
      const cyc = Math.floor((a - i * (T / 3)) / T);
      const k = u / T;
      const [sx, sz] = cell(3.5, 7.5 + (i - 1) * 1.2);
      const [ex] = cell(4.6, 7.5);
      if (cyc < 0) {
        w.visible = false;
        return;
      }
      w.visible = true;
      if (k < 0.55) {
        w.position.set(lerp(sx, ex, k / 0.55), deskY + Math.abs(Math.sin(k * 30)) * 0.006, sz);
        w.rotation.set(0, 0, 0);
      } else {
        const f = (k - 0.55) / 0.45;
        w.position.set(ex - f * 0.35, deskY + f * 0.25 - f * f * 0.45, sz + f * 0.05);
        w.rotation.set(f * 9, 0, f * 6);
        if (f < 0.25) swing = Math.max(swing, 1 - f / 0.25);
      }
    });
    pawPivot.rotation.set(0, 0, -1.9 + swing * 1.5);
    cat.rotation.y = -0.4 + swing * 0.2;
  }
  return { group, update };
}

// ---------- 5. touro de olhos laser furando o labirinto-gráfico ----------
function bullWorld() {
  const group = new THREE.Group();
  group.add(vox((V) => baseBlock(V, (x, z) => ((x + z) % 2 ? 0x1d2230 : 0x232a3b), 0x151924, 2), VS, [N / 2, 0, N / 2]));
  // parede em zigue-zague (um gráfico), cada voxel é uma instância para poder voar
  const pts = [
    [0, 3],
    [3, 11],
    [6, 5],
    [9, 12],
    [12, 6],
    [15, 13],
  ];
  const cells = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(lerp(x0, x1, k / n));
      const z = Math.round(lerp(z0, z1, k / n));
      for (let y = 2; y <= 4; y++) if (!cells.some((c) => c.x === x && c.y === y && c.z === z)) cells.push({ x, y, z });
    }
  }
  const cubeGeo = new THREE.BoxGeometry(VS, VS, VS);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f6fd6, emissive: 0x0a2a5a });
  const walls = new THREE.InstancedMesh(cubeGeo, wallMat, cells.length);
  const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(VS, VS * 0.25, VS), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22d3ee).multiplyScalar(2.2) }), cells.length);
  group.add(walls, tops);
  const r = mulberry32(8);
  cells.forEach((c) => {
    c.v = [(r() - 0.5) * 1.2, 0.4 + r() * 0.8, (r() - 0.2) * 1.0];
    c.s = [r() * 10, r() * 10];
  });
  const bull = vox(
    (V) => {
      const b = 0x8b3a1a;
      V.box(0, 1, 0, 4, 3, 2, b);
      for (const [x, z] of [
        [0, 0],
        [0, 2],
        [4, 0],
        [4, 2],
      ])
        V.set(x, 0, z, 0x5a240f);
      V.box(5, 2, 0, 6, 4, 2, 0xa0482a);
      V.set(7, 2, 1, 0xd9a07a);
      V.set(6, 4, 0, 0xff3b30, true);
      V.set(6, 4, 2, 0xff3b30, true);
      V.box(5, 5, -1, 5, 5, -1, 0xf5f0dc);
      V.box(5, 5, 3, 5, 5, 3, 0xf5f0dc);
      V.set(5, 6, -1, 0xf5f0dc);
      V.set(5, 6, 3, 0xf5f0dc);
      V.set(-1, 3, 1, b);
    },
    VS * 0.85,
    [3, 0, 1]
  );
  group.add(bull);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.1).multiplyScalar(3), transparent: true, opacity: 0.9 });
  const beams = [];
  for (const s of [-1, 1]) {
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.004, 0.004).translate(0.11, 0, 0), beamMat);
    bull.add(bm);
    bm.position.set(3.2 * VS * 0.85, 4.5 * VS * 0.85, (1 + s) * VS * 0.85 - VS * 0.85 * 0.5 + 0.0);
    beams.push(bm);
  }
  rim(group);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const zRun = 8.5;
  function update(a) {
    const T = 2.4;
    const u = (((a % T) + T) % T) / T;
    const bx = lerp(-3, 18, u);
    const [wx, wz] = cell(bx, zRun - 0.5);
    bull.position.set(wx, 2 * VS + Math.abs(Math.sin(a * 16)) * 0.008, wz);
    beams.forEach((b, i) => (b.scale.x = 0.7 + 0.3 * Math.sin(a * 40 + i)));
    cells.forEach((c, i) => {
      const [cx, cz] = cell(c.x, c.z);
      const hitU = (c.x + 3) / 21;
      const near = Math.abs(c.z - zRun) < 2.2;
      const age = (u - hitU) * T;
      let p = new THREE.Vector3(cx, (c.y + 0.5) * VS, cz);
      let s = 1;
      if (near && age > 0) {
        p = p.add(new THREE.Vector3(c.v[0] * age, c.v[1] * age - 1.6 * age * age, c.v[2] * age));
        e.set(c.s[0] * age, 0, c.s[1] * age);
        q.setFromEuler(e);
        s = Math.max(0, 1 - age / 0.8);
      } else q.identity();
      m4.compose(p, q, new THREE.Vector3(s, s, s));
      walls.setMatrixAt(i, m4);
      const tp = p.clone();
      tp.y += VS * 0.6;
      m4.compose(tp, q, new THREE.Vector3(s, c.y === 4 ? s : 0, s));
      tops.setMatrixAt(i, m4);
    });
    walls.instanceMatrix.needsUpdate = true;
    tops.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}

export function buildGames() {
  return [frogWorld(), shibaWorld(), whaleWorld(), catWorld(), bullWorld()];
}
export const WORLD_SIZE = W;
export { easeOutBack };
