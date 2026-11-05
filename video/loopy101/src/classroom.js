import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mulberry32 } from './util.js';
import { buildChalk } from './chalk.js';

// A sala de aula: lousa verde, carteiras de madeira, globo, relógio, janelas com sol e a porta.
export const ROOM = { x0: -3.3, x1: 3.3, z0: -4.0, z1: 2.8, h: 3.0 };
export const BOARD = { x: 0, y: 1.02, z: -3.965, w: 3.3, h: 1.2 };
export const BENCH = { x: 0, z: -3.68, h: 0.55 };
export const DESKS = {
  frog: { x: -0.82, z: -1.55 },
  shiba: { x: 0.82, z: -1.55 },
  cat: { x: -0.82, z: 0.05 },
  whale: { x: 0.95, z: 0.1 },
};
export const DOOR = { x: 3.3, z: 1.55, w: 0.92, h: 2.05 };

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function woodFloor() {
  return tex(
    512,
    512,
    (g, w, h) => {
      const r = mulberry32(2);
      const ph = 64;
      for (let y = 0; y < h; y += ph) {
        let x = -r() * 300;
        while (x < w) {
          const len = 220 + r() * 260;
          const base = [176 + r() * 30, 118 + r() * 22, 70 + r() * 16];
          g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
          g.fillRect(x, y, len, ph);
          for (let k = 0; k < 14; k++) {
            g.strokeStyle = `rgba(90,52,22,${0.05 + r() * 0.08})`;
            g.lineWidth = 1 + r() * 2;
            g.beginPath();
            const yy = y + r() * ph;
            g.moveTo(x, yy);
            g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.7, yy + (r() - 0.5) * 8, x + len, yy);
            g.stroke();
          }
          g.fillStyle = 'rgba(60,35,15,0.55)';
          g.fillRect(x, y, 2, ph);
          x += len;
        }
        g.fillStyle = 'rgba(60,35,15,0.6)';
        g.fillRect(0, y, w, 2);
      }
    },
    [3, 3]
  );
}

function woodPanel(seed = 5, base = [160, 104, 58]) {
  return tex(256, 256, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = `rgb(${base.join(',')})`;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) {
      g.strokeStyle = `rgba(80,45,18,${0.04 + r() * 0.08})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const y = r() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 14, w * 0.7, y + (r() - 0.5) * 14, w, y);
      g.stroke();
    }
  });
}

function wallWithHoles(width, height, holes, color, wains) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.lineTo(-width / 2, 0);
  for (const [cx, cy, w, h] of holes) {
    const p = new THREE.Path();
    p.moveTo(cx - w / 2, cy - h / 2);
    p.lineTo(cx - w / 2, cy + h / 2);
    p.lineTo(cx + w / 2, cy + h / 2);
    p.lineTo(cx + w / 2, cy - h / 2);
    p.lineTo(cx - w / 2, cy - h / 2);
    s.holes.push(p);
  }
  const geo = new THREE.ShapeGeometry(s);
  // cor por altura: rodapé verde-água, faixa, parede creme
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const up = new THREE.Color(color);
  const low = new THREE.Color(wains);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y < 0.95 ? low : up;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildClassroom(renderer, logoImg, tl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6ead2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x7a5c3e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcae, 2.8);
  sun.position.set(-7.5, 5.2, -1.2);
  sun.target.position.set(0.3, 0, -0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4.5, bottom: -4.5, near: 1, far: 18 });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  for (const z of [-2.4, 0.8]) {
    const p = new THREE.PointLight(0xfff0d8, 0.9, 7, 2);
    p.position.set(0.4, 2.7, z);
    scene.add(p);
  }

  const mats = {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ map: woodPanel(5), roughness: 0.6 }),
    darkWood: new THREE.MeshStandardMaterial({ map: woodPanel(8, [110, 66, 34]), roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5f6b78, roughness: 0.35, metalness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.6 }),
  };
  const add = (geo, mat, x, y, z, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // chão e teto
  const floor = add(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), new THREE.MeshStandardMaterial({ map: woodFloor(), roughness: 0.55 }), 0, 0, (ROOM.z0 + ROOM.z1) / 2, false);
  floor.rotation.x = -Math.PI / 2;
  const ceil = add(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), mats.white, 0, ROOM.h, (ROOM.z0 + ROOM.z1) / 2, false);
  ceil.rotation.x = Math.PI / 2;
  for (const z of [-2.4, 0.8]) {
    const panel = add(new THREE.PlaneGeometry(1.4, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(1.6) }), 0.4, ROOM.h - 0.01, z, false);
    panel.rotation.x = Math.PI / 2;
  }

  // paredes
  const D = ROOM.z1 - ROOM.z0;
  const front = add(wallWithHoles(ROOM.x1 - ROOM.x0, ROOM.h, [], 0xf2e6cc, 0x6aa79f), mats.wall, 0, 0, ROOM.z0, false);
  const back = add(wallWithHoles(ROOM.x1 - ROOM.x0, ROOM.h, [], 0xf2e6cc, 0x6aa79f), mats.wall, 0, 0, ROOM.z1, false);
  back.rotation.y = Math.PI;
  const winZ = [-2.7, -0.95, 0.8];
  const left = add(
    wallWithHoles(D, ROOM.h, winZ.map((z) => [-(z - (ROOM.z0 + ROOM.z1) / 2), 1.55, 1.05, 1.3]), 0xf2e6cc, 0x6aa79f),
    mats.wall,
    ROOM.x0,
    0,
    (ROOM.z0 + ROOM.z1) / 2,
    false
  );
  left.rotation.y = Math.PI / 2;
  left.castShadow = true;
  const right = add(wallWithHoles(D, ROOM.h, [[DOOR.z - (ROOM.z0 + ROOM.z1) / 2, DOOR.h / 2, DOOR.w, DOOR.h]], 0xf2e6cc, 0x6aa79f), mats.wall, ROOM.x1, 0, (ROOM.z0 + ROOM.z1) / 2, false);
  right.rotation.y = -Math.PI / 2;
  // faixa de madeira na altura do encosto
  for (const [x, z, ry, len] of [
    [0, ROOM.z0 + 0.012, 0, ROOM.x1 - ROOM.x0],
    [0, ROOM.z1 - 0.012, Math.PI, ROOM.x1 - ROOM.x0],
  ]) {
    const r = add(new THREE.BoxGeometry(len, 0.06, 0.025), mats.darkWood, x, 0.95, z, false);
    r.rotation.y = ry;
  }
  // janelas: caixilho branco e céu claro do lado de fora
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.93, 1.0).multiplyScalar(1.5) });
  for (const z of winZ) {
    const sky = add(new THREE.PlaneGeometry(1.4, 1.6), skyMat, ROOM.x0 - 0.6, 1.55, z, false);
    sky.rotation.y = Math.PI / 2;
    for (const [dy, dz, sy, sz] of [
      [0.66, 0, 0.06, 1.12],
      [-0.66, 0, 0.06, 1.12],
      [0, 0.53, 1.38, 0.06],
      [0, -0.53, 1.38, 0.06],
      [0, 0, 1.3, 0.04],
      [0, 0, 0.04, 1.06],
    ])
      add(new THREE.BoxGeometry(0.08, sy, sz), mats.white, ROOM.x0 - 0.02, 1.55 + dy, z + dz, true);
    add(new THREE.BoxGeometry(0.22, 0.05, 1.2), mats.white, ROOM.x0 + 0.08, 0.88, z, true);
  }
  // porta aberta e corredor iluminado
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3f7f8c, roughness: 0.5 });
  const doorG = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(DOOR.w, DOOR.h, 0.05, 2, 0.01), doorMat);
  slab.position.set(DOOR.w / 2, DOOR.h / 2, 0);
  slab.castShadow = true;
  doorG.add(slab);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 0.9, roughness: 0.3 }));
  knob.position.set(DOOR.w - 0.08, 1.0, 0.04);
  doorG.add(knob);
  doorG.position.set(ROOM.x1 + 0.02, 0, DOOR.z + DOOR.w / 2);
  doorG.rotation.y = Math.PI / 2 + 1.75;
  scene.add(doorG);
  for (const [dz, w, h, y] of [
    [DOOR.w / 2 + 0.04, 0.08, DOOR.h + 0.08, DOOR.h / 2],
    [-DOOR.w / 2 - 0.04, 0.08, DOOR.h + 0.08, DOOR.h / 2],
    [0, DOOR.w + 0.16, 0.08, DOOR.h + 0.04],
  ]) {
    add(new THREE.BoxGeometry(0.14, h, w), mats.trim, ROOM.x1 - 0.02, y, DOOR.z + dz, true);
  }
  const hall = add(new THREE.PlaneGeometry(3, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(1.2) }), ROOM.x1 + 1.4, 1.3, DOOR.z, false);
  hall.rotation.y = -Math.PI / 2;
  const hallFloor = add(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.8 }), ROOM.x1 + 0.75, 0.001, DOOR.z, false);
  hallFloor.rotation.x = -Math.PI / 2;
  // sinal da escola (campainha vermelha na parede)
  const bell = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8322b, metalness: 0.6, roughness: 0.3 }));
  dome.rotation.z = -Math.PI / 2;
  bell.add(dome);
  const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), mats.metal);
  bellBase.rotation.z = Math.PI / 2;
  bellBase.position.x = 0.01;
  bell.add(bellBase);
  bell.position.set(ROOM.x1 - 0.03, 2.35, DOOR.z - 0.85);
  scene.add(bell);

  // lousa
  const chalk = buildChalk(tl, logoImg);
  const boardMat = new THREE.MeshStandardMaterial({ map: chalk.tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: chalk.tex, emissiveIntensity: 0 });
  const board = add(new THREE.PlaneGeometry(BOARD.w, BOARD.h), boardMat, BOARD.x, BOARD.y, BOARD.z, false);
  board.castShadow = false;
  for (const [dx, dy, w, h] of [
    [0, BOARD.h / 2 + 0.04, BOARD.w + 0.16, 0.08],
    [0, -BOARD.h / 2 - 0.04, BOARD.w + 0.16, 0.08],
    [BOARD.w / 2 + 0.04, 0, 0.08, BOARD.h],
    [-BOARD.w / 2 - 0.04, 0, 0.08, BOARD.h],
  ])
    add(new THREE.BoxGeometry(w, h, 0.05), mats.darkWood, BOARD.x + dx, BOARD.y + dy, BOARD.z + 0.01, true);
  add(new THREE.BoxGeometry(BOARD.w, 0.03, 0.09), mats.darkWood, BOARD.x, BOARD.y - BOARD.h / 2 - 0.07, BOARD.z + 0.05, true);
  const chalkPieceMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.9 });
  for (const x of [-1.1, -1.02, 0.9]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8).rotateZ(Math.PI / 2), chalkPieceMat, x, BOARD.y - BOARD.h / 2 - 0.045, BOARD.z + 0.06, true);
  const eraser = add(new RoundedBoxGeometry(0.16, 0.04, 0.06, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }), 1.25, BOARD.y - BOARD.h / 2 - 0.035, BOARD.z + 0.06, true);
  void eraser;

  // relógio
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 40).rotateX(Math.PI / 2), mats.white);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 10, 40), new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.4 }));
  clock.add(face, rim);
  const tickMat = new THREE.MeshBasicMaterial({ color: 0x2c2f35 });
  for (let i = 0; i < 12; i++) {
    const tk = new THREE.Mesh(new THREE.BoxGeometry(0.008, i % 3 ? 0.02 : 0.035, 0.004), tickMat);
    const a = (i / 12) * Math.PI * 2;
    tk.position.set(Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0.017);
    tk.rotation.z = -a;
    clock.add(tk);
  }
  const hand = (len, w, color, z) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004).translate(0, len / 2 - 0.015, 0), new THREE.MeshBasicMaterial({ color }));
    m.position.z = z;
    g.add(m);
    clock.add(g);
    return g;
  };
  const hourH = hand(0.09, 0.014, 0x2c2f35, 0.02);
  const minH = hand(0.14, 0.009, 0x2c2f35, 0.022);
  const secH = hand(0.15, 0.004, 0xd23c32, 0.024);
  clock.position.set(0, 2.08, ROOM.z0 + 0.03);
  scene.add(clock);

  // mesa do professor, globo, livros, maçã
  const tdesk = new THREE.Group();
  tdesk.add(Object.assign(new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.06, 0.65, 2, 0.015), mats.wood), { castShadow: true, receiveShadow: true }));
  tdesk.children[0].position.y = 0.74;
  const tfront = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.6, 0.03), mats.darkWood);
  tfront.position.set(0, 0.42, 0.3);
  tfront.castShadow = true;
  tdesk.add(tfront);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.6), mats.darkWood);
    side.position.set(sx * 0.6, 0.36, 0);
    side.castShadow = true;
    tdesk.add(side);
  }
  const globe = new THREE.Group();
  const gtex = tex(512, 256, (g, w, h) => {
    g.fillStyle = '#4aa3d8';
    g.fillRect(0, 0, w, h);
    const r = mulberry32(9);
    g.fillStyle = '#7cc46a';
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const x = r() * w;
      const y = 40 + r() * (h - 80);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const rr = 14 + r() * 34;
        const px = x + Math.cos(a) * rr * 1.4;
        const py = y + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.fill();
    }
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 20), new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.45 }));
  ball.position.y = 0.34;
  ball.rotation.z = 0.41;
  ball.castShadow = true;
  globe.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 8, 40, Math.PI * 1.1), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }));
  ring.position.y = 0.34;
  ring.rotation.set(0, Math.PI / 2, 0.41 + Math.PI * 0.95);
  globe.add(ring);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.07, 0.17, 16), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.5 }));
  stand.position.y = 0.09;
  globe.add(stand);
  globe.position.set(-0.35, 0.77, -0.05);
  tdesk.add(globe);
  const bookCols = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60];
  bookCols.forEach((c, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.05, 0.17, 1, 0.005), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    b.position.set(0.3, 0.8 + i * 0.05, -0.02);
    b.rotation.y = (i - 1.5) * 0.12;
    b.castShadow = true;
    tdesk.add(b);
  });
  const apple = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd62d20, roughness: 0.35 }));
  apple.position.set(0.05, 0.815, 0.12);
  apple.castShadow = true;
  tdesk.add(apple);
  tdesk.position.set(2.05, 0, -3.05);
  scene.add(tdesk);

  // banco comprido na frente da lousa (o Loopy sobe para alcançar)
  const bench = new THREE.Group();
  const btop = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.05, 0.32, 2, 0.015), mats.wood);
  btop.position.y = BENCH.h - 0.025;
  btop.castShadow = btop.receiveShadow = true;
  bench.add(btop);
  for (const sx of [-0.75, 0.75])
    for (const sz of [-0.12, 0.12]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, BENCH.h - 0.05, 0.04), mats.darkWood);
      l.position.set(sx, (BENCH.h - 0.05) / 2, sz);
      l.castShadow = true;
      bench.add(l);
    }
  bench.position.set(BENCH.x, 0, BENCH.z);
  scene.add(bench);

  // carteiras e cadeiras
  const deskGroups = {};
  for (const [name, d] of Object.entries(DESKS)) {
    const g = new THREE.Group();
    const big = name === 'whale';
    const top = new THREE.Mesh(new RoundedBoxGeometry(big ? 0.9 : 0.78, 0.04, 0.5, 2, 0.012), mats.wood);
    top.position.y = 0.52;
    top.castShadow = top.receiveShadow = true;
    g.add(top);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8), mats.metal);
        l.position.set(sx * (big ? 0.4 : 0.34), 0.25, sz * 0.2);
        l.castShadow = true;
        g.add(l);
      }
    const rack = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.8 : 0.7, 0.02, 0.4), mats.metal);
    rack.position.y = 0.4;
    g.add(rack);
    // cadeira
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.035, 0.38, 2, 0.01), mats.wood);
    seat.position.set(0, 0.34, 0.5);
    seat.castShadow = seat.receiveShadow = true;
    g.add(seat);
    const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.22, 0.03, 2, 0.01), mats.wood);
    backrest.position.set(0, 0.6, 0.7);
    backrest.castShadow = true;
    g.add(backrest);
    for (const sx of [-0.17, 0.17])
      for (const sz of [0.34, 0.66]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), mats.metal);
        l.position.set(sx, 0.17, sz);
        l.castShadow = true;
        g.add(l);
      }
    for (const sx of [-0.17, 0.17]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), mats.metal);
      p.position.set(sx, 0.5, 0.69);
      g.add(p);
    }
    // material escolar na mesa
    const r = mulberry32(name.length * 7);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.3), new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.8 }));
    pad.position.set((r() - 0.5) * 0.2, 0.545, 0.02);
    pad.rotation.y = (r() - 0.5) * 0.5;
    g.add(pad);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }));
    pencil.position.set(0.22, 0.548, -0.05);
    pencil.rotation.y = r() * 3;
    g.add(pencil);
    g.position.set(d.x, 0, d.z);
    scene.add(g);
    deskGroups[name] = { group: g, top };
  }

  // fundo: mural de cortiça, estante, planta
  const cork = add(new THREE.BoxGeometry(1.8, 0.9, 0.03), new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 }), -1.1, 1.65, ROOM.z1 - 0.03, false);
  void cork;
  const r2 = mulberry32(17);
  const paperCols = [0xfff3b0, 0xffc8dd, 0xbde0fe, 0xcaffbf, 0xffd6a5];
  for (let i = 0; i < 9; i++) {
    const p = add(new THREE.PlaneGeometry(0.28, 0.34), new THREE.MeshStandardMaterial({ color: paperCols[i % 5], roughness: 0.8 }), -1.85 + (i % 5) * 0.37 + r2() * 0.05, 1.86 - Math.floor(i / 5) * 0.42, ROOM.z1 - 0.052, false);
    p.rotation.set(0, Math.PI, (r2() - 0.5) * 0.2);
  }
  const shelf = new THREE.Group();
  for (const y of [0.02, 0.45, 0.88]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.3), mats.darkWood);
    s.position.y = y;
    shelf.add(s);
    let x = -0.56;
    while (x < 0.5 && y < 0.8) {
      const w = 0.04 + r2() * 0.04;
      const h = 0.22 + r2() * 0.14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), new THREE.MeshStandardMaterial({ color: bookCols[Math.floor(r2() * 4)], roughness: 0.6 }));
      b.position.set(x + w / 2, y + 0.015 + h / 2, 0);
      b.castShadow = true;
      shelf.add(b);
      x += w + 0.005;
    }
  }
  shelf.position.set(1.6, 0, ROOM.z1 - 0.2);
  scene.add(shelf);
  const plant = new THREE.Group();
  const potM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0xc8643c, roughness: 0.7 }));
  potM.position.y = 0.15;
  plant.add(potM);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4f9d4a, roughness: 0.6 }));
    leaf.scale.set(0.5, 1.4, 0.25);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.1, 0.48 + r2() * 0.12, Math.sin(a) * 0.1);
    leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    leaf.castShadow = true;
    plant.add(leaf);
  }
  plant.position.set(-2.8, 0, -3.55);
  scene.add(plant);
  // faixa de cores sobre a lousa (sem letras)
  const stripCols = [0xff7a2e, 0x22d3ee, 0xf2c230, 0x7cc46a, 0xff6b9d];
  for (let i = 0; i < 14; i++) {
    add(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ color: stripCols[i % 5], roughness: 0.8 }), -2.95 + i * 0.22 + (i >= 7 ? 1.55 : 0), 2.08, ROOM.z0 + 0.02, false);
  }

  function update(t) {
    const tip = chalk.update(t);
    const pf = Math.min(1, Math.max(0, (t - tl.board.fade[0]) / (tl.board.fade[1] - tl.board.fade[0])));
    boardMat.emissiveIntensity = pf * 1.4;
    boardMat.color.setScalar(1 - pf * 0.7);
    // relógio (10:08 + tempo do filme, acelerado de leve)
    const sec = t * 1.0;
    secH.rotation.z = -Math.floor(sec) * ((Math.PI * 2) / 60);
    minH.rotation.z = -((8 + sec / 60) / 60) * Math.PI * 2;
    hourH.rotation.z = -((10 + (8 + sec / 60) / 60) / 12) * Math.PI * 2;
    return tip;
  }

  // ponta do giz (px) -> mundo
  function boardToWorld(px, py) {
    return new THREE.Vector3(BOARD.x - BOARD.w / 2 + (px / 2200) * BOARD.w, BOARD.y + BOARD.h / 2 - (py / 800) * BOARD.h, BOARD.z + 0.02);
  }

  return { scene, update, boardToWorld, deskGroups, bell, doorG, sun, board, boardMat, clock, bench };
}
