import * as THREE from 'three';
import { VoxelGrid, meshVoxels, mulberry32 } from './util.js';

// Mini mundos de voxel (16 x 16 de base) que vivem dentro dos cubos de vidro das prateleiras.
// anim: 1 pula, 2 desliza para os lados, 3 balança. Glow = emissivo (acende com o bloom).

export const N = 16;

function base(V, top, side, r, bumps = 0) {
  for (let x = 0; x < N; x++)
    for (let z = 0; z < N; z++) {
      V.set(x, 0, z, side);
      V.set(x, 1, z, top);
      if (bumps && r() < bumps) V.set(x, 2, z, top);
    }
}

const builders = {
  kitchen(V, r) {
    for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) V.set(x, 0, z, (x + z) % 2 ? 0xf1ece4 : 0xd8433b);
    // balcões no fundo
    V.box(0, 1, 0, 15, 3, 2, 0xb7bcc4);
    V.box(0, 4, 0, 15, 4, 2, 0xe9ecef);
    // fogão com chamas
    V.box(9, 4, 0, 13, 4, 2, 0x2b2e33);
    for (const x of [10, 12]) V.set(x, 5, 1, 0xff7a2e, true, 1);
    V.box(2, 5, 1, 4, 6, 1, 0x9aa0a7); // panela
    V.set(3, 7, 1, 0xffe1a0, true, 1);
    // geladeira
    V.box(0, 1, 13, 2, 8, 15, 0xdfe3e8);
    V.box(2, 5, 13, 2, 5, 13, 0x22d3ee, true);
    // robô cozinheiro (desliza)
    V.box(6, 1, 7, 8, 4, 8, 0xc9ced6, false, 2);
    V.box(6, 5, 7, 8, 6, 8, 0xaeb4bd, false, 2);
    V.box(6, 6, 9, 8, 6, 9, 0x22d3ee, true, 2);
    V.box(6, 7, 7, 8, 8, 8, 0xffffff, false, 2);
    V.box(5, 9, 6, 9, 9, 9, 0xffffff, false, 2);
    V.box(5, 3, 7, 5, 4, 7, 0xaeb4bd, false, 2);
    V.box(9, 3, 7, 9, 4, 7, 0xaeb4bd, false, 2);
    // mesa central
    V.box(5, 1, 11, 10, 2, 12, 0x8a5a3c);
    V.set(6, 3, 11, 0xffd166);
    V.set(9, 3, 12, 0x6ee7b7);
  },
  rooftop(V, r) {
    base(V, 0x2a2f3a, 0x1c2029, r);
    for (let i = 0; i < N; i++) {
      V.set(i, 2, 0, 0x3a4150);
      V.set(i, 2, N - 1, 0x3a4150);
      V.set(0, 2, i, 0x3a4150);
      V.set(N - 1, 2, i, 0x3a4150);
    }
    // letreiros de neon (barras, sem letras)
    V.box(1, 3, 0, 6, 3, 0, 0xff3df2, true);
    V.box(1, 5, 0, 4, 5, 0, 0x22d3ee, true);
    V.box(9, 4, 15, 14, 4, 15, 0x22d3ee, true);
    V.box(0, 4, 8, 0, 7, 8, 0xff7a2e, true);
    // caixa d'água
    for (const [x, z] of [
      [10, 3],
      [13, 3],
      [10, 6],
      [13, 6],
    ])
      V.box(x, 2, z, x, 5, z, 0x5a4636);
    V.box(10, 6, 3, 13, 9, 6, 0x7a5a42);
    V.box(11, 10, 4, 12, 10, 5, 0x5a4636);
    // antena com luz
    V.box(3, 2, 12, 3, 9, 12, 0x8e96a3);
    V.set(3, 10, 12, 0xff3b3b, true);
    // pombo cibernético (pula)
    V.box(6, 2, 8, 7, 3, 10, 0x9aa3b0, false, 1);
    V.box(6, 4, 10, 7, 5, 11, 0xb8c0cc, false, 1);
    V.box(6, 5, 11, 7, 5, 11, 0x22d3ee, true, 1);
    V.set(8, 3, 9, 0x7c8592, false, 1);
    V.set(5, 3, 9, 0x7c8592, false, 1);
    V.set(6, 4, 12, 0xff9f43, false, 1);
    V.set(7, 4, 12, 0xff9f43, false, 1);
  },
  desert(V, r) {
    for (let x = 0; x < N; x++)
      for (let z = 0; z < N; z++) {
        const h = 1 + Math.round(1.4 + Math.sin(x * 0.5) * 0.9 + Math.cos(z * 0.45 + 1) * 0.8);
        for (let y = 0; y <= h; y++) V.set(x, y, z, y === h ? 0xf2c46d : 0xd99a4e);
      }
    for (const [x, z] of [
      [2, 3],
      [13, 11],
    ]) {
      V.box(x, 3, z, x, 7, z, 0x3f9b55);
      V.box(x - 1, 5, z, x - 1, 6, z, 0x3f9b55);
      V.box(x + 1, 4, z, x + 1, 5, z, 0x3f9b55);
    }
    // dois tanques
    V.box(4, 4, 7, 7, 5, 10, 0x6b7a3d, false, 2);
    V.box(5, 6, 8, 6, 6, 9, 0x56632f, false, 2);
    V.box(7, 6, 8, 9, 6, 8, 0x56632f, false, 2);
    V.box(10, 4, 4, 12, 5, 6, 0x8a6a3d);
    V.box(10, 6, 5, 11, 6, 5, 0x6e5530);
    // explosões laranja (pulam)
    V.box(9, 6, 9, 10, 7, 10, 0xff7a2e, true, 1);
    V.set(9, 8, 10, 0xffd166, true, 1);
    V.set(3, 6, 12, 0xff7a2e, true, 1);
  },
  ring(V, r) {
    base(V, 0x1d2230, 0x151924, r);
    V.box(2, 2, 2, 13, 3, 13, 0x2f6fd6);
    V.box(2, 4, 2, 13, 4, 13, 0x3b82f6);
    for (const [x, z, c] of [
      [2, 2, 0xef4444],
      [13, 13, 0x3b82f6],
      [2, 13, 0xffffff],
      [13, 2, 0xffffff],
    ])
      V.box(x, 5, z, x, 9, z, c);
    for (const y of [6, 8]) {
      for (let i = 3; i < 13; i++) {
        V.set(i, y, 2, 0xff5a5a, true);
        V.set(i, y, 13, 0xff5a5a, true);
        V.set(2, y, i, 0xffffff, true);
        V.set(13, y, i, 0xffffff, true);
      }
    }
    // lutadores (pulam)
    V.box(5, 5, 6, 6, 8, 7, 0xef4444, false, 1);
    V.box(5, 9, 6, 6, 10, 7, 0xf6c7a0, false, 1);
    V.box(9, 5, 8, 10, 8, 9, 0x3b82f6, false, 1);
    V.box(9, 9, 8, 10, 10, 9, 0xc68a5a, false, 1);
    V.set(7, 7, 6, 0xef4444, false, 1);
    V.set(8, 7, 9, 0x3b82f6, false, 1);
    // refletores
    V.set(0, 12, 0, 0xfff3c4, true);
    V.set(15, 12, 15, 0xfff3c4, true);
  },
  castle(V, r) {
    for (let x = 0; x < N; x++)
      for (let z = 0; z < N; z++) {
        const river = Math.abs(x - 5 - Math.round(Math.sin(z * 0.4) * 1.5)) <= 1;
        V.set(x, 0, z, 0x6b4a2f);
        V.set(x, 1, z, river ? 0x22d3ee : 0x58b35a, river);
      }
    // castelo
    V.box(9, 2, 4, 14, 5, 10, 0xb9bec6);
    for (const [x, z] of [
      [9, 4],
      [14, 4],
      [9, 10],
      [14, 10],
    ]) {
      V.box(x, 6, z, x, 9, z, 0xa3a9b2);
      V.set(x, 10, z, 0xef4444);
    }
    V.box(11, 2, 3, 12, 4, 3, 0x3b2a1e);
    V.set(11, 7, 7, 0xffd166, true);
    // árvores
    for (const [x, z] of [
      [1, 2],
      [2, 12],
      [8, 14],
      [1, 7],
    ]) {
      V.box(x, 2, z, x, 3, z, 0x7a4f2c);
      V.box(x - 1, 4, z - 1, x + 1, 5, z + 1, 0x3f9b55);
      V.set(x, 6, z, 0x58b35a);
    }
  },
  space(V, r) {
    base(V, 0x141a33, 0x0d1124, r);
    for (let i = 0; i < 22; i++) V.set(Math.floor(r() * N), 2 + Math.floor(r() * 12), Math.floor(r() * N), 0xffffff, true);
    // planetas
    const sphere = (cx, cy, cz, rad, c, glow) => {
      for (let x = -rad; x <= rad; x++)
        for (let y = -rad; y <= rad; y++)
          for (let z = -rad; z <= rad; z++) if (x * x + y * y + z * z <= rad * rad + 0.5) V.set(cx + x, cy + y, cz + z, c, glow);
    };
    sphere(4, 9, 4, 2, 0xff7a2e, true);
    sphere(12, 6, 11, 1, 0x22d3ee, true);
    V.box(10, 9, 3, 14, 9, 3, 0x9b8cff, true);
    // nave (desliza)
    V.box(6, 5, 9, 9, 5, 10, 0xe5e7eb, false, 2);
    V.box(7, 6, 9, 8, 6, 10, 0x22d3ee, true, 2);
    V.box(5, 5, 9, 5, 5, 10, 0xff7a2e, true, 2);
  },
  racing(V, r) {
    base(V, 0x4caf50, 0x2f6b33, r);
    for (let x = 0; x < N; x++)
      for (let z = 0; z < N; z++) {
        const dx = (x - 7.5) / 6.5;
        const dz = (z - 7.5) / 5.2;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.62 && d < 1.0) V.set(x, 2, z, 0x4b5563);
        else if (d >= 1.0 && d < 1.12) V.set(x, 2, z, (x + z) % 2 ? 0xffffff : 0xef4444);
      }
    V.box(1, 3, 7, 1, 7, 7, 0xe5e7eb);
    V.box(4, 3, 7, 4, 7, 7, 0xe5e7eb);
    V.box(1, 8, 7, 4, 8, 7, 0xff7a2e, true);
    // carrinho (desliza)
    V.box(9, 3, 2, 11, 3, 3, 0xef4444, false, 2);
    V.box(10, 4, 2, 10, 4, 3, 0x22d3ee, true, 2);
    V.box(6, 3, 13, 7, 3, 14, 0xffd166, false, 2);
  },
  snow(V, r) {
    base(V, 0xf3f7fb, 0xc9d6e3, r, 0.1);
    // iglu
    for (let x = -3; x <= 3; x++) for (let y = 0; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      const d = Math.sqrt(x * x + y * y * 1.4 + z * z);
      if (d <= 3.2 && d >= 2.2) V.set(9 + x, 2 + y, 9 + z, 0xe6eef7);
    }
    V.box(9, 2, 12, 9, 3, 12, 0x6b7f95);
    // pinheiros
    for (const [x, z] of [
      [2, 3],
      [4, 12],
      [13, 2],
    ]) {
      V.box(x, 2, z, x, 3, z, 0x6d4b2f);
      V.box(x - 1, 4, z - 1, x + 1, 5, z + 1, 0x1f6b45);
      V.set(x, 6, z, 0x1f6b45);
    }
    // aurora
    V.box(0, 12, 0, 15, 12, 0, 0x7cf7d4, true);
    V.box(2, 13, 0, 12, 13, 0, 0xa78bfa, true);
    // pinguim (pula)
    V.box(5, 2, 7, 6, 4, 7, 0x1f2937, false, 1);
    V.box(5, 2, 8, 6, 3, 8, 0xffffff, false, 1);
    V.set(5, 4, 8, 0xff9f43, false, 1);
  },
};

export const TYPES = Object.keys(builders);

// Base de cor média de cada tipo (para a versão distante, bem simples)
export const LO_COLORS = {
  kitchen: [0xd8433b, 0xb7bcc4, 0xff7a2e],
  rooftop: [0x2a2f3a, 0xff3df2, 0x22d3ee],
  desert: [0xf2c46d, 0x6b7a3d, 0xff7a2e],
  ring: [0x1d2230, 0x3b82f6, 0xff5a5a],
  castle: [0x58b35a, 0xb9bec6, 0x22d3ee],
  space: [0x141a33, 0xe5e7eb, 0xff7a2e],
  racing: [0x4caf50, 0x4b5563, 0xff7a2e],
  snow: [0xf3f7fb, 0x1f6b45, 0x7cf7d4],
};

export function buildDioramaGeometries(voxel) {
  const out = {};
  TYPES.forEach((name, i) => {
    const V = new VoxelGrid();
    builders[name](V, mulberry32(100 + i));
    const off = [-N / 2, 0, -N / 2];
    out[name] = {
      solid: meshVoxels(V, voxel, off, (v) => !v.glow),
      glow: meshVoxels(V, voxel, off, (v) => v.glow),
    };
  });
  return out;
}

// Material com animação por instância (pulo / deslize) e brilho que pulsa.
export function dioramaMaterials(timeUniform) {
  const anim = /* glsl */ `
    attribute float aAnim;
    uniform float uTime;
  `;
  const animBody = /* glsl */ `
    float iid = float(gl_InstanceID);
    float ph = fract(sin(iid * 12.9898) * 43758.5453) * 6.28;
    if (aAnim > 0.5 && aAnim < 1.5) transformed.y += abs(sin(uTime * 5.0 + ph)) * 0.03;
    if (aAnim > 1.5 && aAnim < 2.5) transformed.x += sin(uTime * 1.6 + ph) * 0.09;
  `;
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  solid.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader = anim + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + animBody);
  };
  solid.customProgramCacheKey = () => 'dio-solid';
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader =
      anim + 'varying float vPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + animBody + '\nvPulse = 0.75 + 0.35 * sin(uTime * 3.0 + ph + position.x * 30.0);');
    sh.fragmentShader = 'varying float vPulse;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 4.0 * vPulse;\n#include <opaque_fragment>');
  };
  glow.customProgramCacheKey = () => 'dio-glow';
  return { solid, glow };
}
