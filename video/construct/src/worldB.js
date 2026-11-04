import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildDioramaGeometries, dioramaMaterials, TYPES, LO_COLORS, N } from './dioramas.js';
import { VoxelGrid, meshVoxels, mulberry32, radialTexture, infinityTexture, easeOutBack, clamp, smooth, ORANGE } from './util.js';

// Mundo B: o "Construct". Sala branca infinita; fileiras de prateleiras chegam com mini mundos.

export const SLOT = 0.6; // lado do cubo de vidro
const VOX = SLOT / N;
const RACK_LEN = 1.96;
const RACK_DEPTH = 0.74;
const SHELVES = [0.12, 0.92, 1.72, 2.52];
const TOP = 3.32;
const SLOT_Z = [-0.64, 0, 0.64];
export const ROW_X = [2.3, 5.3, 8.3, 11.3, 14.3, 17.3, 20.3, 23.3];
const RACK_Z0 = 12;
const RACK_COUNT = 46;
const HI = { rows: 1, zMin: -9, zMax: 8.5 };
export const HERO = { x: 0.78, z: 0.62, top: 0.55 };

function vcolor(geo, hex, mult = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex).multiplyScalar(mult);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const tr = (g, x, y, z) => g.translate(x, y, z);

function rackFrame() {
  const parts = [];
  const metal = 0xe9edf1;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) parts.push(vcolor(tr(new THREE.BoxGeometry(0.04, TOP, 0.04), sx * (RACK_DEPTH / 2 - 0.02), TOP / 2, sz * (RACK_LEN / 2 - 0.02)), 0xcfd5dc));
  for (const y of [...SHELVES, TOP]) parts.push(vcolor(tr(new THREE.BoxGeometry(RACK_DEPTH, 0.03, RACK_LEN), 0, y, 0), metal));
  return mergeGeometries(parts);
}

function glassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(214,240,255,0.045)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, 123, 123);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function plinthGeo() {
  return vcolor(tr(new THREE.BoxGeometry(SLOT + 0.03, 0.04, SLOT + 0.03), 0, -0.02, 0), 0xf4f6f8);
}

function cubeFrame() {
  // 12 arestas finas + base
  const s = SLOT;
  const b = 0.01;
  const parts = [];
  const h = s / 2;
  for (const y of [0, s])
    for (const sx of [-1, 1]) {
      parts.push(vcolor(tr(new THREE.BoxGeometry(b, b, s), sx * h, y, 0), 0xffffff));
      parts.push(vcolor(tr(new THREE.BoxGeometry(s, b, b), 0, y, sx * h), 0xffffff));
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(vcolor(tr(new THREE.BoxGeometry(b, s, b), sx * h, s / 2, sz * h), 0xffffff));
  parts.push(vcolor(tr(new RoundedBoxGeometry(s + 0.03, 0.04, s + 0.03, 2, 0.01), 0, -0.02, 0), 0xf4f6f8));
  return mergeGeometries(parts);
}

function loGeometry(type) {
  const [a, b, c] = LO_COLORS[type];
  const s = SLOT;
  const solid = mergeGeometries([
    vcolor(tr(new THREE.BoxGeometry(s * 0.98, 0.07, s * 0.98), 0, 0.035, 0), a),
    vcolor(tr(new THREE.BoxGeometry(s * 0.3, s * 0.32, s * 0.22), -s * 0.18, 0.07 + s * 0.16, -s * 0.12), b),
    vcolor(tr(new THREE.BoxGeometry(s * 0.18, s * 0.2, s * 0.18), s * 0.2, 0.07 + s * 0.1, s * 0.15), b),
  ]);
  const glow = vcolor(tr(new THREE.BoxGeometry(s * 0.12, s * 0.12, s * 0.12), s * 0.05, 0.07 + s * 0.45, s * 0.05), c, 4.0);
  return { solid, glow };
}

function slotTransforms(rackZ) {
  const out = [];
  for (const y of SHELVES) for (const z of SLOT_Z) out.push({ y: y + 0.015 + 0.04, z: rackZ + z });
  return out;
}

export function buildWorldB(renderer) {
  const scene = new THREE.Scene();
  const WHITE = new THREE.Color(0xffffff);
  scene.background = WHITE.clone();
  scene.fog = new THREE.Fog(0xffffff, 16, 78);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.2;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xdfe5ec, 0.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.65);
  key.position.set(3.5, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 25;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.001;
  catcher.receiveShadow = true;
  scene.add(catcher);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture(128, 'rgba(0,0,0,0.3)'), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  blob.scale.set(0.75, 0.75, 1);
  scene.add(blob);

  // ---- prateleiras ----
  const time = { value: 0 };
  const dio = buildDioramaGeometries(VOX);
  const dmat = dioramaMaterials(time);
  const metalMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const loSolidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const loGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const stripMat = new THREE.MeshBasicMaterial({ map: radialTexture(128, 'rgba(0,0,0,0.38)'), transparent: true, depthWrite: false });
  const frame = rackFrame();
  const cube = plinthGeo();
  const glassGeo = tr(new THREE.BoxGeometry(SLOT, SLOT, SLOT), 0, SLOT / 2, 0);
  const lo = Object.fromEntries(TYPES.map((t) => [t, loGeometry(t)]));
  const rnd = mulberry32(42);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  const rows = [];
  ROW_X.forEach((ax, ri) => {
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      const x = side * ax;
      const metalParts = [];
      const glassParts = [];
      const loSolid = [];
      const loGlow = [];
      const hiSlots = Object.fromEntries(TYPES.map((t) => [t, []]));
      for (let k = 0; k < RACK_COUNT; k++) {
        const rz = RACK_Z0 - k * 2.0;
        metalParts.push(frame.clone().translate(x, 0, rz));
        const hi = ri < HI.rows && rz > HI.zMin && rz < HI.zMax;
        for (const s of slotTransforms(rz)) {
          const type = TYPES[Math.floor(rnd() * TYPES.length)];
          const rot = Math.floor(rnd() * 4) * (Math.PI / 2);
          metalParts.push(cube.clone().translate(x, s.y, s.z));
          glassParts.push(glassGeo.clone().translate(x, s.y, s.z));
          if (hi) hiSlots[type].push({ x, y: s.y + 0.0, z: s.z, rot });
          else {
            const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, s.y, s.z);
            loSolid.push(lo[type].solid.clone().applyMatrix4(m));
            loGlow.push(lo[type].glow.clone().applyMatrix4(m));
          }
        }
      }
      const metal = new THREE.Mesh(mergeGeometries(metalParts), metalMat);
      metal.castShadow = false;
      metal.receiveShadow = true;
      g.add(metal);
      const glass = new THREE.Mesh(mergeGeometries(glassParts), glassMat);
      glass.renderOrder = 5;
      g.add(glass);
      if (loSolid.length) {
        g.add(new THREE.Mesh(mergeGeometries(loSolid), loSolidMat));
        g.add(new THREE.Mesh(mergeGeometries(loGlow), loGlowMat));
      }
      for (const t of TYPES) {
        const list = hiSlots[t];
        if (!list.length) continue;
        const s = new THREE.InstancedMesh(dio[t].solid, dmat.solid, list.length);
        const gl = new THREE.InstancedMesh(dio[t].glow, dmat.glow, list.length);
        list.forEach((o, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot);
          m4.compose(new THREE.Vector3(o.x, o.y, o.z), q, one);
          s.setMatrixAt(i, m4);
          gl.setMatrixAt(i, m4);
        });
        g.add(s, gl);
      }
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.8, RACK_COUNT * 2.0 + 2), stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.003, RACK_Z0 - (RACK_COUNT - 1) + 0);
      strip.scale.set(1, 1, 1);
      g.add(strip);
      rows.push({ group: g, wave: ri, side });
    }
  });

  // ---- diorama herói (plano 7): constrói em etapas ----
  const hero = buildHero(time);
  hero.group.position.set(HERO.x, HERO.top, HERO.z);
  scene.add(hero.group);
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.86, HERO.top, 0.86, 3, 0.04), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }));
  plinth.position.set(HERO.x, HERO.top / 2, HERO.z);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);
  const plinthShadow = blob.clone();
  plinthShadow.position.set(HERO.x, 0.002, HERO.z);
  plinthShadow.scale.set(1.5, 1.5, 1);
  scene.add(plinthShadow);

  function setRows(t, waves) {
    for (const r of rows) {
      const T = waves[r.wave];
      const dur = 0.8;
      const u = (t - (T - dur)) / dur;
      if (u < 0) {
        r.group.visible = false;
        continue;
      }
      r.group.visible = true;
      let off;
      if (u < 1) off = -150 * Math.pow(1 - u, 1.7);
      else {
        const a = t - T;
        off = 0.1 * Math.sin(a * 22) * Math.exp(-a * 7);
      }
      r.group.position.z = off;
    }
  }

  function hideRows() {
    for (const r of rows) r.group.visible = false;
  }

  return { scene, time, rows, setRows, hideRows, hero, plinth, plinthShadow, blob, key, hemi };
}

// ---------- diorama herói ----------
function buildHero(time) {
  const V = new VoxelGrid();
  const W = 20;
  const set = (x, y, z, c, stage = 0, glow = false, anim = 0) => {
    V.set(x, y, z, c, glow, anim);
    const v = V.get(x, y, z);
    v.stage = stage;
    v.group = stage; // faces entre etapas diferentes não são removidas
  };
  const box = (x0, y0, z0, x1, y1, z1, c, stage = 0, glow = false, anim = 0) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c, stage, glow, anim);
  };
  // terreno e rio
  for (let x = 0; x < W; x++)
    for (let z = 0; z < W; z++) {
      const river = x >= 8 && x <= 11;
      set(x, 0, z, 0x6b4a2f);
      if (river) set(x, 1, z, 0x22d3ee, 0, true);
      else {
        set(x, 1, z, 0x5d9e4f);
        set(x, 2, z, (x * 7 + z * 13) % 5 === 0 ? 0x6fb35d : 0x63a853);
      }
    }
  // ponte: metade esquerda já existe; o resto chega com as moedas
  box(6, 3, 9, 8, 3, 11, 0x9c6a43, 0);
  box(9, 3, 9, 10, 3, 11, 0x9c6a43, 1);
  box(11, 3, 9, 13, 3, 11, 0x9c6a43, 1);
  for (let x = 6; x <= 13; x++) {
    set(x, 4, 9, 0x7a4f2c, 2);
    set(x, 4, 11, 0x7a4f2c, 2);
  }
  box(9, 2, 10, 10, 2, 10, 0x7a4f2c, 2);
  // torre (margem direita): 2 andares prontos, mais 2 + telhado depois
  const floor = (y0, stage) => {
    for (let y = y0; y < y0 + 3; y++)
      for (let x = 14; x <= 18; x++)
        for (let z = 3; z <= 7; z++) {
          const edge = x === 14 || x === 18 || z === 3 || z === 7;
          if (!edge) continue;
          const win = y === y0 + 1 && (x === 16 || z === 5) && !(x === 14 && z === 3);
          if (win) set(x, y, z, 0xffc46b, stage === 0 ? 5 : stage, true);
          else set(x, y, z, 0xb7bcc4, stage);
        }
    box(14, y0 + 3, 3, 18, y0 + 3, 7, 0x9aa1aa, stage);
  };
  floor(3, 0);
  floor(7, 0);
  floor(11, 3);
  floor(15, 4);
  box(15, 19, 4, 17, 19, 6, 0xff7a2e, 4);
  set(16, 20, 5, 0xff7a2e, 4);
  // farol de ∞ no topo
  for (const [x, z] of [
    [14, 5],
    [15, 4],
    [15, 6],
    [16, 5],
    [17, 4],
    [17, 6],
    [18, 5],
  ])
    set(x, 21, z, 0xff7a2e, 8, true);
  // casinha na margem esquerda
  box(1, 3, 2, 5, 5, 6, 0xe8dcc8, 0);
  box(1, 6, 2, 5, 6, 6, 0xd8433b, 0);
  box(2, 7, 3, 4, 7, 5, 0xd8433b, 0);
  set(3, 4, 7 - 1, 0xffc46b, 5, true);
  // postes de luz
  for (const [x, z] of [
    [6, 8],
    [13, 12],
    [3, 12],
    [16, 12],
  ]) {
    box(x, 3, z, x, 5, z, 0x3d4148, 0);
    set(x, 6, z, 0xffd27a, 5, true);
  }
  // árvores que crescem
  for (const [x, z] of [
    [2, 16],
    [5, 14],
    [16, 16],
    [18, 10],
  ]) {
    box(x, 3, z, x, 4, z, 0x7a4f2c, 0);
    box(x - 1, 5, z - 1, x + 1, 6, z + 1, 0x3f9b55, 7);
    set(x, 7, z, 0x58b35a, 7);
  }
  // flores
  for (const [x, z, c] of [
    [4, 9, 0xff7a2e],
    [1, 11, 0xffd166],
    [15, 14, 0xff3df2],
    [18, 15, 0xffd166],
    [3, 18, 0x22d3ee],
  ])
    set(x, 3, z, c, 7);
  // bonequinhos (andam depois da moeda 6)
  for (const [x, z, c] of [
    [4, 10, 0xef4444],
    [5, 11, 0x3b82f6],
    [16, 10, 0xffd166],
  ]) {
    set(x, 3, z, c, 0, false, 4);
    set(x, 4, z, c, 0, false, 4);
    set(x, 5, z, 0xf6c7a0, 0, false, 4);
  }

  // geometria com etapa, centro do voxel e atraso por voxel
  const off = [-W / 2, 0, -W / 2];
  const vs = 0.034;
  const make = (filter) => {
    const g = meshVoxels(V, vs, off, filter);
    // recalcula atributos extras face a face
    const n = g.attributes.position.count;
    const stage = new Float32Array(n);
    const center = new Float32Array(n * 3);
    const list = [...V.map.values()].filter(filter);
    // meshVoxels percorre voxels na mesma ordem; reconstruímos contando faces
    let vi = 0;
    for (const v of list) {
      const faces = countFaces(V, v, filter);
      for (let f = 0; f < faces * 6; f++) {
        stage[vi] = v.stage ?? 0;
        center[vi * 3] = (v.x + 0.5 + off[0]) * vs;
        center[vi * 3 + 1] = (v.y + 0.5 + off[1]) * vs;
        center[vi * 3 + 2] = (v.z + 0.5 + off[2]) * vs;
        vi++;
      }
    }
    g.setAttribute('aStage', new THREE.BufferAttribute(stage, 1));
    g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
    return g;
  };
  const solidGeo = make((v) => !v.glow);
  const glowGeo = make((v) => v.glow);

  const uStage = { value: new Array(9).fill(-100) };
  const uWalk = { value: -100 };
  const uLand = { value: new Array(9).fill(0).map(() => new THREE.Vector3()) };
  const common = /* glsl */ `
    attribute float aStage; attribute vec3 aCenter; attribute float aAnim;
    uniform float uTime; uniform float uStage[9]; uniform float uWalk; uniform vec3 uLand[9];
    varying float vOn;
    float backOut(float t){ t = clamp(t, 0.0, 1.0) - 1.0; return t*t*(2.7*t + 1.7) + 1.0; }
  `;
  const body = /* glsl */ `
    int si = int(aStage + 0.5);
    float st = uStage[si];
    float dly = si > 0 ? length(aCenter - uLand[si]) * 0.9 : 0.0;
    float age = uTime - st - dly;
    float sc = (si == 0 || si == 5) ? 1.0 : (age <= 0.0 ? 0.0 : backOut(age / 0.28));
    vOn = clamp((uTime - uStage[5]) / 0.3, 0.0, 1.0);
    transformed = aCenter + (transformed - aCenter) * sc;
    if (si > 0 && si != 5 && age > 0.0 && age < 0.28) transformed.y += (0.28 - age) * 0.25;
    if (aAnim > 3.5) {
      float w = max(0.0, uTime - uWalk);
      float ph = aCenter.z * 30.0;
      transformed.x += sin(w * 1.1 + ph) * 0.17 * smoothstep(0.0, 0.8, w);
      transformed.y += abs(sin(w * 9.0 + ph)) * 0.012 * smoothstep(0.0, 0.5, w);
    }
  `;
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  solidMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: time, uStage, uWalk, uLand });
    sh.vertexShader = common + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  };
  solidMat.customProgramCacheKey = () => 'hero-solid';
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: time, uStage, uWalk, uLand });
    sh.vertexShader = common + 'varying float vStageI;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body + '\nvStageI = aStage;');
    sh.fragmentShader =
      'varying float vOn; varying float vStageI;\n' +
      sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float lit = (vStageI < 0.5 || vStageI > 7.5) ? 1.0 : vOn;
         outgoingLight = mix(vec3(0.05, 0.05, 0.06), outgoingLight * 4.0, lit);
         #include <opaque_fragment>`
      );
  };
  glowMat.customProgramCacheKey = () => 'hero-glow';
  const group = new THREE.Group();
  const solid = new THREE.Mesh(solidGeo, solidMat);
  solid.castShadow = true;
  solid.receiveShadow = true;
  const glow = new THREE.Mesh(glowGeo, glowMat);
  solid.frustumCulled = glow.frustumCulled = false;
  group.add(solid, glow);
  const warm = new THREE.PointLight(0xffb070, 0, 2.2, 2);
  warm.position.set(0, 0.75, 0.2);
  group.add(warm);

  // pontos de pouso (centro de cada etapa) em coordenadas locais
  const landing = [
    null,
    [9.5, 4, 10],
    [9.5, 5, 10],
    [16, 13, 5],
    [16, 17, 5],
    [10, 5, 10],
    [8, 4, 10],
    [10, 7, 15],
    [16, 21, 5],
  ].map((p) => (p ? new THREE.Vector3((p[0] + 0.5 + off[0]) * vs, (p[1] + 0.5) * vs, (p[2] + 0.5 + off[2]) * vs) : new THREE.Vector3()));
  landing.forEach((v, i) => uLand.value[i].copy(v));

  // fichas laranja com ∞
  const infTex = infinityTexture(256, 0.13, false);
  const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(2.0), map: null });
  const sideMat = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: new THREE.Color(ORANGE), emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 });
  const markMat = new THREE.MeshBasicMaterial({ map: infTex, transparent: true, color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(3), depthWrite: false });
  const tokens = [];
  for (let i = 1; i <= 8; i++) {
    const tk = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 32), [sideMat, faceMat, faceMat]);
    tk.add(c);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), markMat);
      m.rotation.x = -Math.PI / 2 * s;
      m.position.y = 0.0055 * s;
      tk.add(m);
    }
    tk.visible = false;
    group.add(tk);
    tokens.push(tk);
  }
  // anel de impacto
  const ringTex = radialTexture(128, 'rgba(255,170,90,0.0)', 'rgba(255,170,90,0)');
  const ringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 }, uR: { value: 0.3 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform float uA; uniform float uR; varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; float a = smoothstep(uR-0.12, uR, d) * (1.0 - smoothstep(uR, uR+0.04, d)); gl_FragColor = vec4(vec3(1.0,0.55,0.2)*3.0*a*uA, a*uA); }',
  });
  void ringTex;
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), ringMat.clone());
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    group.add(r);
    rings.push(r);
  }

  function update(t, tokenTimes, active) {
    group.visible = active;
    if (!active) return;
    for (let i = 1; i <= 8; i++) uStage.value[i] = tokenTimes[i - 1];
    uStage.value[0] = -100;
    uWalk.value = tokenTimes[5] + 0.2;
    let done = 0;
    tokenTimes.forEach((T, i) => {
      const tk = tokens[i];
      const L = landing[i + 1];
      const fall = 1.1;
      const dt = T - t;
      if (dt > 0 && dt < fall) {
        tk.visible = true;
        const h = 0.5 * 3.2 * dt * dt + 0.02;
        tk.position.set(L.x + Math.sin(i * 2.1) * dt * 0.08, L.y + h, L.z);
        // cai sem girar no eixo vertical: o ∞ fica sempre deitado (nunca vira um "8")
        tk.rotation.set(0.6 + Math.sin(dt * 7 + i) * 0.12, 0, Math.sin(dt * 5 + i * 2) * 0.12);
        tk.scale.setScalar(1);
      } else if (dt <= 0 && dt > -0.16) {
        tk.visible = true;
        tk.position.set(L.x, L.y + 0.02, L.z);
        tk.rotation.set(0.0, 0, 0);
        tk.scale.setScalar(1 + (-dt / 0.16) * 0.6);
      } else tk.visible = false;
      if (dt <= -0.16) tk.scale.setScalar(0);
      const ring = rings[i];
      const a = -dt;
      if (a > 0 && a < 0.6) {
        ring.visible = true;
        ring.position.set(L.x, L.y + 0.01, L.z);
        ring.material.uniforms.uR.value = 0.15 + a * 1.4;
        ring.material.uniforms.uA.value = 1 - a / 0.6;
      } else ring.visible = false;
      if (t > T) done++;
    });
    warm.intensity = 0.02 + done * 0.025 + (done >= 5 ? 0.06 : 0);
    return done;
  }

  return { group, update, tokens, warm, landing, uStage };
}

function countFaces(V, v, filter) {
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  let n = 0;
  for (const d of dirs) {
    const nb = V.get(v.x + d[0], v.y + d[1], v.z + d[2]);
    if (nb && nb.glow === v.glow && nb.anim === v.anim && filter(nb) && (nb.group ?? 0) === (v.group ?? 0)) continue;
    n++;
  }
  return n;
}

export { clamp, smooth, easeOutBack };
