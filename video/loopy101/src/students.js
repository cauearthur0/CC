import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp } from './util.js';

// A turma: personagens originais (arquétipos de meme, não mascotes de ninguém).
// Todos olham para +Z no espaço local; a raiz fica no assento da cadeira.

const fur = (color, sheenColor = 0xffffff) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, sheen: 0.9, sheenRoughness: 0.45, sheenColor: new THREE.Color(sheenColor) });
const gloss = (color, cc = 0.6) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: cc, clearcoatRoughness: 0.25 });
const matte = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const BLACK = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.15, clearcoat: 1 });
const WHITE_EYE = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 0.8 });
const SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const S = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

// olho com pálpebra superior (abre/fecha) e pupila que olha
function eye(parent, x, y, z, r, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const white = mesh(S(r), WHITE_EYE, g);
  white.scale.set(1, 1, opts.flat ?? 0.9);
  const pupilG = new THREE.Group();
  g.add(pupilG);
  let iris = null;
  if (opts.iris) {
    iris = mesh(S(r * 0.62, 20, 14), new THREE.MeshPhysicalMaterial({ color: opts.iris, roughness: 0.2, clearcoat: 1 }), pupilG, 0, 0, r * 0.62);
    iris.scale.set(1, 1, 0.45);
  }
  const pupil = mesh(S(r * (opts.iris ? 0.32 : 0.55), 20, 14), BLACK, pupilG, 0, 0, r * (opts.iris ? 0.82 : 0.7));
  pupil.scale.set(opts.slit ? 0.45 : 1, 1, 0.45);
  mesh(S(r * 0.14, 10, 8), SHINE, pupilG, r * 0.22, r * 0.25, r * 0.95);
  const lidMat = opts.lid;
  const lid = mesh(new THREE.SphereGeometry(r * 1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, g);
  const lidLow = mesh(new THREE.SphereGeometry(r * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, g);
  lidLow.rotation.x = Math.PI;
  return {
    g,
    set(open = 1, lx = 0, ly = 0, wide = 1) {
      // open 1 = aberto; 0 = fechado
      const o = clamp(open);
      lid.rotation.x = lerp(1.45, -1.9, o);
      lidLow.rotation.x = Math.PI + lerp(0.35, 1.1, o);
      pupilG.rotation.set(-ly * 0.5, lx * 0.6, 0);
      g.scale.setScalar(wide);
    },
  };
}

function mouthArc(r, a0, a1, tube, mat) {
  class Arc extends THREE.Curve {
    getPoint(u, target = new THREE.Vector3()) {
      const a = a0 + (a1 - a0) * u;
      return target.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new Arc(), 24, tube, 8, false), mat);
}

function limb(parent, x, y, z, len, r, mat, handR, handMat) {
  const sh = new THREE.Group();
  sh.position.set(x, y, z);
  parent.add(sh);
  mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat, sh, 0, -len / 2 - r * 0.3, 0);
  const hand = new THREE.Group();
  hand.position.y = -len - r * 0.6;
  sh.add(hand);
  if (handR) mesh(S(handR, 14, 10), handMat || mat, hand);
  return { sh, hand };
}

// ================= SAPO =================
export function buildFrog() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const green = gloss(0x63bf47, 0.5);
  const belly = gloss(0xc9ec8e, 0.3);
  const b = mesh(S(0.27, 40, 28), green, body, 0, 0.24, 0);
  b.scale.set(1.1, 0.86, 0.96);
  const bl = mesh(S(0.22, 32, 20), belly, body, 0, 0.19, 0.12);
  bl.scale.set(0.92, 0.78, 0.55);
  const eyes = [-1, 1].map((s) => {
    const bump = mesh(S(0.095, 24, 16), green, body, s * 0.125, 0.43, 0.04);
    void bump;
    return eye(body, s * 0.125, 0.455, 0.075, 0.075, { lid: green });
  });
  // óculos redondos
  const glasses = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.35, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const rim = mesh(new THREE.TorusGeometry(0.088, 0.011, 10, 32), gm, glasses, s * 0.125, 0, 0);
    void rim;
    const lens = mesh(new THREE.CircleGeometry(0.084, 28), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.05, clearcoat: 1 }), glasses, s * 0.125, 0, 0.002);
    lens.castShadow = false;
    const temple = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 6).rotateX(Math.PI / 2), gm, glasses, s * 0.215, 0, -0.1);
    void temple;
  }
  mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 16, Math.PI), gm, glasses, 0, 0.0, 0.0);
  glasses.position.set(0, 0.455, 0.16);
  body.add(glasses);
  const dark = matte(0x2a1810, 0.4);
  const smile = mouthArc(0.13, Math.PI * 1.15, Math.PI * 1.85, 0.009, dark);
  smile.position.set(0, 0.36, 0.235);
  body.add(smile);
  const mouthOpen = mesh(S(0.07, 24, 16), matte(0x6b1d1d, 0.5), body, 0, 0.29, 0.235);
  mouthOpen.scale.set(1.4, 0.1, 0.4);
  const tongue = mesh(S(0.04, 16, 10), matte(0xf27c8c, 0.5), mouthOpen, 0, -0.35, 0.3);
  tongue.scale.set(1.2, 0.6, 0.6);
  for (const s of [-1, 1]) {
    const ch = mesh(S(0.035, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff9aa2, roughness: 0.8, transparent: true, opacity: 0.6 }), body, s * 0.19, 0.31, 0.19);
    ch.scale.set(1, 0.6, 0.4);
  }
  const armL = limb(body, 0.24, 0.2, 0.04, 0.12, 0.038, green, 0.045);
  const armR = limb(body, -0.24, 0.2, 0.04, 0.12, 0.038, green, 0.045);
  const legs = [-1, 1].map((s) => {
    const l = limb(root, s * 0.13, 0.08, 0.05, 0.1, 0.05, green, 0, green);
    const foot = mesh(S(0.06, 16, 10), green, l.hand, 0, 0, 0.04);
    foot.scale.set(1.2, 0.4, 1.4);
    return l;
  });
  // mochila
  const pack = new THREE.Group();
  const packMat = matte(0xff8f3a, 0.55);
  mesh(new RoundedBoxGeometry(0.3, 0.32, 0.14, 4, 0.05), packMat, pack);
  mesh(new RoundedBoxGeometry(0.2, 0.13, 0.05, 3, 0.03), matte(0x22a6b3, 0.6), pack, 0, -0.06, 0.08);
  for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 20, Math.PI), matte(0x22a6b3, 0.6), pack, s * 0.09, 0.08, 0.08).rotation.set(0, Math.PI / 2, Math.PI / 2);
  pack.position.set(0, 0.26, -0.27);
  pack.rotation.x = 0.1;
  body.add(pack);

  const st = { root, body, glasses, pack };
  st.setPose = (p) => {
    root.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    root.rotation.y = p.rotY ?? 0;
    const stand = p.stand ?? 0;
    body.position.y = stand * 0.28 + (p.bounce ?? 0);
    body.rotation.set(p.lean ?? 0, p.turn ?? 0, p.tilt ?? 0);
    const talk = p.talk ?? 0;
    mouthOpen.scale.set(1.4 + (p.gasp ?? 0) * -0.6, 0.1 + talk * 0.9 + (p.gasp ?? 0) * 1.1, 0.4);
    smile.visible = talk < 0.25 && !(p.gasp > 0.3);
    eyes.forEach((e) => e.set(p.eyes ?? 1, p.lookX ?? 0, p.lookY ?? 0, p.wide ?? 1));
    armL.sh.rotation.set(p.armL?.[0] ?? 0.2, 0, p.armL?.[1] ?? 0.35);
    armR.sh.rotation.set(p.armR?.[0] ?? 0.2, 0, -(p.armR?.[1] ?? 0.35));
    for (const l of legs) l.sh.rotation.x = lerp(-1.45, 0, stand);
    // óculos na mão (tira os óculos)
    const off = p.glassesOff ?? 0;
    if (off > 0) {
      glasses.position.set(lerp(0, -0.2, off), lerp(0.455, 0.26, off), lerp(0.16, 0.34, off));
      glasses.rotation.set(lerp(0, 0.35, off), lerp(0, 0.45, off), 0);
    } else {
      glasses.position.set(0, 0.455, 0.16);
      glasses.rotation.set(0, 0, 0);
    }
  };
  st.setPose({});
  return st;
}

// ================= SHIBA =================
export function buildShiba() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const orange = fur(0xe58e3c, 0xffe0b0);
  const cream = fur(0xfff1e0, 0xffffff);
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.16, 8, 20), orange, body, 0, 0.24, 0);
  torso.scale.set(1.05, 1, 0.95);
  const chest = mesh(S(0.14, 28, 18), cream, body, 0, 0.24, 0.1);
  chest.scale.set(0.95, 1.1, 0.7);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.02);
  body.add(head);
  const h = mesh(S(0.175, 36, 26), orange, head);
  h.scale.set(1.08, 0.95, 1);
  const muzzle = mesh(S(0.11, 28, 18), cream, head, 0, -0.045, 0.11);
  muzzle.scale.set(1.25, 0.82, 0.95);
  for (const s of [-1, 1]) {
    const cheek = mesh(S(0.075, 20, 14), cream, head, s * 0.09, -0.05, 0.09);
    void cheek;
  }
  mesh(S(0.03, 16, 12), BLACK, head, 0, -0.005, 0.215).scale.set(1.3, 0.9, 0.9);
  const mouth = mouthArc(0.035, Math.PI * 1.1, Math.PI * 1.9, 0.006, matte(0x2a1a12, 0.4));
  mouth.position.set(0, -0.06, 0.205);
  head.add(mouth);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(s * 0.072, 0.035, 0.148);
    head.add(e);
    const ball = mesh(S(0.031, 18, 12), BLACK, e);
    mesh(S(0.009, 8, 6), SHINE, e, 0.01, 0.012, 0.026);
    const brow = mesh(S(0.02, 12, 8), cream, head, s * 0.07, 0.1, 0.14);
    brow.scale.set(1.3, 0.7, 0.5);
    return { e, ball, brow };
  });
  const ears = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.1, 0.13, -0.01);
    g.rotation.z = -s * 0.32;
    head.add(g);
    mesh(new THREE.ConeGeometry(0.065, 0.13, 16), orange, g, 0, 0.05, 0);
    mesh(new THREE.ConeGeometry(0.04, 0.09, 12), cream, g, 0, 0.04, 0.022);
    return g;
  });
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.04, 12, 24, Math.PI * 1.6), orange);
  tail.position.set(0, 0.3, -0.19);
  tail.rotation.set(0, Math.PI / 2, 0.4);
  tail.castShadow = true;
  body.add(tail);
  const armL = limb(body, 0.16, 0.33, 0.04, 0.12, 0.045, orange, 0.05, cream);
  const armR = limb(body, -0.16, 0.33, 0.04, 0.12, 0.045, orange, 0.05, cream);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.05, 0.08, 4, 10), orange, root, s * 0.09, 0.05, 0.1);
    leg.rotation.x = Math.PI / 2;
    mesh(S(0.05, 12, 10), cream, root, s * 0.09, 0.04, 0.2);
  }
  // taco de espuma
  const bat = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.05, 0.034, 0.26, 18), matte(0xffd23f, 0.85), bat, 0, 0.17, 0);
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.09, 12), matte(0xe84a5f, 0.6), bat, 0, 0.0, 0);
  mesh(S(0.05, 16, 10), matte(0xffd23f, 0.85), bat, 0, 0.3, 0).scale.set(1, 0.4, 1);
  bat.rotation.x = Math.PI / 2 - 0.4;
  armR.hand.add(bat);

  const st = { root, body, head, bat, armR };
  st.setPose = (p) => {
    root.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    root.rotation.y = p.rotY ?? 0;
    body.position.y = p.bounce ?? 0;
    body.rotation.set(p.lean ?? 0, p.turn ?? 0, 0);
    head.rotation.set(p.headX ?? 0, p.headY ?? 0, p.headZ ?? 0);
    const open = clamp(p.eyes ?? 1);
    eyes.forEach((o) => o.e.scale.set(1, Math.max(0.1, open), 1));
    eyes.forEach((o) => o.e.scale.multiplyScalar(p.wide ?? 1));
    ears.forEach((g, i) => (g.rotation.x = -(p.ears ?? 0) * 0.3));
    tail.rotation.z = 0.4 + Math.sin((p.wag ?? 0) * 12) * 0.25 * (p.wagAmt ?? 0.3);
    armL.sh.rotation.set(p.armL?.[0] ?? -0.3, 0, p.armL?.[1] ?? 0.2);
    armR.sh.rotation.set(p.armR?.[0] ?? -0.6, 0, -(p.armR?.[1] ?? 0.2));
    bat.rotation.x = p.batRot ?? Math.PI / 2 - 0.4;
  };
  st.setPose({});
  return st;
}

// ================= GATO DE GORRO =================
function knitTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8553f';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 12) {
    g.fillStyle = 'rgba(120,20,10,0.35)';
    g.fillRect(x, 0, 3, 128);
    g.fillStyle = 'rgba(255,200,180,0.12)';
    g.fillRect(x + 5, 0, 3, 128);
  }
  for (let y = 0; y < 128; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(0, y, 256, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
export function buildCat() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const grey = fur(0x8f9297, 0xdde3ea);
  const white = fur(0xf4f1ec, 0xffffff);
  const torso = mesh(new THREE.CapsuleGeometry(0.155, 0.15, 8, 20), grey, body, 0, 0.23, 0);
  torso.scale.set(1, 1, 0.92);
  mesh(S(0.12, 24, 16), white, body, 0, 0.22, 0.09).scale.set(0.9, 1.1, 0.7);
  const head = new THREE.Group();
  head.position.set(0, 0.47, 0.02);
  body.add(head);
  mesh(S(0.165, 36, 26), grey, head).scale.set(1.12, 0.94, 1);
  mesh(S(0.075, 20, 14), white, head, 0, -0.05, 0.12).scale.set(1.35, 0.8, 0.9);
  mesh(S(0.02, 12, 8), matte(0xe58a9a, 0.5), head, 0, -0.025, 0.188).scale.set(1.3, 0.8, 0.8);
  const mouth = mouthArc(0.025, Math.PI * 1.15, Math.PI * 1.85, 0.005, matte(0x2a1a12, 0.4));
  mouth.position.set(0, -0.06, 0.18);
  head.add(mouth);
  const wm = matte(0xffffff, 0.5);
  for (const s of [-1, 1])
    for (const k of [-1, 0, 1]) {
      const w = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.13, 4), wm, head, s * 0.11, -0.045 + k * 0.012, 0.15);
      w.rotation.set(0, 0, Math.PI / 2 + s * k * 0.12);
      w.castShadow = false;
    }
  const eyes = [-1, 1].map((s) => eye(head, s * 0.068, 0.025, 0.125, 0.045, { iris: 0x8bc34a, slit: true, lid: grey, flat: 0.8 }));
  // gorro de tricô com pompom e orelhas pra fora
  const beanie = new THREE.Group();
  beanie.position.y = 0.035;
  head.add(beanie);
  const knit = new THREE.MeshStandardMaterial({ map: knitTexture(), roughness: 0.95 });
  const cap = mesh(new THREE.SphereGeometry(0.172, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), knit, beanie);
  cap.scale.set(1.12, 1.12, 1.06);
  const brim = mesh(new THREE.TorusGeometry(0.185, 0.035, 12, 40), knit, beanie, 0, 0.0, 0);
  brim.rotation.x = Math.PI / 2;
  brim.scale.set(1.04, 1, 1);
  mesh(S(0.055, 16, 12), fur(0xf6e7d0), beanie, 0, 0.205, 0);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.12, 0.13, 0);
    g.rotation.z = -s * 0.45;
    beanie.add(g);
    mesh(new THREE.ConeGeometry(0.05, 0.1, 14), grey, g, 0, 0.04, 0);
    mesh(new THREE.ConeGeometry(0.03, 0.07, 10), matte(0xe8a5b0, 0.6), g, 0, 0.035, 0.018);
  }
  const armL = limb(body, 0.15, 0.32, 0.03, 0.12, 0.042, grey, 0.048, white);
  const armR = limb(body, -0.15, 0.32, 0.03, 0.12, 0.042, grey, 0.048, white);
  const tail = mesh(new THREE.TorusGeometry(0.16, 0.028, 10, 24, Math.PI * 0.9), grey, body, 0.0, 0.2, -0.2);
  tail.rotation.set(0, Math.PI / 2, -0.3);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.045, 0.08, 4, 10), grey, root, s * 0.08, 0.05, 0.1);
    leg.rotation.x = Math.PI / 2;
    mesh(S(0.045, 12, 10), white, root, s * 0.08, 0.04, 0.19);
  }
  const st = { root, body, head };
  st.setPose = (p) => {
    root.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    root.rotation.y = p.rotY ?? 0;
    body.position.y = p.bounce ?? 0;
    body.rotation.set(p.lean ?? 0, p.turn ?? 0, 0);
    head.rotation.set(p.headX ?? 0, p.headY ?? 0, p.headZ ?? 0);
    eyes.forEach((e) => e.set(p.eyes ?? 0.55, p.lookX ?? 0, p.lookY ?? 0, p.wide ?? 1));
    armL.sh.rotation.set(p.armL?.[0] ?? -0.3, 0, p.armL?.[1] ?? 0.2);
    armR.sh.rotation.set(p.armR?.[0] ?? -0.3, 0, -(p.armR?.[1] ?? 0.2));
    tail.rotation.z = -0.3 + Math.sin((p.t ?? 0) * 2) * 0.15;
  };
  st.setPose({});
  return st;
}

// ================= BALEIA DE GRAVATA =================
export function buildWhale() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const blue = gloss(0x4a86d6, 0.7);
  const bellyM = gloss(0xd4e7ff, 0.4);
  const b = mesh(S(0.5, 48, 32), blue, body, 0, 0.5, 0);
  b.scale.set(1.0, 1.0, 0.92);
  const bel = mesh(S(0.42, 40, 24), bellyM, body, 0, 0.38, 0.14);
  bel.scale.set(0.9, 0.8, 0.75);
  for (let i = -3; i <= 3; i++) {
    const groove = mesh(new THREE.TorusGeometry(0.36, 0.006, 6, 30, 0.9), matte(0xa9c8f0, 0.5), body, i * 0.06, 0.12, 0.36);
    groove.rotation.set(-0.25, 0, Math.PI * 1.5 - 0.45);
    groove.castShadow = false;
  }
  const eyes = [-1, 1].map((s) => eye(body, s * 0.2, 0.66, 0.4, 0.055, { lid: blue, flat: 0.7 }));
  const smile = mouthArc(0.2, Math.PI * 1.2, Math.PI * 1.8, 0.01, matte(0x1d2a44, 0.4));
  smile.position.set(0, 0.62, 0.43);
  body.add(smile);
  const mouthOpen = mesh(S(0.08, 24, 14), matte(0x3a1d2a, 0.5), body, 0, 0.47, 0.43);
  mouthOpen.scale.set(1.6, 0.1, 0.5);
  // gravatinha
  const tieM = matte(0xc0392b, 0.5);
  mesh(new RoundedBoxGeometry(0.06, 0.045, 0.03, 2, 0.01), tieM, body, 0, 0.36, 0.48);
  const tie = mesh(new THREE.ConeGeometry(0.035, 0.12, 4), tieM, body, 0, 0.29, 0.47);
  tie.rotation.set(Math.PI, Math.PI / 4, 0);
  tie.scale.set(1, 1, 0.4);
  mesh(new THREE.ConeGeometry(0.04, 0.05, 3), matte(0xffffff, 0.6), body, -0.04, 0.38, 0.47).rotation.set(0, 0, -2.1);
  mesh(new THREE.ConeGeometry(0.04, 0.05, 3), matte(0xffffff, 0.6), body, 0.04, 0.38, 0.47).rotation.set(0, 0, 2.1);
  mesh(S(0.03, 12, 8), matte(0x1d2a44, 0.4), body, 0, 0.99, 0.05).scale.set(1.5, 0.4, 0.8);
  const fins = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.46, 0.42, 0.12);
    body.add(g);
    const f = mesh(S(0.16, 24, 14), blue, g, s * 0.1, -0.08, 0.05);
    f.scale.set(0.6, 0.28, 1.1);
    f.rotation.set(0.3, 0, s * 0.6);
    return g;
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.5);
  body.add(tail);
  mesh(new THREE.CapsuleGeometry(0.1, 0.25, 6, 14), blue, tail, 0, 0.08, -0.12).rotation.x = -0.9;
  for (const s of [-1, 1]) {
    const fl = mesh(S(0.16, 20, 12), blue, tail, s * 0.14, 0.26, -0.28);
    fl.scale.set(1.2, 0.22, 0.6);
    fl.rotation.set(-0.6, 0, s * 0.4);
  }
  // estrela dourada na testa
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.045 : 0.1;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.01, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.85, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 0.4 }), body, 0, 0.84, 0.36);
  star.rotation.x = -0.55;
  star.visible = false;

  const st = { root, body, star, fins };
  st.setPose = (p) => {
    root.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    root.rotation.y = p.rotY ?? 0;
    body.position.y = p.bounce ?? 0;
    const sq = p.squash ?? 0; // + achata, - estica
    body.scale.set(1 + sq * 0.12 - (p.squeezeX ?? 0), 1 - sq * 0.12, 1 + sq * 0.06);
    body.rotation.set(p.lean ?? 0, p.turn ?? 0, p.tilt ?? 0);
    eyes.forEach((e) => e.set(p.eyes ?? 1, p.lookX ?? 0, p.lookY ?? 0, p.wide ?? 1));
    const talk = p.talk ?? 0;
    mouthOpen.scale.set(1.6, 0.1 + talk * 0.8, 0.5);
    smile.visible = talk < 0.25;
    fins[0].rotation.set(p.finR?.[0] ?? 0, 0, p.finR?.[1] ?? 0);
    fins[1].rotation.set(p.finL?.[0] ?? 0, 0, p.finL?.[1] ?? 0);
    tail.rotation.x = Math.sin((p.t ?? 0) * 1.8) * 0.12 + (p.tailUp ?? 0);
    star.visible = !!p.star;
    if (p.star) star.scale.setScalar(p.starScale ?? 1);
  };
  st.setPose({});
  return st;
}
