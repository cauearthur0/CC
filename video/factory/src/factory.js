import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeColorize } from './shaders.js';
import { workerGeometries, buildSupervisor, colored, at } from './people.js';
import { mulberry32, clamp, smooth, lerp } from './util.js';

// O salão da COIN FACTORY: esteiras ao longo de X, prensas que batem no tempo da música,
// operários parados, a placa, caixotes, a caixa de moedas e o carimbo EMPTY.

export const BELT_Z = [0, -3, -6, -9, -12, -15, -18, -21];
export const BELT_TOP = 0.88;
export const SUP = { x: -1.5, z: 0.85 };
export const BOX = { x: -0.62, z: 1.18, top: 0.78 };
export const CRATES = { x: 3.35, z: 1.85 };
export const HIDE = { x: 3.95, z: 2.62 };
export const STAND = { x: 2.15, z: 2.65 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function stampTexture() {
  // carimbo de borracha: letras vermelhas com moldura e falhas de tinta
  return canvasTex(512, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#c8202a';
    g.fillStyle = '#c8202a';
    g.lineWidth = 12;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.font = '900 128px "Inter", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '10px';
    g.fillText('EMPTY', w / 2 + 5, h / 2 + 6);
    // falhas
    const r = mulberry32(5);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.25 + r() * 0.6;
      g.beginPath();
      g.arc(r() * w, r() * h, 0.6 + r() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  });
}

function signTexture() {
  return canvasTex(1400, 280, (g, w, h) => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0392b';
    g.fillRect(0, h - 34, w, 34);
    g.fillRect(0, 0, w, 12);
    g.fillStyle = '#1d1f24';
    g.font = '800 168px "Inter", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '18px';
    g.fillText('COIN FACTORY', w / 2 + 9, h / 2 - 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const x of [24, w - 24]) for (const y of [36, h - 58]) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function beltTexture() {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#2b2d31';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#34373c';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 6, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60 / 0.6, 1);
  return t;
}

function floorTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b2a6';
    g.fillRect(0, 0, w, h);
    const r = mulberry32(3);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.04})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
    g.strokeStyle = 'rgba(60,55,50,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 50);
  return t;
}

function crateTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b07a43';
    g.fillRect(0, 0, w, h);
    const r = mulberry32(9);
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.08})`;
      g.fillRect(0, y, w, 3);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(80,45,15,${0.05 + r() * 0.1})`;
        g.fillRect(r() * w, y + r() * 40, 20 + r() * 60, 1.5);
      }
    }
    g.fillStyle = '#8a5a2c';
    g.fillRect(0, 0, w, 18);
    g.fillRect(0, h - 18, w, 18);
    g.fillRect(0, 0, 18, h);
    g.fillRect(w - 18, 0, 18, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-w * 0.7, -9, w * 1.4, 18);
    g.restore();
  });
}

function cardboardTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c69c6d';
    g.fillRect(0, 0, w, h);
    const r = mulberry32(12);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90,60,30,${0.04 + r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 14, 1);
    }
  });
}

function hazardTexture() {
  const t = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#f2c230';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d1f';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 16, h);
      g.lineTo(x + 16 + h, 0);
      g.lineTo(x + h, 0);
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(60 / 1.2, 1);
  return t;
}

function wallTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8d97a3';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 21) {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, 0, 4, h);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(x + 12, 0, 5, h);
    }
    g.strokeStyle = 'rgba(30,35,40,0.6)';
    g.lineWidth = 6;
    g.strokeRect(0, 0, w, h);
  });
}

export function buildFactory(renderer) {
  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x8e98a3);
  scene.background = FOG.clone();
  scene.fog = new THREE.FogExp2(FOG.clone(), 0.045);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const col = makeColorize();
  col.uniforms.uColC.value = new THREE.Vector3(0, -100, 0);
  const P = (m, s) => col.patch(m, s);

  scene.add(new THREE.HemisphereLight(0xe2e8ef, 0x4b4f56, 1.0));
  const key = new THREE.DirectionalLight(0xfff2e2, 1.9);
  key.position.set(-3, 9, 6);
  key.target.position.set(1, 0, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 25 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  scene.add(new THREE.AmbientLight(0x9aa6b4, 0.15));

  // chão
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 100), P(new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.85 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 4.5 - 50;
  floor.receiveShadow = true;
  scene.add(floor);
  // faixas amarelas do corredor
  const lineMat = P(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 }));
  for (const z of [3.6, 1.32, -1.32]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.1), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.003, z);
    l.receiveShadow = true;
    scene.add(l);
  }

  // ---- esteiras ----
  const L = 60;
  const frameParts = [];
  for (const z of BELT_Z) {
    frameParts.push(colored(at(new THREE.BoxGeometry(L, 0.14, 0.82), 0, BELT_TOP - 0.1, z), 0x4f6f8f));
    for (let x = -L / 2; x <= L / 2; x += 2) {
      for (const s of [-1, 1]) frameParts.push(colored(at(new THREE.BoxGeometry(0.07, BELT_TOP - 0.15, 0.07), x, (BELT_TOP - 0.15) / 2, z + s * 0.34), 0x3d566f));
    }
  }
  const frames = new THREE.Mesh(mergeGeometries(frameParts), P(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 })));
  frames.receiveShadow = true;
  frames.castShadow = true;
  scene.add(frames);
  const beltTex = beltTexture();
  const hazTex = hazardTexture();
  const beltGeo = mergeGeometries(BELT_Z.map((z) => at(new THREE.BoxGeometry(L, 0.03, 0.7), 0, BELT_TOP - 0.015, z)));
  const belts = new THREE.Mesh(beltGeo, P(new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 })));
  belts.receiveShadow = true;
  scene.add(belts);
  const railGeo = mergeGeometries(BELT_Z.flatMap((z) => [-1, 1].map((s) => at(new THREE.BoxGeometry(L, 0.07, 0.03), 0, BELT_TOP + 0.02, z + s * 0.39))));
  const rails = new THREE.Mesh(railGeo, P(new THREE.MeshStandardMaterial({ map: hazTex, roughness: 0.6 })));
  scene.add(rails);

  // moedas na esteira
  const coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.014, 18);
  const coinMat = P(new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.92, roughness: 0.28 }), 0.42);
  const SPAN = 32;
  const lanes = [-0.2, 0, 0.2];
  const perBelt = Math.floor(SPAN / 0.26) * lanes.length;
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, perBelt * BELT_Z.length);
  coins.castShadow = true;
  coins.receiveShadow = true;
  scene.add(coins);
  const coinSeed = [];
  const rnd = mulberry32(21);
  BELT_Z.forEach((z, bi) => {
    for (let i = 0; i < perBelt; i++) coinSeed.push({ z: z + lanes[i % 3] + (rnd() - 0.5) * 0.03, x0: Math.floor(i / 3) * 0.26 + (rnd() - 0.5) * 0.04 + bi * 0.09, r: rnd() * 6 });
  });

  // prensas
  const pressX = [];
  for (let x = -24; x <= 24; x += 4) pressX.push(x);
  const housing = [];
  BELT_Z.forEach((z) =>
    pressX.forEach((x) => {
      housing.push(colored(at(new THREE.BoxGeometry(0.9, 0.5, 0.95), x, 2.25, z), 0xe58a2b));
      housing.push(colored(at(new THREE.BoxGeometry(0.2, 0.25, 0.2), x, 1.9, z), 0x55595f));
      for (const s of [-1, 1]) housing.push(colored(at(new THREE.BoxGeometry(0.12, 2.5, 0.12), x + s * 0.5, 1.25, z - 0.52), 0x3d566f));
    })
  );
  const presses = new THREE.Mesh(mergeGeometries(housing), P(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })));
  presses.castShadow = true;
  scene.add(presses);
  const pistonGeo = mergeGeometries([colored(at(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 12), 0, 0.45, 0), 0xb8bec6), colored(at(new THREE.BoxGeometry(0.62, 0.14, 0.62), 0, 0, 0), 0x6b7078)]);
  const pistons = new THREE.InstancedMesh(pistonGeo, P(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.3 })), BELT_Z.length * pressX.length);
  pistons.castShadow = true;
  scene.add(pistons);

  // ---- operários ----
  const wg = workerGeometries();
  const workers = [];
  BELT_Z.forEach((z, bi) => {
    for (const side of [1, -1]) {
      for (let x = -22.85; x < 22; x += 1.7) {
        const wz = z + side * 0.88;
        if (bi === 0 && side === 1 && ((x > -2.9 && x < 0.3) || (x > 3.2 && x < 6))) continue;
        if (Math.abs(x - Math.round(x / 4) * 4) < 0.5) continue; // não fica embaixo da prensa
        workers.push({ x: x + (bi % 2) * 0.4, z: wz, yaw: side === 1 ? Math.PI : 0, phase: rnd() * 6 });
      }
    }
  });
  const wmat = P(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  const wBody = new THREE.InstancedMesh(wg.body, wmat, workers.length);
  const wHead = new THREE.InstancedMesh(wg.head, wmat, workers.length);
  wBody.castShadow = wHead.castShadow = true;
  wBody.receiveShadow = wHead.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  workers.forEach((w, i) => {
    q.setFromAxisAngle(up, w.yaw);
    wBody.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, 0, w.z), q, one));
    wHead.setMatrixAt(i, m4.compose(new THREE.Vector3(w.x, 0, w.z), q, one));
  });
  scene.add(wBody, wHead);

  // ---- placa, teto, pilares, luminárias ----
  const sign = new THREE.Group();
  const signMesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.44, 0.08), [
    P(new THREE.MeshStandardMaterial({ color: 0x2b2f36 })),
    P(new THREE.MeshStandardMaterial({ color: 0x2b2f36 })),
    P(new THREE.MeshStandardMaterial({ color: 0x2b2f36 })),
    P(new THREE.MeshStandardMaterial({ color: 0x2b2f36 })),
    P(new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 })),
    P(new THREE.MeshStandardMaterial({ color: 0x2b2f36 })),
  ]);
  sign.add(signMesh);
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3, 6), P(new THREE.MeshStandardMaterial({ color: 0x222222 })));
    c.position.set(s * 3.2, 2.2, 0);
    sign.add(c);
  }
  sign.position.set(0.4, 4.3, -1.0);
  scene.add(sign);
  const ceilParts = [];
  for (let z = 6; z >= -30; z -= 3) ceilParts.push(colored(at(new THREE.BoxGeometry(80, 0.25, 0.14), 0, 7.4, z), 0x4a525c));
  for (let x = -32; x <= 32; x += 8) ceilParts.push(colored(at(new THREE.BoxGeometry(0.14, 0.4, 40), x, 7.2, -12), 0x4a525c));
  for (let x = -24; x <= 24; x += 8)
    for (const z of [-1.5, -7.5, -13.5, -19.5]) ceilParts.push(colored(at(new THREE.BoxGeometry(0.34, 7.4, 0.34), x, 3.7, z), 0x5c7088));
  const ceil = new THREE.Mesh(mergeGeometries(ceilParts), P(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 })));
  scene.add(ceil);
  const lampParts = [];
  const bulbParts = [];
  for (let x = -24; x <= 24; x += 4)
    for (const z of [1.5, -4.5, -10.5, -16.5]) {
      if (z === 1.5 && x > -5 && x < 6) continue; // não cruza a placa
      lampParts.push(colored(at(new THREE.ConeGeometry(0.42, 0.32, 16, 1, true), x, 5.9, z), 0x3a4048));
      lampParts.push(colored(at(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), x, 6.7, z), 0x222222));
      bulbParts.push(at(new THREE.CircleGeometry(0.3, 16).rotateX(Math.PI / 2), x, 5.76, z));
    }
  const lamps = new THREE.Mesh(mergeGeometries(lampParts), P(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const bulbs = new THREE.Mesh(mergeGeometries(bulbParts), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.88).multiplyScalar(2.2) }));
  scene.add(lamps, bulbs);

  // ---- caixotes ----
  const crateMat = P(new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 }));
  const crateGeo = new THREE.BoxGeometry(0.78, 0.78, 0.78);
  for (const [x, y, z, r] of [
    [CRATES.x, 0.39, CRATES.z, 0.05],
    [CRATES.x + 0.05, 1.17, CRATES.z - 0.02, -0.12],
    [CRATES.x + 0.82, 0.39, CRATES.z - 0.12, 0.2],
  ]) {
    const c = new THREE.Mesh(crateGeo, crateMat);
    c.position.set(x, y, z);
    c.rotation.y = r;
    c.castShadow = c.receiveShadow = true;
    scene.add(c);
  }

  // ---- mesa, caixa de moedas e carimbo ----
  const tableMat = P(new THREE.MeshStandardMaterial({ color: 0x6b7a8a, roughness: 0.5, metalness: 0.4 }));
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), tableMat);
  top.position.y = 0.6;
  table.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), tableMat);
    l.position.set(sx * 0.4, 0.3, sz * 0.26);
    table.add(l);
  }
  table.position.set(BOX.x + 0.1, 0, BOX.z);
  table.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  scene.add(table);
  const cardMat = P(new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  const makeBox = (w, h, d, open = true) => {
    const g = new THREE.Group();
    const parts = open
      ? [
          [w, 0.01, d, 0, 0.005, 0],
          [w, h, 0.01, 0, h / 2, d / 2],
          [w, h, 0.01, 0, h / 2, -d / 2],
          [0.01, h, d, w / 2, h / 2, 0],
          [0.01, h, d, -w / 2, h / 2, 0],
        ]
      : [[w, h, d, 0, h / 2, 0]];
    for (const [a, b, c, x, y, z] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), cardMat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    if (open)
      for (const [x, z, ry, rz] of [
        [0, d / 2 + 0.07, 0, 0],
        [0, -d / 2 - 0.07, 0, 0],
      ]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, 0.15), cardMat);
        f.position.set(x, h + 0.02, z);
        f.rotation.x = z > 0 ? 0.5 : -0.5;
        g.add(f);
      }
    return g;
  };
  const box = makeBox(0.5, 0.34, 0.4);
  box.position.set(BOX.x, 0.62, BOX.z);
  scene.add(box);
  const boxCoins = new THREE.InstancedMesh(coinGeo, coinMat, 40);
  const r2 = mulberry32(31);
  for (let i = 0; i < 40; i++) {
    const e = new THREE.Euler(r2() * 0.8 - 0.4, r2() * 6, r2() * 0.8 - 0.4);
    boxCoins.setMatrixAt(i, m4.compose(new THREE.Vector3(BOX.x + (r2() - 0.5) * 0.4, 0.62 + 0.27 + r2() * 0.05, BOX.z + (r2() - 0.5) * 0.3), new THREE.Quaternion().setFromEuler(e), one));
  }
  scene.add(boxCoins);
  const stampTex = stampTexture();
  const stampMat = new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.156), stampMat);
  decal.position.set(BOX.x, 0.62 + 0.17, BOX.z + 0.207);
  decal.rotation.z = 0.08;
  decal.visible = false;
  scene.add(decal);
  // pilha de caixas já carimbadas EMPTY atrás do supervisor
  const stackDecals = [];
  for (const [x, y, z, ry] of [
    [-2.55, 0, 1.75, 0.1],
    [-2.0, 0, 1.95, -0.08],
    [-2.3, 0.4, 1.82, 0.05],
  ]) {
    const b = makeBox(0.5, 0.4, 0.42, false);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    scene.add(b);
    const dd = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.148), new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.9 }));
    dd.position.set(0, 0.2, 0.212);
    dd.rotation.z = -0.06 + ry;
    b.add(dd);
    stackDecals.push(dd);
  }
  // carimbo grande
  const stamp = new THREE.Group();
  const wood = P(new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), wood);
  knob.position.y = 0.2;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 12), wood);
  stick.position.y = 0.12;
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), wood);
  block.position.y = 0.03;
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.012, 0.11), P(new THREE.MeshStandardMaterial({ color: 0xb3262e, roughness: 0.8 })));
  stamp.add(knob, stick, block, rubber);
  stamp.traverse((o) => o.isMesh && (o.castShadow = true));
  stamp.position.set(BOX.x + 0.38, 0.62, BOX.z - 0.1);
  scene.add(stamp);

  // ---- supervisor ----
  const sup = buildSupervisor((m) => col.patch(m, 0.32));
  scene.add(sup.root);
  const supCoin = new THREE.Mesh(coinGeo, coinMat);
  supCoin.visible = false;
  scene.add(supCoin);

  // ---- parede da frente (só no plano final) e mundo colorido lá fora ----
  const wall = new THREE.Group();
  wall.visible = false;
  scene.add(wall);
  const panelGeo = new THREE.BoxGeometry(1.25, 1.25, 0.08).translate(0, -0.625, 0);
  const panelMat = P(new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.6, metalness: 0.3 }));
  const panels = [];
  const WALL_Z = 4.45;
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 5; j++) {
      const m = new THREE.Mesh(panelGeo, panelMat);
      const x = STAND.x - 6.875 + i * 1.25;
      const y = (j + 1) * 1.25;
      m.position.set(x, y, WALL_Z);
      m.userData = { x, y, d: Math.hypot(x - STAND.x, y - 1.6) + rnd() * 0.5, spin: (rnd() - 0.5) * 2 };
      m.castShadow = false;
      wall.add(m);
      panels.push(m);
    }

  // ---------- animação por quadro ----------
  const beat = 60 / 90;
  const STOP = 34.0;
  const beltPos = (t) => {
    const v = 0.55;
    if (t < STOP) return v * t;
    const d = 1.6;
    const a = Math.min(t - STOP, d);
    return v * STOP + v * (a - (a * a) / (2 * d));
  };
  const beltSpeed = (t) => (t < STOP ? 1 : Math.max(0, 1 - (t - STOP) / 1.6));
  const tmpV = new THREE.Vector3();
  const e = new THREE.Euler();

  function update(t, opts = {}) {
    const bp = beltPos(t);
    beltTex.offset.x = -(bp / 0.6) % 1;
    let k = 0;
    for (const c of coinSeed) {
      if (opts.hideCoinAt && Math.abs(c.z - opts.hideCoinAt.z) < 0.05) {
        // a moeda que o Loopy pega some da esteira depois do instante do pegar
      }
      const x = ((((c.x0 + bp) % SPAN) + SPAN) % SPAN) - SPAN / 2 + 1.5;
      e.set(0, c.r, 0);
      q.setFromEuler(e);
      coins.setMatrixAt(k++, m4.compose(tmpV.set(x, BELT_TOP + 0.008, c.z), q, one));
    }
    coins.instanceMatrix.needsUpdate = true;
    // prensas batem no tempo (metade em cada tempo)
    let pi = 0;
    const sp = beltSpeed(t);
    BELT_Z.forEach((z, bi) =>
      pressX.forEach((x, xi) => {
        const ph = (bi + xi) % 2 ? 0 : 0.5;
        let y = 1.75;
        if (t < STOP + 0.3) {
          const u = (((t / beat + ph) % 1) + 1) % 1;
          const hit = u < 0.12 ? smooth(u / 0.12) : u < 0.22 ? 1 : 1 - smooth((u - 0.22) / 0.35);
          y = lerp(1.78, BELT_TOP + 0.08, hit * Math.min(1, sp * 1.2));
        }
        pistons.setMatrixAt(pi++, m4.makeTranslation(x, y, z));
      })
    );
    pistons.instanceMatrix.needsUpdate = true;
    // cabeças dos operários (viram para o Loopy no plano 6)
    const turnK = opts.headsTurn ?? 0;
    workers.forEach((w, i) => {
      let yaw = w.yaw + Math.sin(t * 0.4 + w.phase) * 0.03;
      if (turnK > 0 && opts.lookAt) {
        const target = Math.atan2(opts.lookAt.x - w.x, opts.lookAt.z - w.z);
        let d = target - w.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        d = clamp(d, -1.3, 1.3);
        const kk = smooth(clamp(turnK * 1.6 - (Math.abs(w.x - opts.lookAt.x) * 0.04 + (w.phase % 1) * 0.3)));
        yaw += d * kk;
      }
      q.setFromAxisAngle(up, yaw);
      wHead.setMatrixAt(i, m4.compose(tmpV.set(w.x, 0, w.z), q, one));
    });
    wHead.instanceMatrix.needsUpdate = true;
  }

  function peel(t, t0, t1) {
    for (const p of panels) {
      const s = t0 + p.userData.d * 0.16;
      const a = Math.max(0, t - s);
      const ang = Math.min(2.6, a * a * 7);
      p.rotation.set(-ang, p.userData.spin * a * 0.6, p.userData.spin * a * 0.3);
      p.position.set(p.userData.x, p.userData.y - a * a * 3.5, WALL_Z + a * a * 6);
      p.visible = a < 1.4;
    }
  }

  return {
    scene,
    col,
    update,
    peel,
    wall,
    sup,
    supCoin,
    stamp,
    decal,
    stackDecals,
    sign,
    key,
    coinGeo,
    coinMat,
    beltSpeed,
    WALL_Z,
  };
}
