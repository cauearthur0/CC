import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeDissolve } from './shaders.js';
import { mulberry32, clamp, smooth, invLerp, lerp } from './util.js';

// Mundo A: o salão cinza infinito. Mesas iguais, personagens cinzas sem rosto,
// moedas cinzas caindo nas fendas e escorrendo por uma calha até um poço escuro.

export const LOOPY_SPOT = { x: -2.4, z: -5.6 };
export const SHAFT = { x: 0, z: -34, r: 4.5 };

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // mergeGeometries exige os mesmos atributos em todas
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const at = (geo, x, y, z) => geo.translate(x, y, z);

function capsuleBetween(a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function candleTexture(seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0c1015';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(120,140,160,0.12)';
  g.lineWidth = 1;
  for (let y = 32; y < 256; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let x = 0; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  let p = 128 + (rnd() - 0.5) * 40;
  const n = 46;
  const w = 512 / n;
  for (let i = 0; i < n; i++) {
    const o = p;
    // tendência levemente para baixo: a taxa sempre leva um pouco
    p += (rnd() - 0.56) * 26;
    p = clamp(p, 40, 216);
    const hi = Math.min(o, p) - rnd() * 14;
    const lo = Math.max(o, p) + rnd() * 14;
    const up = p < o;
    const col = up ? '#3d9a6a' : '#b8474f';
    g.strokeStyle = col;
    g.fillStyle = col;
    const x = i * w + w / 2;
    g.beginPath();
    g.moveTo(x, hi);
    g.lineTo(x, lo);
    g.lineWidth = 1.5;
    g.stroke();
    g.fillRect(x - w * 0.32, Math.min(o, p), w * 0.64, Math.max(2, Math.abs(p - o)));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(0.62, 1);
  return tex;
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808890';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(40,46,54,0.45)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function buildWorldA() {
  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x7a8591);
  scene.background = FOG.clone();
  scene.fog = new THREE.FogExp2(FOG.clone(), 0.034);
  const dis = makeDissolve();

  // ---- luz dura de cima ----
  const hemi = new THREE.HemisphereLight(0xc6d0da, 0x2b3038, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xe6edf5, 2.0);
  sun.position.set(1.5, 10, 2.5);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8090a0, 0.18));

  // ---- chão com buraco do poço ----
  const shape = new THREE.Shape();
  shape.moveTo(-70, -30);
  shape.lineTo(70, -30);
  shape.lineTo(70, 130);
  shape.lineTo(-70, 130);
  shape.lineTo(-70, -30);
  const hole = new THREE.Path();
  hole.absarc(SHAFT.x, -SHAFT.z, SHAFT.r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const floorGeo = new THREE.ShapeGeometry(shape, 48);
  floorGeo.rotateX(-Math.PI / 2);
  // UV em metros (piso de 1,3 m)
  {
    const p = floorGeo.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) / 1.3;
      uv[i * 2 + 1] = p.getZ(i) / 1.3;
    }
    floorGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const floorMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x9aa1a9, map: floorTexture(), roughness: 0.42, metalness: 0.05 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  scene.add(floor);

  // poço
  const shaftGeo = new THREE.CylinderGeometry(SHAFT.r, SHAFT.r * 0.92, 26, 72, 8, true);
  {
    const p = shaftGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); // -13..13
      const k = Math.pow(smooth(invLerp(-13, 13, y)), 6) * 0.22;
      col[i * 3] = k;
      col[i * 3 + 1] = k * 1.05;
      col[i * 3 + 2] = k * 1.12;
    }
    shaftGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const shaft = new THREE.Mesh(shaftGeo, dis.patch(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  shaft.position.set(SHAFT.x, -13, SHAFT.z);
  scene.add(shaft);
  const shaftBottom = new THREE.Mesh(new THREE.CircleGeometry(SHAFT.r, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  shaftBottom.rotation.x = -Math.PI / 2;
  shaftBottom.position.set(SHAFT.x, -25.9, SHAFT.z);
  scene.add(shaftBottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(SHAFT.r + 0.05, 0.12, 12, 96), dis.patch(new THREE.MeshStandardMaterial({ color: 0x4b5159, metalness: 0.7, roughness: 0.35 })));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(SHAFT.x, 0.02, SHAFT.z);
  scene.add(rim);

  // calha central (vidro escuro) no corredor
  const trenchMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.15, metalness: 0.3 }));
  const trenchLen = 42.7;
  const trench = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, trenchLen), trenchMat);
  trench.position.set(0, 0.01, 13.2 - trenchLen / 2);
  scene.add(trench);
  const edgeMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x5c646e, metalness: 0.6, roughness: 0.3 }));
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, trenchLen), edgeMat);
    e.position.set(s * 0.34, 0.03, trench.position.z);
    scene.add(e);
  }

  // ---- teto, faixas de luz e pilares ----
  const ceilMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x5d646d, roughness: 0.9 }));
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(140, 170), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 6.6, 20);
  scene.add(ceil);
  const stripMat = dis.patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.92, 0.97, 1.0).multiplyScalar(2.4) }));
  const stripXs = [];
  for (let x = -26.4; x <= 26.4 + 0.01; x += 4.4) stripXs.push(x);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.05, 170), stripMat, stripXs.length);
  const m4 = new THREE.Matrix4();
  stripXs.forEach((x, i) => strips.setMatrixAt(i, m4.makeTranslation(x, 6.56, 20)));
  scene.add(strips);
  const pillarMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x737a83, roughness: 0.8 }));
  const pillarPos = [];
  for (let x = -24.2; x <= 24.3; x += 8.8)
    for (let z = 12; z >= -90; z -= 10.4) {
      if (Math.abs(x) < 1.8) continue;
      if (Math.hypot(x - SHAFT.x, z - SHAFT.z) < SHAFT.r + 3) continue;
      pillarPos.push([x, z]);
    }
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 6.6, 0.62), pillarMat, pillarPos.length);
  pillarPos.forEach(([x, z], i) => pillars.setMatrixAt(i, m4.makeTranslation(x, 3.3, z)));
  scene.add(pillars);

  // ---- mesas e personagens ----
  const desks = [];
  const colsX = [];
  for (let i = 0; i < 9; i++) {
    colsX.push(2.4 + i * 2.2);
    colsX.push(-(2.4 + i * 2.2));
  }
  for (let j = 0; j < 26; j++) {
    const z = 10 - j * 2.6;
    for (const x of colsX) {
      if (Math.hypot(x - SHAFT.x, z - SHAFT.z) < SHAFT.r + 2.2) continue;
      // não colide com pilares
      if (pillarPos.some(([px, pz]) => Math.abs(px - x) < 1.1 && Math.abs(pz - (z - 0.4)) < 1.2)) continue;
      desks.push({ x, z, loopy: Math.abs(x - LOOPY_SPOT.x) < 0.01 && Math.abs(z - LOOPY_SPOT.z) < 0.01 });
    }
  }
  const rnd = mulberry32(7);
  for (const d of desks) {
    d.period = 3.2 + rnd() * 1.4;
    d.phase = rnd() * 10;
    d.screen = Math.floor(rnd() * 4);
  }

  const deskGeo = mergeGeometries([
    colored(at(new THREE.BoxGeometry(1.32, 0.05, 0.72), 0, 0.74, -0.62), 0x8b929a),
    colored(at(new THREE.BoxGeometry(0.04, 0.72, 0.66), -0.62, 0.36, -0.62), 0x6d747c),
    colored(at(new THREE.BoxGeometry(0.04, 0.72, 0.66), 0.62, 0.36, -0.62), 0x6d747c),
    colored(at(new THREE.BoxGeometry(1.22, 0.42, 0.03), 0, 0.5, -0.96), 0x6d747c),
    colored(at(new THREE.BoxGeometry(0.05, 0.28, 0.05), 0, 0.9, -0.84), 0x50565e),
    colored(at(new THREE.BoxGeometry(0.7, 0.44, 0.05), 0, 1.2, -0.86), 0x3e444b),
    colored(at(new THREE.BoxGeometry(0.46, 0.02, 0.15), -0.08, 0.775, -0.42), 0x5a6068),
    colored(at(new THREE.BoxGeometry(0.13, 0.014, 0.05), 0.24, 0.772, -0.42), 0x15181c),
  ]);
  const deskMat = dis.patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));
  const deskMesh = new THREE.InstancedMesh(deskGeo, deskMat, desks.length);
  desks.forEach((d, i) => deskMesh.setMatrixAt(i, m4.makeTranslation(d.x, 0, d.z)));
  scene.add(deskMesh);

  // telas (4 gráficos de velas diferentes)
  const screenTex = [11, 23, 37, 51].map(candleTexture);
  const screenMeshes = screenTex.map((tex) => {
    const mat = dis.patch(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.15) }));
    const ds = desks.filter((d) => d.screen === screenTex.indexOf(tex));
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.63, 0.37), mat, ds.length);
    ds.forEach((d, i) => mesh.setMatrixAt(i, m4.makeTranslation(d.x, 1.2, d.z - 0.83)));
    scene.add(mesh);
    return mesh;
  });

  // personagem sentado (banco + corpo + cabeça + braço esquerdo apoiado)
  const grey = 0x858c94;
  const charGeo = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.17, 0.2, 0.44, 10, 1, true), 0, 0.22, 0), 0x50565d),
    colored(at(new THREE.CapsuleGeometry(0.2, 0.28, 4, 12), 0, 0.76, 0.02), grey),
    colored(at(new THREE.SphereGeometry(0.158, 16, 10), 0, 1.27, -0.03), grey),
    colored(capsuleBetween(new THREE.Vector3(-0.21, 1.0, -0.02), new THREE.Vector3(-0.17, 0.8, -0.4), 0.052), grey),
    colored(capsuleBetween(new THREE.Vector3(-0.09, 0.47, 0.0), new THREE.Vector3(-0.1, 0.45, -0.32), 0.07), grey),
    colored(capsuleBetween(new THREE.Vector3(0.09, 0.47, 0.0), new THREE.Vector3(0.1, 0.45, -0.32), 0.07), grey),
  ]);
  const charMat = dis.patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 }));
  const chars = new THREE.InstancedMesh(charGeo, charMat, desks.length);
  desks.forEach((d, i) => {
    chars.setMatrixAt(i, d.loopy ? m4.makeScale(0, 0, 0) : m4.makeTranslation(d.x, 0, d.z));
  });
  scene.add(chars);

  // braço direito animado (pivô no ombro)
  const armGeo = mergeGeometries([
    colored(at(new THREE.CapsuleGeometry(0.052, 0.3, 3, 8), 0, -0.2, 0), grey),
    colored(at(new THREE.SphereGeometry(0.062, 8, 6), 0, -0.4, 0), grey),
  ]);
  const arms = new THREE.InstancedMesh(armGeo, charMat, desks.length);
  scene.add(arms);

  // moedas
  const coinGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 14);
  const coinMat = dis.patch(new THREE.MeshStandardMaterial({ color: 0x9aa0a7, metalness: 0.75, roughness: 0.38 }));
  const dropCoins = new THREE.InstancedMesh(coinGeo, coinMat, desks.length);
  scene.add(dropCoins);
  const NT = 260;
  const trenchCoins = new THREE.InstancedMesh(coinGeo, coinMat, NT);
  const tcSeed = [];
  for (let i = 0; i < NT; i++) tcSeed.push({ off: i * 0.19 + rnd() * 0.08, x: (rnd() - 0.5) * 0.3, r: rnd() * 6.28 });
  scene.add(trenchCoins);

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0, 0);

  function update(t) {
    // braços e moedas caindo nas fendas
    desks.forEach((d, i) => {
      if (d.loopy) {
        arms.setMatrixAt(i, m4.makeScale(0, 0, 0));
        dropCoins.setMatrixAt(i, m4.makeScale(0, 0, 0));
        return;
      }
      const u = ((t + d.phase) / d.period) % 1;
      let th = 1.05;
      if (u < 0.12) th = lerp(1.05, 1.45, smooth(u / 0.12));
      else if (u < 0.2) th = 1.45;
      else if (u < 0.34) th = lerp(1.45, 1.05, smooth((u - 0.2) / 0.14));
      e.set(th, 0, 0);
      q.setFromEuler(e);
      p.set(d.x + 0.21, 1.02, d.z - 0.01);
      arms.setMatrixAt(i, m4.compose(p, q, s));
      // moeda: aparece na mão e cai na fenda
      const handY = 1.02 - Math.cos(th) * 0.42;
      const handZ = d.z - Math.sin(th) * 0.42;
      if (u > 0.1 && u < 0.29) {
        let y = handY - 0.06;
        let z = handZ;
        if (u > 0.17) {
          const k = smooth((u - 0.17) / 0.12);
          y = lerp(handY - 0.06, 0.74, k * k);
          z = lerp(handZ, d.z - 0.42, k);
        }
        e.set(Math.PI / 2, 0, 0);
        q.setFromEuler(e);
        dropCoins.setMatrixAt(i, m4.compose(p.set(d.x + 0.24, y, z), q, s));
      } else dropCoins.setMatrixAt(i, m4.makeScale(0, 0, 0));
    });
    arms.instanceMatrix.needsUpdate = true;
    dropCoins.instanceMatrix.needsUpdate = true;

    // fileira de moedas escorrendo pela calha até o poço
    const L = 48;
    for (let i = 0; i < NT; i++) {
      const c = tcSeed[i];
      const dz = (t * 2.4 + c.off) % L;
      const z = 13.2 - dz;
      let y = 0.03;
      const rimZ = SHAFT.z + SHAFT.r;
      let vis = 1;
      if (z < rimZ) {
        const f = rimZ - z;
        y = 0.03 - Math.pow(f * 1.3, 1.6);
        if (y < -6) vis = 0;
      }
      e.set(0, c.r + t * 0.5, z < rimZ ? (rimZ - z) * 1.2 : 0);
      q.setFromEuler(e);
      if (vis) trenchCoins.setMatrixAt(i, m4.compose(p.set(c.x, y, z), q, s));
      else trenchCoins.setMatrixAt(i, m4.makeScale(0, 0, 0));
    }
    trenchCoins.instanceMatrix.needsUpdate = true;

    // gráficos rolando
    screenTex.forEach((tex, k) => (tex.offset.x = (t * 0.018 + k * 0.23) % 1));
  }

  // pontos para partículas da dissolução (cabeças, corpos, mesas, pilares, teto)
  function particleSeeds(count, seed = 3) {
    const r = mulberry32(seed);
    const pts = [];
    const near = desks.filter((d) => Math.abs(d.x) < 22 && d.z > -32 && d.z < 12);
    for (let i = 0; i < count; i++) {
      const k = r();
      if (k < 0.55) {
        const d = near[Math.floor(r() * near.length)];
        // corpo/cabeça
        const y = 0.4 + r() * 1.05;
        pts.push([d.x + (r() - 0.5) * 0.42, y, d.z + (r() - 0.5) * 0.36]);
      } else if (k < 0.8) {
        const d = near[Math.floor(r() * near.length)];
        pts.push([d.x + (r() - 0.5) * 1.3, 0.75 + r() * 0.7 * (r() < 0.4 ? 1 : 0), d.z - 0.3 - r() * 0.6]);
      } else if (k < 0.93) {
        pts.push([(r() - 0.5) * 44, 6.55, 12 - r() * 46]);
      } else {
        const pp = pillarPos[Math.floor(r() * pillarPos.length)];
        pts.push([pp[0] + (r() - 0.5) * 0.6, r() * 6.6, pp[1] + (r() - 0.5) * 0.6]);
      }
    }
    return pts;
  }

  function setAtmosphere(k) {
    // k = 0 cinza; 1 escuro (depois da dissolução)
    const dark = new THREE.Color(0x07070a);
    scene.background.copy(FOG).lerp(dark, k);
    scene.fog.color.copy(FOG).lerp(dark, k);
    scene.fog.density = lerp(0.034, 0.012, k);
  }

  return { scene, update, dis, desks, particleSeeds, setAtmosphere, sun, hemi };
}
