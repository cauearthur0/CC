import * as THREE from 'three';
import { buildWorldA, LOOPY_SPOT } from './worldA.js';
import { buildWorldB, HERO } from './worldB.js';
import { buildLoopy, ikArm, blinkAt } from './loopy.js';
import { buildInfinityRain, buildDissolveParticles, buildRainStreaks } from './rain.js';
import { buildPost } from './post.js';
import { makeOverlay } from './overlay.js';
import { clamp, lerp, smooth, smoother, invLerp, easeInOutSine, easeOutCubic, easeInCubic, win } from './util.js';

const qs = new URLSearchParams(location.search);
const W = +(qs.get('w') || 1920);
const H = +(qs.get('h') || 1080);
const vertical = H > W;
const tl = await (await fetch('../timeline.json')).json();
await Promise.all([
  document.fonts.load('500 25px "JetBrains Mono"'),
  document.fonts.load('400 17px "JetBrains Mono"'),
  document.fonts.load('600 58px "Inter"'),
]);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 260);
const A = buildWorldA();
const B = buildWorldB(renderer);
const loopy = buildLoopy();
const rain = buildInfinityRain();
A.scene.add(rain.mesh);
const D0 = tl.dissolve[0];
const D1 = tl.dissolve[1];
const dissolveY = (t) => lerp(9, -2.5, clamp((t - D0) / (D1 - D0)));
const dissolveTimeAt = (y) => D0 + ((9 - (y - 0.9)) / 11.5) * (D1 - D0);
const parts = buildDissolveParticles(A.particleSeeds(26000), dissolveTimeAt);
A.scene.add(parts.mesh);
const streaks = buildRainStreaks();
A.scene.add(streaks.mesh);
A.scene.add(loopy.props);

const post = buildPost(renderer, W, H, A.scene, camera);
const overlay = makeOverlay(W, H, tl, { vertical, captions: qs.get('captions') !== '0' });

// ---------- câmera ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpV = new THREE.Vector3();
function portraitFov(fov, k = 0.62) {
  if (!vertical) return fov;
  // largura do quadro vertical = k x largura do quadro 16:9 (em tangente)
  const t = (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (16 / 9) * k) / (W / H);
  return THREE.MathUtils.radToDeg(2 * Math.atan(t));
}
function setCam(pos, target, fov, k) {
  camera.position.copy(pos);
  camera.fov = portraitFov(fov, k);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}
function shake(t, times, amp = 0.03) {
  let x = 0, y = 0;
  for (const T of times) {
    const a = t - T;
    if (a > 0 && a < 0.8) {
      const e = Math.exp(-a * 7) * amp;
      x += Math.sin(a * 63) * e;
      y += Math.cos(a * 51) * e * 1.3;
    }
  }
  return V(x, y, 0);
}

// ---------- poses do Loopy ----------
const SP = LOOPY_SPOT;
const handsConsole = (jit = 0) => ({
  armL: ikArm('L', [0.14, 0.13 + jit, 0.2]),
  armR: ikArm('R', [-0.14, 0.13 - jit, 0.2]),
});
const handsOut = ikArm('L', [0.21, 0.25, 0.3]);
const handsOutR = ikArm('R', [-0.21, 0.25, 0.3]);
const relaxedL = { sx: 0.05, sz: 0.14, ex: -0.2 };
const relaxedR = { sx: 0.05, sz: 0.14, ex: -0.2 };

const gradeA = { sat: 0.82, contrast: 1.07, tint: [0.94, 0.985, 1.05], vignette: 0.5, grain: 0.05 };
const gradeB = { sat: 1.06, contrast: 1.03, tint: [1.065, 1.065, 1.065], vignette: 0.12, grain: 0.03, aberr: 0.001 };

function shotAt(t) {
  for (const s of tl.shots) if (t < s.end) return s;
  return tl.shots[tl.shots.length - 1];
}

function frame(t) {
  const shot = shotAt(t);
  const l = t - shot.start;
  const P = { camera, seed: Math.floor(t * tl.fps) };
  let pose = {};
  A.dis.uniforms.uDissolveOn.value = 0;
  rain.uniforms.uAmount.value = 0;
  parts.uniforms.uOn.value = 0;
  streaks.uniforms.uAmt.value = 0;
  B.hero.update(t, tl.tokens, false);
  B.plinth.visible = B.plinthShadow.visible = false;
  renderer.toneMappingExposure = 1.0;

  if (shot.id <= 4) {
    P.scene = A.scene;
    A.scene.add(loopy.root);
    A.scene.add(loopy.props);
    A.update(t);
    A.setAtmosphere(0);
    loopy.root.position.set(SP.x, 0, SP.z);
  } else {
    P.scene = B.scene;
    B.scene.add(loopy.root);
    B.scene.add(loopy.props);
    B.time.value = t;
  }

  if (shot.id === 1) {
    const u = l / 8;
    const pos = V(0.0, lerp(3.35, 2.85, u), lerp(10.5, 3.6, easeInOutSine(u * 0.9 + 0.05)));
    pos.x += Math.sin(t * 0.7) * 0.03;
    setCam(pos, V(0, 0.9, pos.z - 12), 42);
    pose = { x: SP.x, z: SP.z, rotY: Math.PI, headX: 0.25, armL: relaxedL, armR: relaxedR, console: 'none' };
    P.grade = { ...gradeA, black: 1 - smooth(l / 0.9) };
    P.bloom = { strength: 0.32, radius: 0.5, threshold: 0.92 };
  }

  if (shot.id === 2) {
    const T = tl.loopyTurn;
    const turn = smoother(invLerp(T, T + 1.15, t));
    const headLead = smoother(invLerp(T - 0.25, T + 0.75, t));
    const rotY = Math.PI * (1 - turn);
    const headY = (headLead - turn) * 1.1;
    const u = easeInOutSine(invLerp(8.0, 14.0, t));
    const head = V(SP.x, 0.92, SP.z);
    const start = V(SP.x + 2.9, 1.78, SP.z + 7.0);
    const end = V(SP.x + 0.8, 1.12, SP.z + 1.72);
    const pos = start.clone().lerp(end, u);
    pos.y += Math.sin(t * 0.9) * 0.01;
    setCam(pos, head.clone().add(V(0, -0.05, 0)), 28, 0.7);
    const dist = pos.distanceTo(head);
    pose = {
      x: SP.x,
      z: SP.z,
      rotY,
      headY,
      headX: lerp(0.25, -0.06, turn),
      armL: relaxedL,
      armR: relaxedR,
      console: 'none',
      blink: blinkAt(t, [11.4, 13.2]),
      eyeGlow: 2.0,
    };
    P.dof = { focus: dist, aperture: 0.0035, maxblur: 0.01 };
    P.grade = gradeA;
    P.bloom = { strength: 0.38, radius: 0.4, threshold: 0.95 };
  }

  if (shot.id === 3) {
    const base = V(SP.x, 0, SP.z);
    const u = easeInOutSine(l / 6);
    const pos = base.clone().add(V(lerp(0.5, 0.44, u), lerp(1.0, 0.98, u), lerp(1.95, 1.75, u)));
    const target = base.clone().add(V(-0.01, 0.74, 0.24));
    setCam(pos, target, 28, 0.8);
    const rack = smoother(invLerp(16.3, 17.6, t));
    const grab = smooth(invLerp(14.0, 14.9, t));
    const coinArm = ikArm('L', [0.2, 0.17, 0.4]);
    const infArm = ikArm('R', [-0.22, 0.19, 0.36]);
    pose = {
      x: SP.x,
      z: SP.z,
      rotY: 0,
      headX: lerp(0.16, 0.22, rack),
      headY: lerp(0.1, -0.2, rack),
      armL: { sx: lerp(-0.3, coinArm.sx, grab), sz: coinArm.sz, ex: coinArm.ex },
      armR: { sx: lerp(-0.3, infArm.sx, grab), sz: infArm.sz, ex: infArm.ex },
      console: 'none',
      props: true,
      infFloat: 0.015 * Math.sin(t * 2.2),
      infSpin: Math.sin(t * 0.8),
      infPulse: 1 + 0.07 * Math.sin(t * 4.4),
      infGlow: lerp(0.35, 1.0, rack) + 0.3 * smooth(invLerp(19.3, 20, t)),
      blink: blinkAt(t, [15.6, 18.6]),
      eyeGlow: 1.9,
    };
    streaks.uniforms.uAmt.value = 1;
    streaks.uniforms.uTime.value = t;
    streaks.uniforms.uCenter.value.set(SP.x, 0, SP.z - 1.2);
    P.dofRack = { k: rack, aperture: 0.03, maxblur: 0.012 };
    P.grade = { ...gradeA, vignette: 0.6 };
    P.bloom = { strength: 0.6, radius: 0.45, threshold: 0.95 };
  }

  if (shot.id === 4) {
    A.dis.uniforms.uDissolveOn.value = 1;
    A.dis.uniforms.uDissolveY.value = dissolveY(t);
    const k = smooth(invLerp(20.6, 23.8, t));
    A.setAtmosphere(k);
    rain.uniforms.uTime.value = t;
    rain.uniforms.uDissolveY.value = dissolveY(t);
    rain.uniforms.uAmount.value = smooth(invLerp(20.1, 21.2, t));
    rain.uniforms.uBright.value = 1 + 1.5 * smooth(invLerp(24.6, 26, t));
    parts.uniforms.uOn.value = 1;
    parts.uniforms.uTime.value = t;
    parts.uniforms.uScale.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const pitch = lerp(-0.06, 1.12, smoother(invLerp(20.6, 25.6, t)));
    const pos = V(0, lerp(2.3, 1.7, l / 6), lerp(5.6, 4.4, l / 6));
    const dir = V(0, Math.sin(pitch), -Math.cos(pitch));
    setCam(pos, pos.clone().add(dir), 52, 0.7);
    pose = { x: SP.x, z: SP.z, rotY: 0, headX: -0.3, armL: relaxedL, armR: relaxedR, console: 'none', eyeGlow: 2.6 };
    P.grade = {
      ...gradeA,
      tint: [lerp(0.94, 1.03, k), lerp(0.985, 0.99, k), lerp(1.05, 0.96, k)],
      sat: lerp(0.82, 1.1, k),
      white: easeInCubic(invLerp(tl.whiteout[0], tl.whiteout[1], t)),
    };
    P.bloom = { strength: lerp(0.4, 1.0, k), radius: 0.65, threshold: 0.85 };
  }

  if (shot.id >= 5) {
    B.setRows(t, tl.rackWaves);
    B.blob.position.set(0, 0.002, 0);
  }

  if (shot.id === 5) {
    B.hideRows();
    const a = lerp(0.6, -0.4, easeInOutSine(l / 6));
    const r = 5.4;
    const pos = V(Math.sin(a) * r, 1.45, Math.cos(a) * r);
    setCam(pos, V(0, 0.62, 0), 26, 0.7);
    const typing = invLerp(tl.typing[0], tl.typing[1], t);
    const jit = typing > 0 && typing < 1 ? Math.sin(t * 31) * 0.006 : 0;
    const look = smooth(invLerp(31.2, 31.8, t));
    pose = {
      x: 0,
      z: 0,
      rotY: 0,
      headX: lerp(0.42, -0.12, look),
      bob: Math.sin(t * 2.1) * 0.004,
      ...handsConsole(jit),
      console: 'hand',
      consoleTilt: -0.85,
      screenLight: 0.35,
      screenGlow: 1.5 + 0.6 * smooth(invLerp(31.0, 31.4, t)),
      blink: blinkAt(t, [28.4, 30.2]),
    };
    loopy.drawScreen(t, clamp(typing));
    P.grade = { ...gradeB, white: 1 - smooth(invLerp(tl.whitein[0], tl.whitein[1], t)) };
    P.bloom = { strength: 0.45, radius: 0.5, threshold: 1.15 };
    P.dof = null;
  }

  if (shot.id === 6) {
    const pull = easeInOutSine(invLerp(34.2, 40.0, t));
    const pos = V(0, 0.62, 3.3).lerp(V(0, 8.6, 17.5), pull);
    const target = V(0, 0.95, -4).lerp(V(0, 0.4, -7), pull);
    pos.add(shake(t, tl.rackWaves.slice(0, 5), 0.035 * (1 - pull)));
    setCam(pos, target, lerp(40, 46, pull), 0.62);
    const waveLook = tl.rackWaves.map((T, i) => (t > T - 0.5 ? (i % 2 ? 1 : -1) * 0.5 * Math.exp(-(t - T) * 1.2) : 0)).reduce((a, b) => a + b, 0);
    let dip = 0;
    for (const T of tl.rackWaves.slice(0, 4)) {
      const a = t - T;
      if (a > 0 && a < 0.4) dip -= Math.sin((a / 0.4) * Math.PI) * 0.02;
    }
    pose = {
      x: 0,
      z: 0,
      rotY: 0,
      headX: lerp(-0.08, -0.3, smooth(invLerp(32.3, 33.2, t))),
      headY: waveLook + Math.sin(t * 0.6) * 0.15,
      bob: dip,
      ...handsConsole(0),
      console: 'hand',
      consoleTilt: -0.6,
      screenLight: 0.2,
      blink: blinkAt(t, [36.3, 38.8]),
    };
    loopy.drawScreen(t, 1);
    P.grade = gradeB;
    P.bloom = { strength: 0.55, radius: 0.55, threshold: 1.15 };
  }

  if (shot.id === 7 || shot.id === 8) {
    B.plinth.visible = B.plinthShadow.visible = true;
    const done = B.hero.update(t, tl.tokens, true);
    const hc = V(HERO.x, HERO.top + 0.26, HERO.z);
    const toLoopy = V(-HERO.x, 0, -HERO.z).normalize();
    const perp = V(-toLoopy.z, 0, toLoopy.x); // perpendicular apontando para +Z
    if (perp.z < 0) perp.negate();
    const away = toLoopy.clone().negate().applyAxisAngle(V(0, 1, 0), -0.72);
    const u7 = easeInOutSine(invLerp(40, 48, t));
    const target7 = hc.clone().add(toLoopy.clone().multiplyScalar(0.02)).add(V(0, 0.07, 0));
    const pos7 = hc.clone().add(away.clone().multiplyScalar(lerp(1.45, 1.3, u7))).add(V(0, lerp(0.5, 0.44, u7), 0));
    let pos = pos7;
    let target = target7;
    let fov = 34;
    if (shot.id === 8) {
      const p = easeInOutSine(invLerp(48.0, 52.0, t));
      const posEnd = hc.clone().add(away.clone().multiplyScalar(1.3)).add(V(0, 0.44, 0));
      pos = posEnd.clone().lerp(V(0.5, 7.2, 14), p);
      target = target7.clone().lerp(V(0.3, 0.6, -3), p);
      fov = lerp(34, 44, p);
    }
    setCam(pos, target, fov, 0.7);
    // alegria a cada ficha que pousa
    let joy = 0;
    let hop = 0;
    tl.tokens.forEach((T, i) => {
      const a = t - T;
      if (a > 0) joy = Math.max(joy, Math.exp(-a * 1.1) * 1.2);
      if ((i === 4 || i === 7) && a > 0 && a < 0.45) hop = Math.max(hop, Math.sin((a / 0.45) * Math.PI) * 0.07);
    });
    const heroYaw = Math.atan2(HERO.x, HERO.z);
    let rotY = heroYaw;
    let headX = 0.32;
    let headY = 0;
    let happy = clamp(joy) * 0.95;
    let armL = relaxedL;
    let armR = relaxedR;
    if (done >= 4) {
      const lift = smooth(invLerp(tl.tokens[3], tl.tokens[3] + 0.5, t));
      armL = ikArm('L', [lerp(0.2, 0.22, lift), lerp(0.05, 0.36, lift), lerp(0.05, 0.12, lift)]);
      armR = ikArm('R', [lerp(-0.2, -0.22, lift), lerp(0.05, 0.36, lift), lerp(0.05, 0.12, lift)]);
    }
    if (shot.id === 8) {
      const turn = smooth(invLerp(48.4, 49.6, t));
      rotY = lerp(heroYaw, 0.15, turn);
      headX = lerp(0.32, -0.42, turn);
      headY = 0;
      happy = Math.max(happy, 0.85 * turn);
      const wave = smooth(invLerp(49.2, 49.8, t));
      armR = ikArm('R', [-0.26, lerp(0.05, 0.5, wave) + Math.sin(t * 9) * 0.03 * wave, 0.06]);
      armL = relaxedL;
    }
    const focus = pos.distanceTo(hc);
    pose = {
      x: 0,
      z: 0,
      rotY,
      hop,
      headX,
      headY,
      happy,
      bob: Math.sin(t * 2.1) * 0.004,
      armL,
      armR,
      console: 'side',
      screenLight: 0.0,
      eyeGlow: 2.0,
    };
    loopy.drawScreen(t, 1);
    const warmK = clamp(done / 8);
    P.grade = { ...gradeB, tint: [1 + 0.04 * warmK, 1.0, 1 - 0.04 * warmK] };
    P.dof = shot.id === 7 ? { focus, aperture: 0.0048, maxblur: 0.011 } : null;
    P.bloom = { strength: 0.5 + 0.12 * warmK, radius: 0.5, threshold: 1.15 };
    if (shot.id === 8) {
      P.grade = { ...P.grade, white: smooth(invLerp(tl.end.white[0], tl.end.white[1], t)) };
    }
  }

  if (qs.get('cam')) {
    const c = qs.get('cam').split(',').map(Number);
    setCam(V(c[0], c[1], c[2]), V(c[3], c[4], c[5]), c[6] || 30);
    P.dof = null;
  }
  loopy.setPose(pose);
  if (P.dofRack) {
    const a = camera.position.distanceTo(loopy.coin.position);
    const b = camera.position.distanceTo(loopy.inf.position);
    P.dof = { focus: lerp(a, b, P.dofRack.k), aperture: P.dofRack.aperture, maxblur: P.dofRack.maxblur };
  }
  post.apply(P);
  renderer.info.reset();
  const skip3D = (P.grade?.white ?? 0) >= 0.999;
  if (!skip3D) post.composer.render();
  return overlay.draw(t, renderer.domElement, skip3D);
}

window.renderFrame = async (t, mime = 'image/jpeg', q = 0.95) => {
  const c = frame(t);
  return c.toDataURL(mime, q);
};
window.__stats = () => ({ ...renderer.info.render, calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries });
window.__ready = true;
document.title = 'ready';
