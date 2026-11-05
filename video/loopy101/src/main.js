import * as THREE from 'three';
import { buildClassroom, BOARD, BENCH, DESKS, DOOR } from './classroom.js';
import { buildFrog, buildShiba, buildCat, buildWhale } from './students.js';
import { buildLoopy, ikArm, blinkAt } from './loopy.js';
import { buildGames } from './games.js';
import { buildCrackCoin } from './coin.js';
import { loadGraphics } from './infographics.js';
import { buildPost } from './post.js';
import { makeOverlay } from './overlay.js';
import { clamp, lerp, smooth, smoother, invLerp, easeInOutSine, easeOutBack, easeOutCubic, easeInCubic, win } from './util.js';

const qs = new URLSearchParams(location.search);
const W = +(qs.get('w') || 1920);
const H = +(qs.get('h') || 1080);
const tl = await (await fetch('../timeline.json')).json();
await Promise.all(['700 200px "Caveat"', '500 34px "JetBrains Mono"', '600 38px "Inter"', 'italic 600 38px "Inter"', '800 64px "Inter"', '900 170px "Inter"'].map((f) => document.fonts.load(f)));
const logo = new Image();
logo.src = '../assets/looploot-infinity.png';
await logo.decode();
const graphics = await loadGraphics(tl, logo);
window.__graphics = Object.fromEntries(Object.entries(graphics).map(([k, v]) => [k, v.real ? 'real' : 'provisório']));

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.03, 60);

const C = buildClassroom(renderer, logo, tl);
const scene = C.scene;
const loopy = buildLoopy();
scene.add(loopy.root);
const frog = buildFrog();
const shiba = buildShiba();
const cat = buildCat();
const whale = buildWhale();
for (const s of [frog, shiba, cat, whale]) scene.add(s.root);
const games = buildGames();
const frogWorld = games[0];
const shibaWorld = games[1];
scene.add(frogWorld.group, shibaWorld.group);
const crack = buildCrackCoin();
crack.wedges.forEach((w) => (w.material = new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.6, roughness: 0.3, emissive: 0xff5a10, emissiveIntensity: 0.35 })));
scene.add(crack.group);
const coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.014, 32);
const goldCoin = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.95, roughness: 0.22 }));
const greyCoin = new THREE.Mesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.7, roughness: 0.45 }));
for (const c of [goldCoin, greyCoin]) {
  c.castShadow = true;
  scene.add(c);
}
// giz e varinha na mão direita do Loopy
const chalkStick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.075, 8), new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.9 }));
chalkStick.rotation.x = Math.PI / 2;
chalkStick.position.set(0, -0.17, 0.04);
loopy.arms.R.elbow.add(chalkStick);
const pointer = new THREE.Group();
const stickM = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.5 }));
stickM.position.y = -0.3;
const tipM = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.4 }));
tipM.position.y = -0.6;
pointer.add(stickM, tipM);
pointer.position.set(0, -0.17, 0.0);
loopy.arms.R.elbow.add(pointer);

const post = buildPost(renderer, W, H, scene, camera);
const overlay = makeOverlay(W, H, tl, graphics, logo, { captions: qs.get('captions') !== '0' });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = tl.events;
const seat = (d, dy = 0.36) => V(d.x, dy, d.z + 0.5);
const SEAT = { frog: seat(DESKS.frog), shiba: seat(DESKS.shiba), cat: seat(DESKS.cat), whale: V(DESKS.whale.x, 0.3, DESKS.whale.z + 0.52) };
function setCam(pos, target, fov) {
  camera.position.copy(pos);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}
const camPath = (t, t0, t1, p0, p1, q0, q1, f0, f1, ease = easeInOutSine) => {
  const u = ease(invLerp(t0, t1, t));
  setCam(p0.clone().lerp(p1, u), q0.clone().lerp(q1, u), lerp(f0, f1, u));
  return u;
};
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pulse = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin(((t - t0) / d) * Math.PI) : 0);
const talkAt = (t, [a, b], rate = 11) => (t > a && t < b ? 0.5 + 0.5 * Math.sin(t * rate) * Math.sin(t * rate * 0.37 + 1) : 0);
const tmp = new THREE.Vector3();

// alunos: pose de repouso (respira, pisca, olha para o Loopy)
function studentIdle(t, ph, look) {
  return {
    bounce: Math.sin(t * 2 + ph) * 0.004,
    eyes: 1 - Math.max(blinkAt(t, [1.3 + ph, 4.6 + ph, 8.9 + ph, 13.4 + ph, 19.8 + ph, 26.1 + ph, 33.7 + ph, 41.2 + ph, 47.5 + ph]), 0),
    turn: look,
  };
}

function frame(t) {
  const P = { camera, scene, seed: Math.floor(t * tl.fps) };
  const inG = overlay.inGraphic(t);
  if (inG) {
    // gráfico em tela cheia: não precisa renderizar o 3D
    return overlay.draw(t, null, { skip3D: true });
  }
  const tip = C.update(t);
  frogWorld.group.visible = false;
  shibaWorld.group.visible = false;
  crack.group.visible = false;
  goldCoin.visible = false;
  greyCoin.visible = false;
  chalkStick.visible = false;
  pointer.visible = false;
  whale.star.visible = false;

  // ---------- Loopy ----------
  let L = { x: 0, z: -2.45, y: 0, rotY: 0, console: 'none', armL: { sx: 0.05, sz: 0.14, ex: -0.2 }, armR: { sx: 0.05, sz: 0.14, ex: -0.2 } };
  const onBench = t < 27.4;
  const boardFace = Math.PI;
  const loopyPos = () => V(L.x, L.y, L.z);

  // ---------- alunos ----------
  const ls = V(L.x, 0.8, L.z);
  let F = { ...studentIdle(t, 0.3, 0) };
  let Sh = { ...studentIdle(t, 1.1, 0), wag: t, wagAmt: 0.25 };
  let Ct = { ...studentIdle(t, 2.0, 0), t };
  let Wh = { ...studentIdle(t, 0.7, 0), t };
  const sitUp = pulse(t, E.sitUp, 0.5);
  [F, Sh, Ct].forEach((o) => (o.bounce += sitUp * 0.04));
  Wh.squash = pulse(t, E.sitUp + 0.15, 0.45) * 0.5;

  // ================= plano 1: LOOPLOOT 101 =================
  if (t < 6) {
    const writing = t < E.turn;
    const tipW = tip ? C.boardToWorld(tip.x, tip.y) : null;
    const tx = tipW ? tipW.x - 0.16 : t < 1 ? -0.85 : 0.62;
    L = { x: tx, z: BENCH.z - 0.04, y: BENCH.h, rotY: writing ? boardFace : lerp(boardFace, boardFace - Math.PI * 0.85, smoother(invLerp(E.turn, E.turn + 0.45, t))), console: 'none', armL: { sx: 0.1, sz: 0.2, ex: -0.4 } };
    L.bob = Math.sin(t * 7) * 0.006;
    L.headX = writing ? -0.18 : -0.05;
    L.happy = t > E.turn + 0.3 ? 0.9 : 0;
    chalkStick.visible = true;
    if (tipW && writing) L.armR = 'ik';
    else L.armR = writing ? ikArm('R', [-0.1, 0.42, 0.18]) : ikArm('R', [-0.2, 0.35, 0.12]);
    if (!writing) L.armL = ikArm('L', [0.22, 0.12, 0.05]);
    // alunos olham a lousa
    if (t < 4.2) {
      const u = camPath(t, 0, 4.2, V(-0.15, 1.95, 2.45), V(-0.1, 1.85, 1.75), V(0, 1.0, -3.9), V(0, 1.05, -3.9), 44, 42);
      void u;
      P.dof = null;
    } else {
      camPath(t, 4.2, 6, V(-0.1, 1.08, -2.95), V(-0.05, 1.05, -2.75), V(0.05, 0.72, -0.4), V(0.05, 0.72, -0.4), 40, 38);
      P.dof = { focus: 2.3, aperture: 0.0025, maxblur: 0.008 };
    }
    L._tipW = tipW;
  }

  // ================= plano 2: a moeda vazia =================
  if (t >= 6 && t < 10) {
    L = { x: 0.48, z: -1.92, rotY: 0.35, console: 'none' };
    const up = smooth(invLerp(E.coinUp, E.coinUp + 0.5, t));
    L.armL = ikArm('L', [lerp(0.2, 0.12, up), lerp(0.1, 0.33, up), lerp(0.05, 0.3, up)]);
    L.armR = { sx: 0.05, sz: 0.14, ex: -0.2 };
    const nod = t > E.nod[0] && t < E.nod[1] ? Math.sin(((t - E.nod[0]) / (E.nod[1] - E.nod[0])) * Math.PI * 2) * 0.22 : 0;
    L.headX = 0.12 + nod;
    L.headY = 0.25;
    goldCoin.visible = true;
    // shiba levanta o taco e bate na moeda
    const raise = smooth(invLerp(E.batUp, E.batUp + 0.45, t));
    const tap = pulse(t, E.tink - 0.12, 0.3);
    Sh = { ...Sh, armR: [lerp(-0.6, -2.3, raise) + tap * 1.0, lerp(0.2, 0.05, raise)], lean: raise * 0.25, headX: 0.1 + raise * 0.1, ears: raise };
    const lean = smooth(invLerp(E.leanIn, E.leanIn + 0.5, t));
    for (const o of [F, Sh, Ct]) {
      o.lean = (o.lean ?? 0) + lean * 0.25;
      o.headZ = lean * 0.2;
    }
    Sh.headZ = lean * -0.25;
    Wh.lean = lean * 0.15;
    Wh.lookY = lean * -0.3;
    F.lookX = 0.3;
    if (t < E.zoomBoard[0]) {
      camPath(t, 6, E.zoomBoard[0], V(2.05, 0.98, -1.5), V(1.9, 0.96, -1.48), V(0.62, 0.72, -1.5), V(0.62, 0.72, -1.5), 38, 36);
      P.dof = { focus: 1.35, aperture: 0.003, maxblur: 0.008 };
    } else {
      const u = easeInCubic(invLerp(E.zoomBoard[0], E.zoomBoard[1], t));
      setCam(V(0.1, 1.08, lerp(-1.25, -1.9, u)), V(0, 1.02, -3.96), lerp(42, 16, u));
      P.dof = null;
    }
  }

  // ================= plano 3: uma frase =================
  if (t >= 13 && t < 18) {
    L = { x: -0.2, z: -2.3, rotY: 0, console: 'none' };
    const point = smooth(invLerp(E.pointFrog - 0.2, E.pointFrog + 0.2, t)) * (1 - smooth(invLerp(14.6, 14.9, t)));
    L.rotY = lerp(-0.2, -0.55, point) + (t > 14.9 ? 0.1 : 0);
    if (t > 14.9) L.x = 0.1;
    if (t < 14.9) {
      pointer.visible = true;
      pointer.rotation.set(-1.4 * point - 0.2, 0, 0);
      L.armR = ikArm('R', [lerp(-0.15, -0.1, point), lerp(0.1, 0.35, point), lerp(0.05, 0.3, point)]);
    } else {
      const typing = t > E.typing[0] && t < E.typing[1];
      L.console = 'handR';
      L.consoleRot = [1.2, 0.0, 0.3];
      L.armR = ikArm('R', [-0.12, 0.3 + (typing ? Math.sin(t * 36) * 0.006 : 0), 0.24]);
      L.screenLight = 0.15;
      L.headX = typing ? 0.3 : -0.05;
      L.happy = t > E.pop + 0.3 ? 0.9 : 0;
      L.eyeScale = t > E.pop && t < E.pop + 0.6 ? 1.3 : 1;
    }
    loopy.drawScreen(t, clamp(invLerp(E.typing[0], E.typing[1], t)));
    // sapo se levanta e fala
    const st = smooth(invLerp(E.frogStands, E.frogStands + 0.4, t));
    F = { ...F, stand: st, talk: talkAt(t, E.frogTalk) + pulse(t, E.ahem, 0.25) * 0.6, armL: [-0.3 - st * 0.4, 0.3], armR: [lerp(0.2, -2.4, pulse(t, 14.3, 0.8)), 0.35], lean: -st * 0.05, turn: 0.35 };
    // mundo do sapo sai do console
    if (t > E.pop) {
      const a = t - E.pop;
      loopy.root.updateMatrixWorld(true);
      loopy.arms.R.hand.getWorldPosition(tmp);
      const k = clamp(a / 0.5);
      frogWorld.group.visible = true;
      frogWorld.group.position.copy(tmp).add(V(0, 0.08 + 0.25 * easeOutCubic(k), 0.05));
      frogWorld.group.scale.setScalar(Math.max(0.001, easeOutBack(k) * 0.8));
      frogWorld.group.rotation.y = Math.PI + 0.3 + Math.sin(t) * 0.1;
      frogWorld.update(a);
    }
    const gasp = smooth(invLerp(E.gasp, E.gasp + 0.3, t));
    for (const o of [F, Sh, Ct, Wh]) {
      o.wide = 1 + gasp * 0.25;
      o.gasp = gasp;
    }
    Wh.talk = gasp * 0.6;
    if (t < 15.0) {
      camPath(t, 13, 15, V(-1.95, 1.06, -2.6), V(-1.85, 1.04, -2.52), V(-0.42, 0.84, -1.5), V(-0.44, 0.86, -1.48), 46, 44);
      P.dof = null;
    } else if (t < E.dive[0]) {
      camPath(t, 15, E.dive[0], V(0.0, 1.18, -0.5), V(0.02, 1.16, -0.68), V(0.08, 0.98, -2.3), V(0.08, 1.02, -2.3), 34, 32);
      P.dof = { focus: 1.7, aperture: 0.0025, maxblur: 0.008 };
    } else {
      const wp = frogWorld.group.position.clone();
      const u = easeInCubic(invLerp(E.dive[0], E.dive[1], t));
      setCam(V(0.02, 1.16, -0.68).lerp(wp.clone().add(V(0, 0.08, 0.12)), u), V(0.08, 1.02, -2.3).lerp(wp, u), lerp(32, 22, u));
      P.dof = null;
    }
  }

  // ================= plano 4: para onde vai a taxa =================
  if (t >= 22 && t < 27.2) {
    const drawing = t >= tl.board.diagram.draw[0] - 0.3;
    const tipW = tip ? C.boardToWorld(tip.x, tip.y) : null;
    L = { x: tipW ? tipW.x - 0.16 : drawing ? 0.95 : -0.9, z: BENCH.z - 0.04, y: BENCH.h, rotY: boardFace, console: 'none' };
    if (t < E.smile) L.rotY = boardFace - 0.9; // olhando o gato
    L.happy = t > E.smile && t < E.smile + 0.9 ? 0.9 : 0;
    chalkStick.visible = drawing && t < tl.board.diagram.draw[1] + 0.05;
    pointer.visible = t > tl.board.diagram.draw[1] + 0.05;
    if (tipW && t < tl.board.diagram.draw[1]) L.armR = 'ik';
    else if (pointer.visible) {
      const tap = Math.abs(Math.sin(invLerp(E.taps[0], E.taps[1] + 0.2, t) * Math.PI * 2)) * (t < E.taps[1] + 0.2 ? 1 : 0);
      pointer.rotation.set(-1.2 - tap * 0.15, 0, 0.2);
      L.armR = ikArm('R', [-0.08, 0.25, 0.2]);
      L.rotY = boardFace + 0.3;
    } else L.armR = ikArm('R', [-0.15, 0.25, 0.15]);
    L.headX = -0.1;
    const paw = smooth(invLerp(E.catPaw, E.catPaw + 0.35, t));
    Ct = { ...Ct, armR: [lerp(-0.3, -2.8, paw), lerp(0.2, 0.1, paw)], headZ: 0.22 * paw, eyes: 0.45, headX: -0.05 };
    if (t < 24.0) {
      camPath(t, 22, 24, V(-0.3, 1.02, -0.62), V(-0.33, 1.0, -0.48), V(-0.82, 0.82, 0.55), V(-0.82, 0.84, 0.55), 40, 38);
      P.dof = { focus: 1.0, aperture: 0.004, maxblur: 0.01 };
    } else if (t < E.morph[0]) {
      camPath(t, 24, E.morph[0], V(-1.75, 1.2, -2.05), V(-1.55, 1.15, -2.2), V(0.25, 0.95, -3.9), V(0.2, 0.95, -3.9), 44, 42);
      P.dof = null;
    } else {
      const u = easeInCubic(invLerp(E.morph[0], E.morph[1], t));
      setCam(V(-1.55, 1.15, -2.2).lerp(V(0, 0.95, -3.05), u), V(0.2, 0.95, -3.9).lerp(V(0, 0.95, -3.9), u), lerp(42, 38, u));
      P.dof = null;
    }
  }

  // ================= plano 5: quiz relâmpago =================
  if (t >= 31 && t < 39) {
    const whipT = smoother(invLerp(E.whip, E.whip + 0.25, t));
    // baleia sonhando acordada, apertando um botão imaginário
    const startle = pulse(t, E.startle, 0.35);
    const thinking = t > E.think[0] && t < E.think[1];
    const daydream = t < E.startle;
    Wh = {
      ...Wh,
      eyes: daydream ? 0.45 : 1,
      lookY: daydream ? 0.5 : thinking ? 0.6 : 0,
      lookX: thinking ? Math.sin(t * 1.5) * 0.3 : 0,
      finR: daydream ? [Math.abs(Math.sin(t * 7)) * -0.5, 0] : thinking ? [-1.2, 0.4] : [0, 0],
      bounce: startle * 0.18,
      squash: -startle * 0.6,
      wide: t > E.startle && t < E.startle + 0.8 ? 1.35 : 1,
      talk: talkAt(t, E.answer, 8),
      tilt: thinking ? Math.sin(t * 1.2) * 0.08 : 0,
    };
    const starOn = t > E.star;
    Wh.star = starOn;
    Wh.starScale = starOn ? easeOutBack(clamp((t - E.star) / 0.25)) : 0;
    const cheer = smooth(invLerp(E.cheer[0], E.cheer[0] + 0.3, t));
    if (cheer > 0) {
      const j = (ph) => Math.abs(Math.sin(t * 7 + ph)) * 0.06 * cheer;
      F = { ...F, armL: [-2.6 * cheer, 0.5], armR: [-2.6 * cheer, 0.5], bounce: j(0), gasp: 0.5 * cheer };
      Sh = { ...Sh, armL: [-2.6 * cheer, 0.4], armR: [-2.4 * cheer, 0.3], bounce: j(1), wagAmt: 1 };
      Ct = { ...Ct, armL: [-2.5 * cheer, 0.4], armR: [-2.5 * cheer, 0.4], bounce: j(2), eyes: 0.9 };
      Wh.finL = [-1.0 * cheer, 0.6];
      Wh.finR = [-1.0 * cheer, 0.6];
      Wh.bounce += j(3);
      Wh.talk = 0.4 * cheer;
    }
    if (t < E.correct) {
      L = { x: 0.1, z: -3.2, rotY: lerp(Math.PI, Math.PI * 2 + 0.25, whipT), console: 'none' };
      pointer.visible = true;
      const pt = smooth(invLerp(E.whip + 0.1, E.whip + 0.3, t));
      pointer.rotation.set(-1.5 * pt - 0.1, 0, 0);
      L.armR = ikArm('R', [lerp(-0.1, -0.26, pt), lerp(0.15, 0.34, pt), lerp(0.05, 0.24, pt)]);
      L.headX = -0.05;
      if (t < E.whip + 0.55) {
        camPath(t, 31, E.whip + 0.55, V(0.0, 1.0, -1.35), V(0.0, 1.0, -1.45), V(0.05, 0.85, -3.4), V(0.05, 0.85, -3.4), 40, 38);
        P.dof = null;
      } else {
        const crash = easeOutCubic(invLerp(E.whip + 0.55, E.whip + 0.8, t));
        const pos = V(0.35, 1.12, -0.85).lerp(V(0.5, 1.1, -0.55), easeInOutSine(invLerp(E.whip + 0.8, E.answer[1], t)));
        setCam(pos, V(0.95, 1.05, 0.4), lerp(30, 34, 1 - crash) - (t > E.startle ? 0 : 0));
        P.dof = { focus: pos.distanceTo(V(0.95, 1.05, 0.35)), aperture: 0.003, maxblur: 0.008 };
      }
    } else {
      // o Loopy pula e cola a estrela
      L = { x: 0.82, z: -0.48, rotY: lerp(0.15, 1.9, smoother(invLerp(E.star + 0.35, E.star + 0.75, t))), console: 'none' };
      const jump = pulse(t, E.star - 0.25, 0.55);
      L.hop = jump * 0.38;
      L.armR = ikArm('R', [-0.1, lerp(0.2, 0.5, smooth(invLerp(E.star - 0.3, E.star - 0.05, t))), 0.25]);
      L.happy = 0.9;
      L.headX = -0.35;
      Wh.lean = 0.35 * smooth(invLerp(E.correct, E.correct + 0.4, t)) * (1 - smooth(invLerp(E.cheer[0], E.cheer[0] + 0.6, t)) * 0.8);
      Wh.eyes = t > E.star ? 0.4 : 1;
      if (t < E.cheer[0] + 1.0) {
        camPath(t, E.correct, E.cheer[0] + 1.0, V(1.95, 1.15, -0.95), V(1.85, 1.15, -0.88), V(0.8, 1.02, -0.15), V(0.8, 1.04, -0.12), 42, 40);
        P.dof = { focus: 1.25, aperture: 0.003, maxblur: 0.008 };
      } else {
        L = { x: -1.35, z: -2.2, rotY: 0.6, console: 'none', happy: 0.9, armR: ikArm('R', [-0.25, 0.45 + Math.sin(t * 9) * 0.04, 0.08]) };
        camPath(t, E.cheer[0] + 1.0, 39, V(0.05, 1.35, -3.05), V(0.05, 1.3, -2.85), V(0.1, 0.72, -0.25), V(0.1, 0.72, -0.25), 46, 44);
        P.dof = null;
      }
    }
  }

  // ================= plano 6: mesma compra =================
  if (t >= 39 && t < 44) {
    L = { x: 0.08, z: -2.55, rotY: 0, console: 'none' };
    const up = smooth(invLerp(E.coinsUp, E.coinsUp + 0.5, t));
    L.armL = ikArm('L', [lerp(0.2, 0.17, up), lerp(0.1, 0.3, up), lerp(0.05, 0.27, up)]);
    L.armR = ikArm('R', [lerp(-0.2, -0.17, up), lerp(0.1, 0.3, up), lerp(0.05, 0.27, up)]);
    L.headX = 0.15;
    L.happy = t > E.pop2 + 0.2 ? 0.9 : 0;
    L.eyeScale = t > E.pop2 && t < E.pop2 + 0.6 ? 1.3 : 1;
    loopy.setPose(L);
    loopy.root.updateMatrixWorld(true);
    loopy.arms.L.hand.getWorldPosition(tmp);
    greyCoin.visible = true;
    greyCoin.position.copy(tmp).add(V(0, 0.05, 0));
    greyCoin.rotation.set(0.2, 0, 0);
    loopy.arms.R.hand.getWorldPosition(tmp);
    crack.group.visible = t < E.pop2 + 0.6;
    crack.group.position.copy(tmp).add(V(0, 0.05, 0));
    crack.update(t, E.crack[0], E.crack[1], E.pop2);
    if (t > E.pop2) {
      const a = t - E.pop2;
      const k = clamp(a / 0.5);
      shibaWorld.group.visible = true;
      shibaWorld.group.position.copy(tmp).add(V(0, 0.08 + 0.3 * easeOutCubic(k), 0.06));
      shibaWorld.group.scale.setScalar(Math.max(0.001, easeOutBack(k) * 0.8));
      shibaWorld.group.rotation.y = Math.PI + 0.2;
      shibaWorld.update(a);
    }
    const off = smooth(invLerp(E.glassesOff, E.glassesOff + 0.6, t));
    F = { ...F, glassesOff: off, armR: [lerp(0.2, -1.2, off), 0.3], wide: 1 + off * 0.3, gasp: off };
    if (t < 42.0) {
      camPath(t, 39, 42, V(0.0, 1.08, -0.55), V(0.02, 1.08, -0.72), V(0.08, 0.84, -2.55), V(0.08, 0.9, -2.55), 36, 34);
      P.dof = { focus: 1.9, aperture: 0.0025, maxblur: 0.008 };
    } else {
      camPath(t, 42, 44, V(-0.42, 1.05, -2.25), V(-0.46, 1.02, -2.12), V(-0.82, 0.84, -1.05), V(-0.82, 0.84, -1.05), 36, 34);
      P.dof = { focus: 1.2, aperture: 0.003, maxblur: 0.008 };
    }
  }

  // ================= plano 7: lição de casa e o sinal =================
  if (t >= 48 && t < 56) {
    const tipW = tip ? C.boardToWorld(tip.x, tip.y) : null;
    const writing = t < tl.board.homework.write[1];
    L = { x: tipW ? tipW.x - 0.16 : 0.75, z: BOARD.z + 0.25, rotY: boardFace, console: 'none' };
    chalkStick.visible = writing;
    if (tipW && writing) L.armR = 'ik';
    else L.armR = ikArm('R', [-0.15, 0.1, 0.05]);
    L.headX = writing ? 0.1 : 0;
    // sinal e debandada
    const ring = t > E.bell && t < E.bell + 1.2;
    C.bell.position.x = 3.27 + (ring ? Math.sin(t * 120) * 0.004 : 0);
    const s0 = E.stampede[0];
    const door = V(DOOR.x + 0.6, 0, DOOR.z);
    const run = (who, base, delay, dur, hop = 0.05) => {
      const u = clamp((t - s0 - delay) / dur);
      if (u <= 0) return null;
      const path = [base, V(base.x, 0, base.z + 0.55), V(2.3, 0, 1.2), V(DOOR.x - 0.3, 0, DOOR.z), door];
      const f = u * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(f));
      const p = path[i].clone().lerp(path[i + 1], smooth(f - i));
      const dir = path[i + 1].clone().sub(path[i]);
      return { x: p.x, z: p.z, y: Math.abs(Math.sin(t * 16 + delay * 5)) * hop, rotY: Math.atan2(dir.x, dir.z), done: u >= 1 };
    };
    const fr = run('frog', SEAT.frog, 0.0, 1.6, 0.12);
    const sr = run('shiba', SEAT.shiba, 0.15, 1.5, 0.06);
    const cr = run('cat', SEAT.cat, 0.3, 1.55, 0.05);
    if (fr) F = { ...F, x: fr.x, z: fr.z, y: fr.y, rotY: fr.rotY, stand: 1, armL: [-0.8, 0.4], armR: [0.6, 0.4], lean: 0.25 };
    if (sr) Sh = { ...Sh, x: sr.x, z: sr.z, y: sr.y, rotY: sr.rotY, lean: 0.3, wagAmt: 1 };
    if (cr) Ct = { ...Ct, x: cr.x, z: cr.z, y: cr.y, rotY: cr.rotY, lean: 0.25, eyes: 0.8 };
    for (const [o, r] of [
      [F, fr],
      [Sh, sr],
      [Ct, cr],
    ])
      if (r && r.done) o.hidden = true;
    // a baleia entala na porta e passa com um "pop"
    const wu = clamp((t - s0 - 0.5) / 1.4);
    if (wu > 0) {
      const p0 = SEAT.whale.clone().setY(0);
      const p1 = V(DOOR.x - 0.62, 0, DOOR.z);
      let p = p0.clone().lerp(p1, smooth(wu));
      let squeezeX = 0;
      let sq = 0;
      if (t > E.stuck[0] && t < E.popThrough) {
        p = p1.clone().add(V(Math.sin(t * 9) * 0.03, 0, 0));
        squeezeX = 0.15 + Math.sin(t * 14) * 0.03;
        sq = -0.25;
      } else if (t >= E.popThrough) {
        const a = t - E.popThrough;
        p = p1.clone().add(V(a * 4, 0, 0));
        squeezeX = Math.max(0, 0.15 - a * 0.6);
      }
      Wh = { ...Wh, x: p.x, z: p.z, y: 0.02 + Math.abs(Math.sin(t * 10)) * 0.03, rotY: Math.PI / 2, squeezeX, squash: sq, eyes: 1, wide: t > E.stuck[0] && t < E.popThrough ? 1.3 : 1, star: true, starScale: 1 };
      if (t > E.popThrough + 0.4) Wh.hidden = true;
    } else Wh.star = true;
    if (t > E.wave) {
      L = { x: 0.55, z: -2.65, rotY: lerp(1.25, 0.2, smoother(invLerp(E.turnCam, E.turnCam + 0.4, t))), console: 'none' };
      const waving = t < E.turnCam;
      L.armR = waving ? ikArm('R', [-0.26, 0.48 + Math.sin(t * 14) * 0.04, 0.06]) : ikArm('R', [-0.2, 0.12, 0.05]);
      const shrug = smooth(invLerp(E.shrug[0], E.shrug[0] + 0.25, t)) * (1 - smooth(invLerp(E.shrug[1] - 0.1, E.shrug[1] + 0.3, t)) * 0.3);
      if (!waving) {
        L.armR = ikArm('R', [lerp(-0.2, -0.27, shrug), lerp(0.12, 0.22, shrug), lerp(0.05, 0.12, shrug)]);
        L.armL = ikArm('L', [lerp(0.2, 0.27, shrug), lerp(0.12, 0.22, shrug), lerp(0.05, 0.12, shrug)]);
        L.headZ = shrug * 0.15;
        L.bob = shrug * 0.02;
      }
      L.happy = 0.9;
    }
    if (t < E.bell - 0.1) {
      camPath(t, 48, E.bell - 0.1, V(-1.55, 1.1, -2.3), V(-1.4, 1.05, -2.45), V(0.3, 0.72, -3.9), V(0.3, 0.72, -3.9), 42, 40);
      P.dof = null;
    } else if (t < E.stuck[0]) {
      camPath(t, E.bell - 0.1, E.stuck[0], V(-2.65, 1.75, -3.35), V(-2.5, 1.7, -3.2), V(1.2, 0.6, 0.6), V(1.6, 0.6, 0.9), 50, 48);
      P.dof = null;
    } else if (t < E.wave) {
      camPath(t, E.stuck[0], E.wave, V(1.75, 1.15, 0.0), V(1.8, 1.1, 0.1), V(3.2, 0.75, 1.55), V(3.2, 0.75, 1.55), 40, 38);
      P.dof = null;
    } else {
      camPath(t, E.wave, 56, V(0.78, 0.98, -1.3), V(0.74, 0.96, -1.42), V(0.52, 0.78, -2.65), V(0.52, 0.8, -2.65), 38, 36);
      P.dof = { focus: 1.3, aperture: 0.003, maxblur: 0.008 };
    }
  }

  // ================= plano 8: fim =================
  let endK = 0;
  if (t >= 56) {
    L = { x: 0, z: 5, rotY: 0, console: 'none' };
    loopy.root.visible = false;
    for (const o of [F, Sh, Ct, Wh]) o.hidden = true;
    camPath(t, 56, 58.6, V(0.0, 1.55, 2.2), V(0.0, 1.06, -2.35), V(0, 1.1, -3.9), V(0, 1.02, -3.96), 42, 40, easeInOutSine);
    P.dof = null;
    endK = smooth(invLerp(57.9, 58.6, t));
  } else loopy.root.visible = true;

  // ---------- aplica poses ----------
  C.boardMat.needsUpdate = false;
  C.bench.visible = onBench || t >= 56;
  if (L.armR === 'ik' || L.armL === 'ik') {
    const tw = (t < 6 ? L._tipW : null) || (tip ? C.boardToWorld(tip.x, tip.y) : null);
    const armSave = L.armR;
    L.armR = { sx: 0, sz: 0, ex: 0 };
    loopy.setPose(L);
    loopy.root.position.y = (L.y ?? 0) + (L.hop ?? 0);
    loopy.root.updateMatrixWorld(true);
    if (armSave === 'ik' && tw) {
      const local = loopy.hips.worldToLocal(tw.clone().add(V(0, 0.0, 0.06)));
      L.armR = ikArm('R', [local.x, local.y, local.z]);
    }
  }
  loopy.setPose({ ...L, y: undefined });
  loopy.root.position.y = (L.y ?? 0) + (L.hop ?? 0);
  loopy.root.updateMatrixWorld(true);
  if (goldCoin.visible) {
    loopy.arms.L.hand.getWorldPosition(goldCoin.position);
    goldCoin.position.y += 0.055;
    goldCoin.rotation.set(Math.PI / 2 - 0.25, 0.4, 0);
  }
  const apply = (s, base, o) => {
    s.root.visible = !o.hidden;
    s.setPose({ x: o.x ?? base.x, y: o.y ?? base.y, z: o.z ?? base.z, rotY: o.rotY ?? Math.PI, ...o, x: o.x ?? base.x, y: o.y ?? base.y, z: o.z ?? base.z });
  };
  apply(frog, SEAT.frog, F);
  apply(shiba, SEAT.shiba, Sh);
  apply(cat, SEAT.cat, Ct);
  apply(whale, SEAT.whale, Wh);

  P.grade = { sat: 1.07, contrast: 1.04, tint: [1.03, 1.0, 0.96], vignette: 0.28, grain: 0.025, aberr: 0.0008 };
  P.bloom = { strength: 0.32, radius: 0.5, threshold: 1.0 };
  post.apply(P);
  post.composer.render();
  return overlay.draw(t, renderer.domElement, { endK });
}

window.renderFrame = async (t, mime = 'image/jpeg', q = 0.95) => frame(t).toDataURL(mime, q);
window.__ready = true;
