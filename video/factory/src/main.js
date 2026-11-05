import * as THREE from 'three';
import { buildFactory, SUP, BOX, HIDE, STAND, BELT_TOP } from './factory.js';
import { supIK } from './people.js';
import { buildLoopy, ikArm, blinkAt } from './loopy.js';
import { buildGames } from './games.js';
import { buildCrackCoin } from './coin.js';
import { buildOutside } from './outside.js';
import { buildPost } from './post.js';
import { makeOverlay } from './overlay.js';
import { clamp, lerp, smooth, smoother, invLerp, easeInOutSine, easeOutBack, easeOutCubic, hash1 } from './util.js';

const qs = new URLSearchParams(location.search);
const W = +(qs.get('w') || 1920);
const H = +(qs.get('h') || 1080);
const tl = await (await fetch('../timeline.json')).json();
await Promise.all(
  [
    '500 34px "JetBrains Mono"',
    '800 84px "JetBrains Mono"',
    'italic 400 38px "Libre Baskerville"',
    '600 46px "Inter"',
    '800 66px "Inter"',
    '900 92px "Inter"',
  ].map((f) => document.fonts.load(f))
);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.info.autoReset = false;
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.03, 200);
const F = buildFactory(renderer);
const scene = F.scene;
const loopy = buildLoopy();
scene.add(loopy.root);
const games = buildGames();
games.forEach((g) => {
  g.group.visible = false;
  scene.add(g.group);
});
const coin = buildCrackCoin();
scene.add(coin.group);
const grabCoin = new THREE.Mesh(F.coinGeo, F.coinMat);
scene.add(grabCoin);
const outside = buildOutside(new THREE.Vector3(STAND.x, 0, F.WALL_Z));
scene.add(outside.group);
// mão de apoio que segura o carimbo no plano de detalhe
const proxyArm = new THREE.Group();
{
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48e, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.7 });
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), skin);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.3, 4, 10).rotateX(Math.PI / 2).translate(0, 0, 0.22), skin);
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.3, 4, 10).rotateX(Math.PI / 2).translate(0, 0, 0.55), shirt);
  proxyArm.add(hand, fore, sleeve);
  [hand, fore, sleeve].forEach((m) => F.col.patch(m.material));
  proxyArm.visible = false;
  scene.add(proxyArm);
}

const post = buildPost(renderer, W, H, scene, camera);
const overlay = makeOverlay(W, H, tl, { captions: qs.get('captions') !== '0' });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function setCam(pos, target, fov) {
  camera.position.copy(pos);
  camera.fov = fov;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}
const col = F.col.uniforms;
const BEAT = 60 / tl.bpm;

// ---------- grades de cor ----------
const OLD = { sat: 0.95, contrast: 1.06, tint: [1.02, 0.99, 0.93], lift: 0.035, vignette: 0.55, grain: 0.075, aberr: 0.0022 };
const NEW = { sat: 1.12, contrast: 1.05, tint: [1, 1, 1], lift: 0.0, vignette: 0.22, grain: 0.03, aberr: 0.0012 };
const mixGrade = (a, b, k) => ({
  sat: lerp(a.sat, b.sat, k),
  contrast: lerp(a.contrast, b.contrast, k),
  tint: a.tint.map((v, i) => lerp(v, b.tint[i], k)),
  lift: lerp(a.lift, b.lift, k),
  vignette: lerp(a.vignette, b.vignette, k),
  grain: lerp(a.grain, b.grain, k),
  aberr: lerp(a.aberr, b.aberr, k),
});

// ---------- caminho do Loopy no plano 3 ----------
const path3 = [
  [12.0, 4.75, 1.82],
  [12.3, 4.25, 1.76],
  [12.75, 3.6, 1.68],
  [13.2, 3.0, 1.6],
  [13.65, 2.4, 1.52],
  [13.95, 1.85, 1.22],
  [14.8, 1.85, 1.22],
  [14.95, 2.2, 1.45],
  [15.2, 2.6, 1.75],
  [15.45, 3.0, 2.05],
  [15.7, 3.4, 2.3],
  [15.95, 3.75, 2.5],
  [16.2, HIDE.x, HIDE.z],
  [17.0, HIDE.x, HIDE.z],
];
function pathAt(t) {
  for (let i = 0; i < path3.length - 1; i++) {
    const [t0, x0, z0] = path3[i];
    const [t1, x1, z1] = path3[i + 1];
    if (t <= t1) {
      const k = smooth(invLerp(t0, t1, t));
      return { x: lerp(x0, x1, k), z: lerp(z0, z1, k), dx: x1 - x0, dz: z1 - z0 };
    }
  }
  const l = path3[path3.length - 1];
  return { x: l[1], z: l[2], dx: 0, dz: 0 };
}
const stepTimes = [...tl.steps, ...tl.scurry];
function stepBump(t) {
  let b = 0;
  let side = 0;
  stepTimes.forEach((st, i) => {
    const dur = i < tl.steps.length ? 0.4 : 0.22;
    const x = (t - (st - dur)) / dur;
    if (x > 0 && x < 1) {
      b = Math.sin(x * Math.PI);
      side = i % 2 ? 1 : -1;
    }
  });
  return { b, side };
}

// ---------- mundos: quando cada um nasce e onde flutua ----------
const pops = [tl.frog.pop, ...tl.montage.starts.map((s) => s + tl.montage.pop)];
const crackWin = [tl.frog.crack, ...tl.montage.starts.map((s) => [s + tl.montage.crack[0], s + tl.montage.crack[1]])];
const FLOAT = V(HIDE.x + 0.36, 1.0, HIDE.z - 0.3);
function ringPos(i, t, center, r, h) {
  const a = (i / 5) * Math.PI * 2 + t * 0.35;
  return V(center.x + Math.sin(a) * r, h + 0.12 * Math.sin(t * 1.3 + i * 1.7), center.z + Math.cos(a) * r);
}

function shotAt(t) {
  for (const s of tl.shots) if (t < s.end) return s;
  return tl.shots[tl.shots.length - 1];
}

// ---------- quadro ----------
function frame(tIn) {
  const t = tIn;
  const shot = shotAt(t);
  const freeze = tl.end.freeze;
  const ta = shot.id === 7 ? Math.min(t, freeze) : t; // tempo da animação (congela no fim)
  const P = { camera, scene, seed: Math.floor(t * tl.fps) };
  const fi = Math.floor(t * tl.fps);

  // estado padrão
  F.wall.visible = false;
  outside.group.visible = false;
  proxyArm.visible = false;
  F.decal.visible = t >= tl.stampHit;
  col.uColG.value = 0;
  col.uColR.value = 0;
  col.uColEdge.value = 0;
  scene.fog.density = 0.045;
  scene.fog.color.set(0x8e98a3);
  scene.background.set(0x8e98a3);
  loopy.root.visible = shot.id >= 3;
  coin.group.visible = false;
  grabCoin.visible = false;
  F.supCoin.visible = false;
  games.forEach((g) => (g.group.visible = false));
  const lookAt = V(STAND.x, 1, STAND.z);
  F.update(ta, { headsTurn: shot.id >= 6 ? smooth(invLerp(tl.headsTurn[0], tl.headsTurn[1], t)) : 0, lookAt });
  F.stamp.position.set(BOX.x + 0.38, 0.62, BOX.z - 0.1);
  F.stamp.rotation.set(0, 0.3, 0);

  // ---- supervisor ----
  const s = t;
  let sp = { x: SUP.x, z: SUP.z, rotY: Math.PI, armL: supIK('L', [0.14, 1.12, 0.26]), armR: { sx: 0.05, sz: 0.1, ex: -0.15 } };
  let supHolding = false;
  if (s >= 6 && s < 10.4) {
    const u = s - 6;
    let target = [-0.32, 0.98, 0.15];
    if (u < 0.8) target = [lerp(-0.32, -0.14, smooth(u / 0.8)), lerp(0.98, 0.93, smooth(u / 0.8)), lerp(0.15, 0.55, smooth(u / 0.8))];
    else if (u < 1.5) {
      const k = smooth((u - 0.8) / 0.7);
      target = [lerp(-0.14, -0.31, k), lerp(0.93, 1.76, k), lerp(0.55, 0.06, k)];
    } else target = [-0.31, 1.76 + (u > 1.6 && u < 2.3 ? Math.sin((u - 1.6) * Math.PI * 2 * 6) * 0.035 : 0), 0.06];
    supHolding = u > 0.8;
    let shrug = 0;
    let armL = supIK('L', [0.14, 1.12, 0.26]);
    if (u > 3.3) {
      shrug = Math.sin(clamp((u - 3.3) / 0.6) * Math.PI);
      if (u < 3.95) {
        target = [lerp(-0.31, -0.44, shrug), lerp(1.76, 1.12, smooth((u - 3.3) / 0.25)), lerp(0.06, 0.25, shrug)];
        armL = supIK('L', [lerp(0.14, 0.44, shrug), lerp(1.12, 1.12, shrug), lerp(0.26, 0.25, shrug)]);
      } else target = [-0.3, 1.0, 0.25];
    }
    const turn = smoother(invLerp(9.9, 10.4, s));
    sp = {
      x: SUP.x,
      z: SUP.z,
      rotY: lerp(Math.PI, 1.3, turn),
      armR: supIK('R', target, 1.4 + shrug * 0.07),
      armL,
      shrug,
      headZ: u > 0.9 && u < 2.7 ? 0.2 * smooth((u - 0.9) / 0.4) : 0.2 * (1 - smooth((u - 2.7) / 0.5)),
      headX: u > 1.4 && u < 2.6 ? 0.05 : 0,
      browR: smooth(invLerp(8.8, 9.1, s)) * (1 - smooth(invLerp(10.0, 10.3, s))),
      headY: smooth(invLerp(8.8, 9.2, s)) * 0.12 * (1 - turn),
      blink: u > 1.6 && u < 2.55 ? 0.55 : blinkAt(s, [7.2]),
    };
  }
  if (s >= 34) {
    const face = Math.atan2(STAND.x - SUP.x, STAND.z - SUP.z);
    const turn = smoother(invLerp(34.4, 35.4, s));
    let target = [-0.14, 1.15, 0.28];
    const raise = smooth(invLerp(36.8, 37.5, s));
    target = [lerp(-0.14, -0.31, raise), lerp(1.15, 1.76, raise), lerp(0.28, 0.06, raise)];
    if (s > 37.5 && s < 37.85) target[1] += Math.sin((s - 37.5) * Math.PI * 2 * 5.5) * 0.03;
    const lower = smooth(invLerp(tl.defeated, tl.defeated + 0.6, s));
    target = [lerp(target[0], -0.22, lower), lerp(target[1], 0.98, lower), lerp(target[2], 0.18, lower)];
    sp = {
      x: SUP.x,
      z: SUP.z,
      rotY: lerp(Math.PI, face, turn),
      armR: supIK('R', target),
      armL: supIK('L', [lerp(0.14, 0.2, lower), lerp(1.12, 0.95, lower), lerp(0.26, 0.15, lower)]),
      headZ: 0.18 * raise * (1 - lower),
      headX: lower * 0.35,
      slump: lower,
      browR: 0.6 * smooth(invLerp(38.1, 38.4, s)) * (1 - lower),
      browL: -0.4 * lower,
      blink: blinkAt(s, [36.2, 38.7]),
    };
    supHolding = true;
  }
  F.sup.setPose(sp);
  if (supHolding) {
    F.supCoin.visible = true;
    F.sup.arms.R.hand.getWorldPosition(F.supCoin.position);
    F.supCoin.rotation.set(Math.PI / 2, 0, 0.3);
  }

  // ---- Loopy ----
  let lp = { console: 'none' };
  const relaxed = { sx: 0.05, sz: 0.14, ex: -0.2 };

  // ================= PLANOS =================
  if (shot.id === 1) {
    const u = easeInOutSine(t / 6);
    setCam(V(lerp(-6.6, -4.2, u), lerp(3.5, 3.0, u), lerp(9.2, 7.2, u)), V(lerp(0.0, 0.6, u), 2.1, -6), 40);
    P.grade = { ...OLD, black: 1 - smooth(t / 0.8) };
    P.bloom = { strength: 0.35, radius: 0.5, threshold: 1.0 };
  }

  if (shot.id === 2) {
    const u = easeInOutSine((t - 6) / 4.4);
    const pos = V(SUP.x + lerp(0.55, 0.4, u), lerp(1.62, 1.66, u), lerp(-1.65, -1.4, u));
    const tgt = V(SUP.x + 0.02, 1.55, SUP.z);
    setCam(pos, tgt, 30);
    P.dof = { focus: pos.distanceTo(V(SUP.x, 1.6, SUP.z - 0.1)), aperture: 0.004, maxblur: 0.01 };
    P.grade = OLD;
    P.bloom = { strength: 0.3, radius: 0.5, threshold: 1.0 };
  }

  if (shot.id === 21) {
    const hitT = tl.stampHit;
    const face = V(BOX.x, 0.62 + 0.17, BOX.z + 0.2);
    let z = 0.36;
    if (t < 10.7) z = 0.36 + Math.sin((t - 10.4) * 8) * 0.01;
    else if (t < hitT) z = lerp(0.36, 0.012, Math.pow((t - 10.7) / (hitT - 10.7), 2.2));
    else if (t < 11.15) z = 0.012;
    else z = lerp(0.012, 0.42, smooth((t - 11.15) / 0.45));
    const lift = t > 11.15 ? smooth((t - 11.15) / 0.45) : 0;
    F.stamp.position.set(face.x + 0.02 + lift * 0.25, face.y + 0.02 + lift * 0.35, face.z + z);
    F.stamp.rotation.set(Math.PI / 2, 0, 0.08);
    proxyArm.visible = true;
    proxyArm.position.set(F.stamp.position.x, F.stamp.position.y, F.stamp.position.z + 0.2);
    proxyArm.rotation.set(-0.55, -0.55, 0);
    const shake = t > hitT && t < hitT + 0.35 ? Math.exp(-(t - hitT) * 12) * 0.012 : 0;
    setCam(V(BOX.x - 0.35 + Math.sin(t * 70) * shake, 1.02 + Math.cos(t * 55) * shake, BOX.z + 1.45), V(BOX.x - 0.02, 0.8, BOX.z + 0.18), 30);
    P.dof = { focus: 1.35, aperture: 0.008, maxblur: 0.01 };
    P.grade = OLD;
    P.bloom = { strength: 0.3, radius: 0.5, threshold: 1.0 };
  }

  if (shot.id === 3) {
    const p = pathAt(t);
    const { b, side } = stepBump(t);
    const moving = Math.hypot(p.dx, p.dz) > 0.01 && t < 16.2;
    const atBelt = t >= 13.95 && t < 14.85;
    const rotY = atBelt ? Math.PI : moving ? Math.atan2(p.dx, p.dz) : 2.5;
    const sneak = t < 13.95;
    const glance = sneak ? 0.55 + 0.65 * Math.sin(t * 4.6) : atBelt ? (t > 14.5 ? -1.15 * smooth(invLerp(14.5, 14.7, t)) : Math.sin(t * 6) * 0.5) : 0.25 * Math.sin(t * 3);
    const reach = smooth(invLerp(14.05, 14.35, t)) * (1 - smooth(invLerp(14.45, 14.75, t)));
    const holdL = t > 14.35;
    lp = {
      x: p.x,
      z: p.z,
      rotY,
      hop: b * (sneak ? 0.035 : 0.025),
      legL: side > 0 ? -0.7 * b : 0.15 * b,
      legR: side < 0 ? -0.7 * b : 0.15 * b,
      lean: sneak ? 0.12 : 0.18,
      headY: glance,
      headX: atBelt ? -0.1 : 0.05,
      armR: ikArm('R', [-0.15, 0.33, 0.14]),
      armL: reach > 0 ? ikArm('L', [lerp(0.15, 0.06, reach), lerp(0.33, 0.56, reach), lerp(0.14, 0.32, reach)]) : holdL ? ikArm('L', [0.12, 0.28, 0.16]) : ikArm('L', [0.15, 0.33, 0.14]),
      console: 'none',
      eyeScale: atBelt ? 1.15 : 1,
      blink: blinkAt(t, [12.9, 16.6]),
    };
    loopy.setPose(lp);
    // moeda especial vindo pela esteira até a mão
    if (t < tl.grab) {
      grabCoin.visible = true;
      grabCoin.position.set(1.85 + (t - tl.grab) * 0.55, BELT_TOP + 0.008, 0.18);
      grabCoin.rotation.set(0, 0, 0);
    } else {
      grabCoin.visible = true;
      loopy.arms.L.hand.getWorldPosition(grabCoin.position);
      grabCoin.position.y += 0.05;
    }
    const tx = clamp(p.x, 1.4, 3.6);
    setCam(V(lerp(2.0, 2.4, smooth(invLerp(14.6, 16.4, t))), 0.45, 3.75), V(tx, 0.95, 0.9), 42);
    P.dof = { focus: camera.position.distanceTo(V(p.x, 0.6, p.z)), aperture: 0.0025, maxblur: 0.008 };
    P.grade = OLD;
    P.bloom = { strength: 0.35, radius: 0.5, threshold: 1.0 };
    col.uColR.value = 0;
  }

  if (shot.id === 4 || shot.id === 5) {
    // atrás do caixote: console na mão direita, moeda na esquerda
    let crack = crackWin[0];
    let pop = pops[0];
    let typing = tl.frog.typing;
    let wi = 0;
    if (shot.id === 5) {
      const i = tl.montage.starts.filter((st) => t >= st).length - 1;
      const st = tl.montage.starts[i];
      wi = i + 1;
      crack = crackWin[wi];
      pop = pops[wi];
      typing = [st + tl.montage.typing[0], st + tl.montage.typing[1]];
    }
    const aPop = t - pop;
    const typingK = invLerp(typing[0], typing[1], t);
    const isTyping = typingK > 0 && typingK < 1;
    const joy = aPop > 0 ? Math.exp(-aPop * 0.8) : 0;
    const wide = aPop > 0 && aPop < 0.6 ? 1.35 - aPop * 0.3 : 1;
    const jit = isTyping ? Math.sin(t * 38) * 0.008 : 0;
    lp = {
      x: HIDE.x,
      z: HIDE.z,
      rotY: 0.75,
      hop: aPop > 0 && aPop < 0.4 ? Math.sin((aPop / 0.4) * Math.PI) * 0.05 : 0,
      headX: isTyping ? 0.32 : aPop > 0 ? -0.05 : 0.22,
      headY: isTyping ? -0.25 : aPop > 0 ? 0.3 : 0.25,
      armR: ikArm('R', [-0.13, 0.3 + jit, 0.24]),
      armL: ikArm('L', [0.17, 0.24, 0.24]),
      console: 'handR',
      consoleRot: [1.25, 0.25, 0.35],
      screenLight: 0.06,
      screenGlow: isTyping ? 1.8 : 1.3,
      eyeScale: wide,
      happy: aPop > 0.5 ? clamp(joy * 1.4) : 0,
      blink: blinkAt(t, [18.4, 22.9]),
    };
    loopy.setPose(lp);
    loopy.drawScreen(t, clamp(typingK));
    // moeda que racha
    const handPos = new THREE.Vector3();
    loopy.arms.L.hand.getWorldPosition(handPos);
    coin.group.visible = aPop < 0.6;
    coin.group.position.copy(handPos).add(V(0, 0.055, 0));
    coin.update(t, crack[0], crack[1], pop);
    // mundos
    games.forEach((g, i) => {
      const a = t - pops[i];
      if (a < 0) return;
      g.group.visible = true;
      const isNew = i === wi;
      let pos;
      let sc;
      if (isNew) {
        const k = clamp(a / 0.55);
        pos = handPos.clone().add(V(0, 0.06, 0)).lerp(FLOAT, easeOutCubic(k));
        sc = easeOutBack(k) * 1.0;
      } else {
        const born = pops[i + 1] ?? t;
        const m = smooth(clamp((t - born) / 0.6));
        pos = FLOAT.clone().lerp(ringPos(i, t, V(HIDE.x, 0, HIDE.z), 0.82, 1.35), m);
        sc = lerp(1.0, 0.55, m);
      }
      g.group.position.copy(pos);
      g.group.scale.setScalar(Math.max(0.001, sc));
      g.group.rotation.y = 0.75 + Math.sin(t * 0.7 + i) * 0.15;
      g.update(a);
    });
    const variants = [V(1.05, 0.95, 1.75), V(1.25, 0.88, 1.6), V(0.85, 1.0, 1.85), V(1.15, 0.9, 1.7), V(0.95, 0.98, 1.8)];
    const off = variants[wi];
    const local = shot.id === 4 ? (t - 17) / 7 : (t - tl.montage.starts[wi - 1]) / 2.5;
    const push = easeInOutSine(local);
    const pos = V(HIDE.x + off.x, off.y, HIDE.z + off.z).lerp(V(HIDE.x + off.x * 0.88, off.y, HIDE.z + off.z * 0.88), push);
    const tgt = V(HIDE.x + 0.16, 0.92, HIDE.z - 0.05);
    setCam(pos, tgt, 34);
    P.dof = { focus: pos.distanceTo(V(HIDE.x + 0.15, 0.9, HIDE.z - 0.1)), aperture: 0.004, maxblur: 0.01 };
    const flood = shot.id === 5 ? 1 : smooth(invLerp(pop, pop + 0.9, t));
    col.uColC.value.set(HIDE.x - 0.2, 0.8, HIDE.z + 0.1);
    col.uColR.value = shot.id === 5 ? 2.8 + 0.25 * wi : lerp(0.45, 2.8, easeOutCubic(clamp(aPop / 0.9)));
    col.uColEdge.value = shot.id === 4 ? 1.2 : 0.5;
    P.grade = mixGrade(OLD, NEW, flood);
    P.bloom = { strength: lerp(0.35, 0.55, flood), radius: 0.55, threshold: 0.95 };
  }

  if (shot.id === 6 || shot.id === 7) {
    const center = V(STAND.x, 0, STAND.z);
    let rotY = 0.9;
    let pose = {};
    if (shot.id === 6) {
      rotY = -1.0 + Math.sin(t * 0.8) * 0.2;
      pose = {
        headY: Math.sin(t * 0.9) * 0.5,
        headX: -0.05,
        happy: t < 37.6 ? 0.8 : 0.3,
        armR: ikArm('R', [-0.15, 0.2, 0.16]),
        armL: ikArm('L', [0.2, 0.05, 0.05]),
        console: 'handR',
        consoleRot: [1.25, 0.25, 0.35],
        blink: blinkAt(t, [35.4, 38.9]),
      };
    } else {
      const turn = smoother(invLerp(tl.end.turn, tl.end.turn + 0.5, ta));
      rotY = lerp(-1.0, -Math.PI, turn);
      const raise = easeOutBack(clamp((ta - tl.end.raise) / 0.5));
      const raiseArm = ikArm('R', [lerp(-0.15, -0.31, raise), lerp(0.2, 0.52, raise), lerp(0.16, 0.13, raise)]);
      pose = {
        headX: lerp(0, -0.12, raise),
        happy: 0.95,
        hop: ta > tl.end.raise && ta < tl.end.raise + 0.35 ? Math.sin(((ta - tl.end.raise) / 0.35) * Math.PI) * 0.06 : 0,
        armR: raiseArm,
        armL: ikArm('L', [lerp(0.2, 0.24, raise), lerp(0.05, 0.12, raise), lerp(0.05, -0.02, raise)]),
        console: 'handR',
        consoleRot: [lerp(1.25, 0.15, raise), lerp(0.25, Math.PI, raise), lerp(0.35, -raiseArm.sz, raise)],
        screenGlow: 1.8,
        screenLight: 0.2,
      };
    }
    lp = { x: STAND.x, z: STAND.z, rotY, ...pose };
    loopy.setPose(lp);
    loopy.drawScreen(ta, 1);
    const up7 = shot.id === 7 ? smooth(invLerp(40.0, 40.8, ta)) : 0;
    games.forEach((g, i) => {
      g.group.visible = true;
      const rp = ringPos(i, ta, center, lerp(0.9, 1.25, up7), lerp(1.25, 1.75, up7));
      if (up7 > 0) rp.z = Math.max(rp.z, center.z - 0.2 + 0.9 * (1 - up7));
      g.group.position.copy(rp);
      g.group.scale.setScalar(0.62);
      g.group.rotation.y = ta * 0.4 + i;
      g.update(ta - pops[i]);
    });
    col.uColC.value.set(STAND.x, 0.8, STAND.z);
    col.uColR.value = 3.2;
    col.uColEdge.value = 0.3;
    if (shot.id === 6) {
      const u = easeInOutSine((t - 34) / 6);
      const pos = V(lerp(-1.05, -0.95, u), lerp(1.55, 1.5, u), lerp(5.9, 5.5, u));
      setCam(pos, V(lerp(0.55, 0.6, u), 1.05, 1.75), 42);
      P.dof = null;
      P.grade = mixGrade(OLD, NEW, 0.45);
      P.bloom = { strength: 0.45, radius: 0.55, threshold: 0.95 };
    } else {
      F.wall.visible = true;
      outside.group.visible = true;
      outside.update(ta);
      F.peel(ta, tl.end.peel[0], tl.end.peel[1]);
      const g = smooth(invLerp(tl.end.peel[0] + 0.2, tl.end.peel[0] + 1.4, ta));
      col.uColG.value = g;
      col.uColR.value = lerp(3.2, 12, g);
      scene.fog.density = lerp(0.045, 0.0012, g);
      scene.fog.color.set(0x8e98a3).lerp(new THREE.Color(0xffc48a), g);
      scene.background.copy(scene.fog.color);
      const u = easeInOutSine((ta - 40) / 2.5);
      const punch = t >= freeze ? 1.5 * Math.exp(-(t - freeze) * 9) : 0;
      const pos = V(STAND.x + lerp(0.12, 0.04, u), lerp(0.66, 0.7, u), lerp(1.12, 1.2, u));
      setCam(pos, V(STAND.x, 0.8, STAND.z), 50 - punch);
      P.dof = { focus: pos.distanceTo(V(STAND.x, 0.9, STAND.z)), aperture: 0.0025, maxblur: 0.007 };
      const flash = t >= freeze ? 0.55 * Math.exp(-(t - freeze) * 14) : 0;
      P.grade = { ...mixGrade(OLD, NEW, 0.5 + 0.5 * g), sat: lerp(1.0, 1.15, g), white: flash, black: smooth(invLerp(tl.end.black[0], tl.end.black[1], t)) };
      P.bloom = { strength: lerp(0.45, 0.7, g), radius: 0.6, threshold: 0.95 };
    }
  }

  if (!loopy.root.visible) loopy.setPose({ console: 'none' });

  // "tremida" de filme antigo nos planos cinzas
  const oldK = shot.id <= 3 ? 1 : 0;
  if (oldK) {
    camera.rotation.z += (hash1(fi * 1.7) - 0.5) * 0.0016;
    camera.position.y += (hash1(fi * 3.1) - 0.5) * 0.002;
    const fl = 1 + (hash1(fi * 5.3) - 0.5) * 0.04;
    P.grade = { ...P.grade, tint: (P.grade.tint || [1, 1, 1]).map((v) => v * fl) };
  }

  post.apply(P);
  renderer.info.reset();
  const black = (P.grade?.black ?? 0) >= 0.999;
  if (!black) post.composer.render();
  return overlay.draw(t, renderer.domElement, black ? 'black' : '3d');
}

window.renderFrame = async (t, mime = 'image/jpeg', q = 0.95) => frame(t).toDataURL(mime, q);
window.__stats = () => ({ ...renderer.info.render });
window.__ready = true;
