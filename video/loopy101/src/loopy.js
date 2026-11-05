import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ORANGE, CYAN, infinityTube, lerp, clamp } from './util.js';

// Loopy: personagem pequeno de capuz preto. O capuz forma um laço de ∞ atrás da cabeça,
// olhos redondos cor de ciano, ∞ laranja no peito, tênis preto e branco com cadarço de ∞
// laranja e um console portátil de tela ciano. Olhando para +Z, pés em y = 0.

function fabric(color = 0x17181c) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.82,
    metalness: 0.0,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0x737b88),
    clearcoat: 0.0,
  });
}

function consoleScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // desenho redesenhado a cada quadro (blocos abstratos, sem texto legível)
  tex.userData.draw = (phase, typed) => {
    g.fillStyle = '#062a33';
    g.fillRect(0, 0, 256, 160);
    const grd = g.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, 'rgba(34,211,238,0.35)');
    grd.addColorStop(1, 'rgba(34,211,238,0.08)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 160);
    // "campo de digitação": blocos que crescem
    g.fillStyle = 'rgba(160,245,255,0.95)';
    const n = Math.floor(typed * 22);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 11);
      const col = i % 11;
      const w = 10 + ((i * 37) % 9);
      g.fillRect(22 + col * 20, 50 + row * 26, w, 12);
    }
    // cursor piscando
    if (Math.sin(phase * 9) > 0) {
      const row = Math.floor(n / 11);
      const col = n % 11;
      g.fillRect(22 + col * 20, 50 + row * 26, 4, 14);
    }
    // moldura e ∞ pequeno no canto (forma, não texto)
    g.strokeStyle = 'rgba(160,245,255,0.6)';
    g.lineWidth = 3;
    g.strokeRect(12, 36, 232, 70);
    g.fillStyle = 'rgba(255,122,46,0.95)';
    g.beginPath();
    g.arc(30, 18, 6, 0, Math.PI * 2);
    g.arc(44, 18, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(160,245,255,0.5)';
    g.fillRect(150, 124, 90, 14);
    tex.needsUpdate = true;
  };
  tex.userData.draw(0, 0);
  return tex;
}

export function buildLoopy() {
  const root = new THREE.Group();
  root.name = 'Loopy';
  const black = fabric(0x15161a);
  const blackRib = fabric(0x24252b);
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.2 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(1.9) });
  const orangeGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(1.25) });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.55 });
  const glove = new THREE.MeshPhysicalMaterial({ color: 0x1f2026, roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0x667080) });

  const all = [];
  const add = (parent, mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    all.push(mesh);
    return mesh;
  };

  // ---- pernas e tênis ----
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.085, 0.3, 0);
    root.add(leg);
    add(leg, new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.12, 6, 14), black)).position.y = -0.11;
    const shoe = new THREE.Group();
    shoe.position.y = -0.3;
    leg.add(shoe);
    const sole = add(shoe, new THREE.Mesh(new RoundedBoxGeometry(0.135, 0.04, 0.215, 3, 0.018), white));
    sole.position.set(0, 0.02, 0.025);
    const upper = add(shoe, new THREE.Mesh(new RoundedBoxGeometry(0.125, 0.075, 0.18, 3, 0.035), black));
    upper.position.set(0, 0.07, 0.015);
    const toe = add(shoe, new THREE.Mesh(new RoundedBoxGeometry(0.128, 0.04, 0.06, 3, 0.018), white));
    toe.position.set(0, 0.05, 0.1);
    const heelStripe = add(shoe, new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.02, 0.07, 2, 0.008), white));
    heelStripe.position.set(0, 0.09, -0.06);
    const lace = add(shoe, new THREE.Mesh(infinityTube(0.075, 0.0075, 80, 6, 0.004), orangeGlow));
    lace.position.set(0, 0.108, 0.045);
    lace.rotation.x = -Math.PI / 2 + 0.35;
    legs.push(leg);
  }

  // ---- quadril / tronco ----
  const hips = new THREE.Group();
  hips.position.y = 0.3;
  root.add(hips);
  const prof = [];
  const P = [
    [0.0, -0.05],
    [0.175, -0.05],
    [0.205, -0.02],
    [0.208, 0.06],
    [0.198, 0.16],
    [0.18, 0.26],
    [0.15, 0.34],
    [0.09, 0.4],
    [0.0, 0.42],
  ];
  for (const [r, y] of P) prof.push(new THREE.Vector2(r, y));
  const torsoGeo = new THREE.LatheGeometry(prof, 40);
  const torso = add(hips, new THREE.Mesh(torsoGeo, black));
  torso.scale.set(1, 1, 0.86);
  const hem = add(hips, new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 40), blackRib));
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.86, 1);
  hem.position.y = -0.035;
  // bolso canguru
  const pocket = add(hips, new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.08, 0.02, 2, 0.01), blackRib));
  pocket.position.set(0, 0.05, 0.172);
  pocket.rotation.x = -0.12;
  // emblema ∞ no peito
  const emblemBack = add(hips, new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), new THREE.MeshBasicMaterial({ color: 0x0b0b0e })));
  emblemBack.scale.set(1.15, 0.55, 1);
  emblemBack.position.set(0, 0.205, 0.168);
  emblemBack.rotation.x = -0.18;
  const emblem = add(hips, new THREE.Mesh(infinityTube(0.17, 0.013, 120, 8, 0.006), orangeGlow));
  emblem.position.set(0, 0.205, 0.176);
  emblem.rotation.x = -0.18;

  // ---- cabeça ----
  const head = new THREE.Group();
  head.position.y = 0.4;
  hips.add(head);
  const hood = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.27, 48, 32), black));
  hood.position.y = 0.2;
  hood.scale.set(1.0, 0.94, 0.95);
  const rim = add(head, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.042, 14, 56), blackRib));
  rim.position.set(0, 0.19, 0.205);
  rim.scale.set(1, 0.93, 1);
  const face = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.205, 40, 24), faceMat));
  face.position.set(0, 0.19, 0.145);
  face.scale.set(1, 0.92, 0.5);
  // laço de ∞ do capuz atrás da cabeça
  // a ponta do capuz cai nas costas e dá a volta formando um ∞
  const loop = add(head, new THREE.Mesh(infinityTube(0.5, 0.054, 200, 14, 0.04), black));
  loop.position.set(0, 0.0, -0.24);
  loop.rotation.x = 0.32;
  const tail = add(head, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 6, 14), black));
  tail.position.set(0, 0.1, -0.22);
  tail.rotation.x = 0.5;
  // nó do laço (onde o capuz se dobra)
  const knot = add(head, new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), black));
  knot.position.set(0, 0.0, -0.25);
  knot.scale.set(1.1, 0.9, 0.9);

  // olhos
  const eyes = new THREE.Group();
  eyes.position.set(0, 0.2, 0.0);
  head.add(eyes);
  const eyeRound = [];
  const eyeHappy = [];
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.047, 24, 16), eyeMat);
    e.position.set(side * 0.078, 0.0, 0.232);
    e.scale.set(1, 1.18, 0.45);
    eyes.add(e);
    eyeRound.push(e);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.012, 8, 24, Math.PI), eyeMat);
    h.position.set(side * 0.078, -0.012, 0.236);
    h.scale.set(1, 1.1, 0.5);
    h.visible = false;
    eyes.add(h);
    eyeHappy.push(h);
  }
  // reflexo branco nos olhos (dá vida)
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const e of eyeRound) {
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), glintMat);
    gl.position.set(0.015, 0.02, 0.04);
    e.add(gl);
  }
  // luz própria dos olhos (ilumina de leve o rosto e o que estiver na frente)
  const eyeLight = new THREE.PointLight(CYAN, 0.12, 1.2, 2);
  eyeLight.position.set(0, 0.2, 0.35);
  head.add(eyeLight);

  // ---- braços ----
  const arms = {};
  for (const [name, side] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.155, 0.31, 0);
    hips.add(shoulder);
    const upper = add(shoulder, new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 6, 12), black));
    upper.position.y = -0.075;
    const elbow = new THREE.Group();
    elbow.position.y = -0.15;
    shoulder.add(elbow);
    const fore = add(elbow, new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.08, 6, 12), black));
    fore.position.y = -0.06;
    const cuff = add(elbow, new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), blackRib));
    cuff.position.y = -0.11;
    cuff.rotation.x = Math.PI / 2;
    const hand = add(elbow, new THREE.Mesh(new THREE.SphereGeometry(0.056, 20, 14), glove));
    hand.position.y = -0.15;
    hand.scale.set(1, 0.9, 1);
    arms[name] = { shoulder, elbow, hand, side };
  }

  // ---- console ----
  const consoleG = new THREE.Group();
  hips.add(consoleG);
  const body = add(consoleG, new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.135, 0.036, 4, 0.022), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.45, metalness: 0.1 })));
  const screenTex = consoleScreenTexture();
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.118, 0.074), screenMat);
  screen.position.set(0, 0.006, 0.0185);
  consoleG.add(screen);
  const btnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(1.8) });
  for (const [x, y] of [
    [0.095, 0.012],
    [0.078, -0.01],
  ]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 14), btnMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, y, 0.02);
    consoleG.add(b);
  }
  const dpadMat = new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.5 });
  const d1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.009, 0.006), dpadMat);
  d1.position.set(-0.088, 0.0, 0.02);
  const d2 = d1.clone();
  d2.rotation.z = Math.PI / 2;
  consoleG.add(d1, d2);
  const screenLight = new THREE.PointLight(CYAN, 0.0, 0.9, 2);
  screenLight.position.set(0, 0.02, 0.12);
  consoleG.add(screenLight);

  // ---- props da escolha (moeda cinza e ∞ laranja) ----
  const props = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.013, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.55, metalness: 0.6 })
  );
  const coinRim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.005, 8, 40), new THREE.MeshStandardMaterial({ color: 0x6f747b, roughness: 0.5, metalness: 0.6 }));
  coinRim.rotation.x = Math.PI / 2;
  coin.add(coinRim);
  props.add(coin);
  const infMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(1.4), transparent: true, opacity: 0.92 });
  const inf = new THREE.Mesh(infinityTube(0.15, 0.016, 140, 10, 0.012), infMat);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.32).multiplyScalar(3.0) });
  const core = new THREE.Mesh(infinityTube(0.15, 0.0065, 140, 6, 0.012), coreMat);
  inf.add(core);
  props.add(inf);
  const infLight = new THREE.PointLight(ORANGE, 0.0, 1.6, 2);
  inf.add(infLight);
  props.visible = false;

  const state = {
    root,
    hips,
    head,
    eyes,
    arms,
    legs,
    consoleG,
    screenTex,
    screenMat,
    screenLight,
    eyeLight,
    eyeMat,
    props,
    coin,
    inf,
    infMat,
    infLight,
    all,
  };

  const tmp = new THREE.Vector3();
  state.setPose = (p = {}) => {
    const d = (k, v) => (p[k] === undefined ? v : p[k]);
    root.position.set(d('x', 0), d('hop', 0), d('z', 0));
    root.rotation.y = d('rotY', 0);
    hips.position.y = 0.3 + d('bob', 0);
    hips.rotation.x = d('lean', 0);
    hips.rotation.y = d('twist', 0);
    head.rotation.set(d('headX', 0), d('headY', 0), d('headZ', 0));
    const happy = clamp(d('happy', 0));
    const blink = clamp(d('blink', 0));
    for (const e of eyeRound) {
      e.scale.y = 1.18 * Math.max(0.06, (1 - blink) * (1 - happy));
      e.visible = happy < 0.95;
    }
    for (const h of eyeHappy) {
      h.visible = happy > 0.05;
      h.scale.set(1, 1.1 * happy, 0.5);
    }
    eyeMat.color.set(CYAN).multiplyScalar(d('eyeGlow', 1.9));
    eyeLight.intensity = d('eyeLight', 0.0);
    for (const k of ['L', 'R']) {
      const a = arms[k];
      const q = p['arm' + k] || {};
      a.shoulder.rotation.set(q.sx ?? 0.05, q.sy ?? 0, (q.sz ?? 0.12) * a.side);
      a.elbow.rotation.set(q.ex ?? -0.15, 0, 0);
    }
    legs[0].rotation.x = d('legR', 0);
    legs[1].rotation.x = d('legL', 0);
    // console
    const cv = d('console', 'hand');
    consoleG.visible = cv !== 'none';
    eyes.scale.setScalar(d('eyeScale', 1));
    if (cv === 'handR') {
      if (consoleG.parent !== arms.R.elbow) arms.R.elbow.add(consoleG);
      const cp = p.consolePos ?? [0.0, -0.2, 0.04];
      const cr = p.consoleRot ?? [1.3, 0, 0];
      consoleG.position.set(...cp);
      consoleG.rotation.set(...cr);
    } else if (consoleG.parent !== hips) hips.add(consoleG);
    if (cv === 'hand') {
      consoleG.position.set(0, 0.1, 0.25);
      consoleG.rotation.set(d('consoleTilt', -0.95), 0, 0);
    } else if (cv === 'side') {
      consoleG.position.set(-0.17, -0.05, 0.12);
      consoleG.rotation.set(-0.2, 0.9, -1.3);
    }
    screenLight.intensity = d('screenLight', 0.0);
    screenMat.color.setScalar(d('screenGlow', 1.4));
    // props
    props.visible = !!p.props;
    if (p.props) {
      root.updateMatrixWorld(true);
      arms.L.hand.getWorldPosition(tmp);
      coin.position.copy(tmp).add(new THREE.Vector3(0, 0.052, 0.0));
      coin.rotation.set(0.35, 0, 0.12);
      arms.R.hand.getWorldPosition(tmp);
      inf.position.copy(tmp).add(new THREE.Vector3(0, 0.11 + (p.infFloat ?? 0), 0));
      inf.rotation.set(0, (p.infSpin ?? 0) * 0.35, 0);
      const pulse = p.infPulse ?? 1;
      inf.scale.setScalar(pulse);
      coreMat.color.setRGB(1.0, 0.62, 0.32).multiplyScalar(1.6 + 2.4 * (p.infGlow ?? 0.5));
      infLight.intensity = 0.25 + 0.55 * (p.infGlow ?? 0.5);
    }
  };

  state.drawScreen = (phase, typed) => screenTex.userData.draw(phase, typed);
  state.setPose({});
  return state;
}

// pequenos helpers de animação para o Loopy
export function breathe(t, amt = 1) {
  return Math.sin(t * 2.1) * 0.006 * amt;
}
export function blinkAt(t, times) {
  let b = 0;
  for (const bt of times) {
    const x = (t - bt) / 0.16;
    if (x > 0 && x < 1) b = Math.max(b, Math.sin(x * Math.PI));
  }
  return b;
}
export const mix = lerp;

// ---------- IK simples dos braços ----------
// Mesma cinemática do rig: ombro (Euler XYZ) -> braço 0.15 -> cotovelo (X) -> antebraço 0.15.
const SH = { L: [0.155, 0.31, 0], R: [-0.155, 0.31, 0] };
function rx(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rz(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}
export function armFK(side, sx, szActual, ex) {
  const fore = rx([0, -0.15, 0], ex);
  let v = [fore[0], fore[1] - 0.15, fore[2]];
  v = rz(v, szActual);
  v = rx(v, sx);
  const s = SH[side];
  return [s[0] + v[0], s[1] + v[1], s[2] + v[2]];
}
// alvo em coordenadas do quadril do Loopy; devolve {sx, sz, ex} no formato do setPose
export function ikArm(side, target, guess = {}) {
  const sgn = side === 'L' ? 1 : -1;
  let p = [guess.sx ?? -0.6, (guess.sz ?? 0.15) * sgn, guess.ex ?? -0.8];
  const err = (q) => {
    const h = armFK(side, q[0], q[1], q[2]);
    let e = (h[0] - target[0]) ** 2 + (h[1] - target[1]) ** 2 + (h[2] - target[2]) ** 2;
    if (q[2] > 0) e += q[2] * q[2] * 0.05; // cotovelo não dobra ao contrário
    if (q[1] * sgn < -0.15) e += (q[1] * sgn + 0.15) ** 2 * 0.05; // não cruza o corpo
    return e;
  };
  let best = err(p);
  for (const step of [0.4, 0.15, 0.05, 0.015, 0.005]) {
    for (let it = 0; it < 40; it++) {
      let improved = false;
      for (let k = 0; k < 3; k++)
        for (const d of [step, -step]) {
          const q = p.slice();
          q[k] += d;
          const e = err(q);
          if (e < best) {
            best = e;
            p = q;
            improved = true;
          }
        }
      if (!improved) break;
    }
  }
  return { sx: p[0], sz: p[1] * sgn, ex: p[2] };
}
