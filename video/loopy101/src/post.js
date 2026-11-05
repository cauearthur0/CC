import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Correção de cor final (em espaço de tela): saturação, contraste, tinta, vinheta,
// grão de filme, fade para branco/preto e leve aberração nas bordas.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uSeed: { value: 0 },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: 0 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.04 },
    uWhite: { value: 0 },
    uBlack: { value: 0 },
    uAberr: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uSeed;
    uniform float uSat, uContrast, uLift, uVignette, uGrain, uWhite, uBlack, uAberr;
    uniform vec3 uTint;
    varying vec2 vUv;
    float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 d = vUv - 0.5;
      vec2 off = d * uAberr * length(d) * 2.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      c += uLift * (1.0 - c);
      vec2 dv = d; dv.x *= uRes.x / uRes.y;
      float v = smoothstep(1.05, 0.25, length(dv));
      c *= mix(1.0, v, uVignette);
      float g = h(vUv * uRes + uSeed * 37.0) + h(vUv * uRes * 1.37 + uSeed * 11.0) - 1.0;
      c += g * uGrain * (0.35 + 0.65 * (1.0 - l));
      c = mix(c, vec3(1.0), uWhite);
      c = mix(c, vec3(0.0), uBlack);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function buildPost(renderer, W, H, scene, camera) {
  const samples = +(new URLSearchParams(location.search).get('samples') ?? 0);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  const render = new RenderPass(scene, camera);
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.002, maxblur: 0.01 });
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.55, 0.9);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.set(W, H);
  composer.addPass(render);
  composer.addPass(bokeh);
  composer.addPass(bloom);
  composer.addPass(output);
  const aa = new URLSearchParams(location.search).get('aa') ?? 'smaa';
  if (aa === 'smaa') {
    const smaa = new SMAAPass();
    smaa.setSize(W, H);
    composer.addPass(smaa);
  }
  composer.addPass(grade);

  function apply(p) {
    render.scene = p.scene;
    render.camera = p.camera;
    bokeh.scene = p.scene;
    bokeh.camera = p.camera;
    bokeh.enabled = !!p.dof;
    if (p.dof) {
      bokeh.uniforms.focus.value = p.dof.focus;
      bokeh.uniforms.aperture.value = p.dof.aperture;
      bokeh.uniforms.maxblur.value = p.dof.maxblur ?? 0.012;
    }
    bloom.strength = p.bloom?.strength ?? 0.5;
    bloom.radius = p.bloom?.radius ?? 0.55;
    bloom.threshold = p.bloom?.threshold ?? 0.9;
    const g = p.grade || {};
    const u = grade.uniforms;
    u.uSat.value = g.sat ?? 1;
    u.uContrast.value = g.contrast ?? 1;
    u.uTint.value.set(...(g.tint ?? [1, 1, 1]));
    u.uLift.value = g.lift ?? 0;
    u.uVignette.value = g.vignette ?? 0.3;
    u.uGrain.value = g.grain ?? 0.04;
    u.uWhite.value = g.white ?? 0;
    u.uBlack.value = g.black ?? 0;
    u.uAberr.value = g.aberr ?? 0.0015;
    u.uSeed.value = p.seed ?? 0;
  }

  return { composer, apply, passes: { render, bokeh, bloom, output, grade } };
}
