import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Operários (sem rosto, macacão) e o supervisor (capacete, prancheta, bigode).

export function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
export const at = (g, x, y, z) => g.translate(x, y, z);
export function capsuleBetween(a, b, r, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// corpo do operário (olhando para +Z), cabeça separada para poder virar
export function workerGeometries() {
  const blue = 0x3b6fb6;
  const shirt = 0xd9d6cf;
  const skin = 0xc9a27e;
  const body = mergeGeometries([
    colored(at(new THREE.BoxGeometry(0.13, 0.08, 0.26), -0.1, 0.04, 0.03), 0x3a2f28),
    colored(at(new THREE.BoxGeometry(0.13, 0.08, 0.26), 0.1, 0.04, 0.03), 0x3a2f28),
    colored(capsuleBetween(V(-0.1, 0.1, 0), V(-0.1, 0.86, 0), 0.08), blue),
    colored(capsuleBetween(V(0.1, 0.1, 0), V(0.1, 0.86, 0), 0.08), blue),
    colored(at(new THREE.CapsuleGeometry(0.21, 0.4, 4, 12), 0, 1.13, 0), blue),
    colored(at(new THREE.BoxGeometry(0.05, 0.36, 0.02), -0.09, 1.22, 0.205), 0x2b528a),
    colored(at(new THREE.BoxGeometry(0.05, 0.36, 0.02), 0.09, 1.22, 0.205), 0x2b528a),
    colored(at(new THREE.BoxGeometry(0.2, 0.1, 0.02), 0, 1.02, 0.212), 0x2b528a),
    colored(at(new THREE.CylinderGeometry(0.075, 0.085, 0.08, 10), 0, 1.47, 0), shirt),
    colored(capsuleBetween(V(-0.27, 1.38, 0), V(-0.3, 0.97, 0.03), 0.065), shirt),
    colored(capsuleBetween(V(0.27, 1.38, 0), V(0.3, 0.97, 0.03), 0.065), shirt),
    colored(at(new THREE.SphereGeometry(0.062, 10, 8), -0.3, 0.92, 0.04), skin),
    colored(at(new THREE.SphereGeometry(0.062, 10, 8), 0.3, 0.92, 0.04), skin),
  ]);
  const head = mergeGeometries([
    colored(at(new THREE.SphereGeometry(0.15, 16, 12), 0, 1.6, 0), skin),
    colored(at(new THREE.SphereGeometry(0.157, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.63, 0), 0x2a4a7f),
    colored(at(new THREE.BoxGeometry(0.22, 0.02, 0.12), 0, 1.64, 0.15), 0x2a4a7f),
  ]);
  return { body, head };
}

// ---------- supervisor ----------
export function buildSupervisor(patch) {
  const mat = (hex, rough = 0.7) => patch(new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  const root = new THREE.Group();
  const M = {
    trousers: mat(0x4a4f58),
    shoe: mat(0x1f1f22, 0.4),
    shirt: mat(0xf1efe8),
    tie: mat(0xc0392b),
    skin: mat(0xe0b48e, 0.6),
    dark: mat(0x3b2a20),
    hat: mat(0xf4c430, 0.35),
    belt: mat(0x5a3b22),
    board: mat(0x8b5a2b),
    paper: mat(0xf7f7f2),
  };
  const add = (p, g, m) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    p.add(mesh);
    return mesh;
  };
  for (const s of [-1, 1]) {
    add(root, capsuleBetween(V(s * 0.11, 0.1, 0), V(s * 0.11, 0.86, 0), 0.085), M.trousers);
    add(root, at(new RoundedBoxGeometry(0.14, 0.08, 0.28, 2, 0.03), s * 0.11, 0.04, 0.04), M.shoe);
  }
  const body = new THREE.Group();
  root.add(body);
  add(body, at(new THREE.CapsuleGeometry(0.24, 0.42, 6, 16), 0, 1.15, 0), M.shirt);
  add(body, at(new THREE.SphereGeometry(0.25, 20, 14), 0, 1.02, 0.07), M.shirt);
  add(body, at(new THREE.TorusGeometry(0.255, 0.03, 8, 28).rotateX(Math.PI / 2), 0, 0.88, 0.03), M.belt);
  add(body, at(new THREE.BoxGeometry(0.07, 0.36, 0.02), 0, 1.2, 0.29).rotateX(-0.12), M.tie);
  add(body, at(new THREE.BoxGeometry(0.09, 0.06, 0.03), 0, 1.4, 0.24), M.tie);
  add(body, at(new THREE.CylinderGeometry(0.09, 0.1, 0.09, 12), 0, 1.5, 0), M.skin);

  const head = new THREE.Group();
  head.position.set(0, 1.55, 0);
  body.add(head);
  add(head, at(new THREE.SphereGeometry(0.19, 24, 18), 0, 0.18, 0), M.skin);
  add(head, at(new THREE.SphereGeometry(0.045, 12, 10), 0, 0.17, 0.19), M.skin);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = add(head, new THREE.SphereGeometry(0.022, 10, 8), eyeMat);
    e.position.set(s * 0.068, 0.225, 0.165);
    eyes.push(e);
  }
  const brows = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.068, 0.272, 0.172);
    head.add(g);
    add(g, new RoundedBoxGeometry(0.085, 0.024, 0.024, 2, 0.008), M.dark);
    brows.push(g);
  }
  add(head, at(new RoundedBoxGeometry(0.17, 0.05, 0.045, 2, 0.02), 0, 0.122, 0.178), M.dark);
  add(head, at(new THREE.SphereGeometry(0.205, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.235, 0), M.hat);
  add(head, at(new THREE.CylinderGeometry(0.245, 0.245, 0.02, 28), 0, 0.24, 0.02), M.hat);
  add(head, at(new THREE.BoxGeometry(0.04, 0.03, 0.4), 0, 0.43, 0).rotateX(0), M.hat);

  const arms = {};
  for (const [k, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.29, 1.4, 0);
    body.add(sh);
    add(sh, at(new THREE.CapsuleGeometry(0.075, 0.18, 4, 10), 0, -0.13, 0), M.shirt);
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    add(el, at(new THREE.CapsuleGeometry(0.058, 0.2, 4, 10), 0, -0.14, 0), M.skin);
    const hand = new THREE.Group();
    hand.position.y = -0.3;
    el.add(hand);
    add(hand, new THREE.SphereGeometry(0.068, 12, 10), M.skin);
    arms[k] = { sh, el, hand, s };
  }
  // prancheta na mão esquerda
  const clip = new THREE.Group();
  add(clip, new THREE.BoxGeometry(0.24, 0.32, 0.012), M.board);
  add(clip, at(new THREE.BoxGeometry(0.2, 0.26, 0.004), 0, -0.01, 0.008), M.paper);
  add(clip, at(new THREE.BoxGeometry(0.08, 0.03, 0.02), 0, 0.15, 0.01), M.shoe);
  clip.position.set(0.02, -0.06, 0.1);
  clip.rotation.set(-0.3, 0.2, 1.4);
  arms.L.hand.add(clip);

  const state = { root, body, head, brows, eyes, arms, clip };
  state.setPose = (p) => {
    root.position.set(p.x ?? 0, 0, p.z ?? 0);
    root.rotation.y = p.rotY ?? 0;
    body.rotation.x = p.lean ?? 0;
    head.rotation.set(p.headX ?? 0, p.headY ?? 0, p.headZ ?? 0);
    brows[1].position.y = 0.272 + (p.browL ?? 0) * 0.04;
    brows[0].position.y = 0.272 + (p.browR ?? 0) * 0.04;
    brows[0].rotation.z = -(p.browR ?? 0) * 0.25;
    brows[1].rotation.z = (p.browL ?? 0) * 0.25;
    for (const e of eyes) e.scale.y = 1 - (p.blink ?? 0) * 0.9;
    const shrug = p.shrug ?? 0;
    for (const k of ['L', 'R']) {
      const a = arms[k];
      const q = p['arm' + k] || { sx: 0.05, sz: 0.12, ex: -0.2 };
      a.sh.position.y = 1.4 + shrug * 0.07 - (p.slump ?? 0) * 0.05;
      a.sh.rotation.set(q.sx, 0, q.sz * a.s);
      a.el.rotation.set(q.ex, 0, 0);
    }
    root.updateMatrixWorld(true);
  };
  return state;
}

// IK genérica para os braços do supervisor (mesmo esquema do rig: ombro XYZ, cotovelo X)
function rx(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rz(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}
export function supIK(side, target, shoulderY = 1.4) {
  const sgn = side === 'L' ? 1 : -1;
  const S = [sgn * 0.29, shoulderY, 0];
  const fk = (q) => {
    const f = rx([0, -0.3, 0], q[2]);
    let v = [f[0], f[1] - 0.3, f[2]];
    v = rz(v, q[1]);
    v = rx(v, q[0]);
    return [S[0] + v[0], S[1] + v[1], S[2] + v[2]];
  };
  let p = [-0.6, 0.15 * sgn, -0.8];
  const err = (q) => {
    const h = fk(q);
    let e = (h[0] - target[0]) ** 2 + (h[1] - target[1]) ** 2 + (h[2] - target[2]) ** 2;
    if (q[2] > 0) e += q[2] * q[2] * 0.05;
    if (q[1] * sgn < -0.25) e += (q[1] * sgn + 0.25) ** 2 * 0.05;
    return e;
  };
  let best = err(p);
  for (const step of [0.4, 0.15, 0.05, 0.015, 0.005]) {
    for (let it = 0; it < 40; it++) {
      let imp = false;
      for (let k = 0; k < 3; k++)
        for (const d of [step, -step]) {
          const q = p.slice();
          q[k] += d;
          const e = err(q);
          if (e < best) {
            best = e;
            p = q;
            imp = true;
          }
        }
      if (!imp) break;
    }
  }
  return { sx: p[0], sz: p[1] * sgn, ex: p[2] };
}
