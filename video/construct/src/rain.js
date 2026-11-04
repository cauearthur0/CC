import * as THREE from 'three';
import { mulberry32, infinityTexture } from './util.js';

// Chuva de ∞ laranja: colunas de símbolos que caem juntos, o primeiro de cada fila mais quente.
export function buildInfinityRain({ count = 1100, seed = 5 } = {}) {
  const r = mulberry32(seed);
  const base = new THREE.PlaneGeometry(1, 0.5);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const cols = [];
  const params = [];
  const seeds = [];
  let total = 0;
  for (let c = 0; c < count; c++) {
    const x = (r() - 0.5) * 48;
    const z = 12 - r() * 50;
    const M = 6 + Math.floor(r() * 18);
    const spacing = 0.36 + r() * 0.12;
    const speed = 2.2 + r() * 3.4;
    const gap = 6 + r() * 16;
    const L = M * spacing + gap;
    const phase = r() * L;
    const size = 0.2 + r() * 0.14;
    for (let k = 0; k < M; k++) {
      cols.push(x, 26, z);
      params.push(k, speed, phase, L);
      seeds.push(r(), spacing, size, M);
      total++;
    }
  }
  geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(cols), 3));
  geo.setAttribute('iP', new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
  geo.setAttribute('iS', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4));
  geo.instanceCount = total;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: infinityTexture(256, 0.12, true) },
      uDissolveY: { value: 100 },
      uMask: { value: 1 },
      uAmount: { value: 0 },
      uBright: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 iCol; attribute vec4 iP; attribute vec4 iS;
      uniform float uTime; uniform float uDissolveY; uniform float uMask; uniform float uAmount;
      varying vec2 vUv; varying float vB; varying float vHead;
      void main(){
        float k = iP.x, speed = iP.y, phase = iP.z, L = iP.w;
        float spacing = iS.y, size = iS.z, M = iS.w;
        float d = mod(phase + uTime * speed - k * spacing, L);
        vec3 c = vec3(iCol.x, iCol.y - d, iCol.z);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        float trail = pow(1.0 - k / M, 1.6);
        float flick = 0.75 + 0.25 * sin(uTime * (7.0 + iS.x * 9.0) + iS.x * 40.0);
        float mask = mix(1.0, smoothstep(uDissolveY - 0.6, uDissolveY + 2.2, c.y), uMask);
        float topFade = 1.0 - smoothstep(20.0, 25.5, c.y);
        float near = smoothstep(0.6, 2.2, -mv.z);
        float far = exp(-max(0.0, -mv.z - 6.0) * 0.035);
        vB = trail * flick * mask * topFade * near * far * uAmount;
        vHead = step(k, 0.5);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uBright;
      varying vec2 vUv; varying float vB; varying float vHead;
      void main(){
        float a = texture2D(uMap, vUv).a;
        vec3 orange = vec3(1.0, 0.42, 0.12);
        vec3 hot = vec3(1.0, 0.78, 0.55);
        vec3 col = mix(orange * 2.2, hot * 4.0, vHead);
        gl_FragColor = vec4(col * a * vB * uBright, a * vB);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, uniforms: mat.uniforms };
}

// Partículas laranja que soltam dos personagens quando a borda da dissolução passa.
export function buildDissolveParticles(points, dissolveTimeAt, seed = 9) {
  const r = mulberry32(seed);
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const birth = new Float32Array(n);
  const sd = new Float32Array(n);
  points.forEach((p, i) => {
    pos.set(p, i * 3);
    vel.set([(r() - 0.5) * 0.9, 0.3 + r() * 1.2, (r() - 0.5) * 0.9], i * 3);
    birth[i] = dissolveTimeAt(p[1]) + (r() - 0.5) * 0.35;
    sd[i] = r();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uOn: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aVel; attribute float aBirth; attribute float aSeed;
      uniform float uTime; uniform float uScale; uniform float uOn;
      varying float vA; varying float vHot;
      void main(){
        float age = uTime - aBirth;
        if (age < 0.0 || uOn < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vHot = 0.0; return; }
        vec3 p = position + aVel * age + vec3(0.0, -0.9, 0.0) * age * age * 0.5;
        p.x += sin(age * 2.6 + aSeed * 6.28) * 0.12 * age;
        p.z += cos(age * 2.1 + aSeed * 3.1) * 0.12 * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.7, 2.6, age));
        vHot = 1.0 - smoothstep(0.0, 0.5, age);
        gl_PointSize = uScale * (0.025 + aSeed * 0.03) / max(0.3, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vHot;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        vec3 col = mix(vec3(1.0, 0.42, 0.12) * 2.5, vec3(1.0, 0.85, 0.6) * 5.0, vHot);
        gl_FragColor = vec4(col * a * vA, a * vA);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 11;
  return { mesh: pts, uniforms: mat.uniforms };
}

// Chuva comum (riscos finos) para o close molhado do plano 3.
export function buildRainStreaks({ count = 1800, seed = 13, box = [7, 5, 7] } = {}) {
  const r = mulberry32(seed);
  const base = new THREE.PlaneGeometry(0.006, 0.22);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) a.set([(r() - 0.5) * box[0] * 2, r() * box[1], (r() - 0.5) * box[2] * 2, 5.5 + r() * 3], i * 4);
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uH: { value: box[1] }, uAmt: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 iA; uniform float uTime; uniform vec3 uCenter; uniform float uH; uniform float uAmt;
      varying float vA; varying float vY;
      void main(){
        float y = mod(iA.y - uTime * iA.w, uH);
        vec3 c = uCenter + vec3(iA.x, y - 0.4, iA.z);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy;
        gl_Position = projectionMatrix * mv;
        vA = uAmt * smoothstep(0.3, 1.0, -mv.z);
        vY = uv.y;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vY;
      void main(){
        float a = vY * vA * 0.32;
        gl_FragColor = vec4(vec3(0.8, 0.86, 0.95) * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms: mat.uniforms };
}
