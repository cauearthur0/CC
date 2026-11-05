// trechos GLSL compartilhados
export const NOISE = /* glsl */ `
float dhash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dhash3(i+vec3(0,0,0)),dhash3(i+vec3(1,0,0)),f.x),
                 mix(dhash3(i+vec3(0,1,0)),dhash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dhash3(i+vec3(0,0,1)),dhash3(i+vec3(1,0,1)),f.x),
                 mix(dhash3(i+vec3(0,1,1)),dhash3(i+vec3(1,1,1)),f.x),f.y), f.z);
}
`;

// Dissolução de cima para baixo com borda laranja incandescente (plano 4).
export function makeDissolve() {
  const uniforms = {
    uDissolveY: { value: 100 },
    uDissolveOn: { value: 0 },
  };
  const patch = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDissolveY = uniforms.uDissolveY;
      sh.uniforms.uDissolveOn = uniforms.uDissolveOn;
      sh.vertexShader =
        'varying vec3 vDW;\n' +
        sh.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 dwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            dwp = instanceMatrix * dwp;
          #endif
          vDW = (modelMatrix * dwp).xyz;`
        );
      sh.fragmentShader =
        'varying vec3 vDW;\nuniform float uDissolveY;\nuniform float uDissolveOn;\n' +
        NOISE +
        sh.fragmentShader
          .replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            float dn = vnoise(vDW * 2.1) * 0.9 + vnoise(vDW * 6.5) * 0.4;
            float dd = vDW.y - (uDissolveY + dn * 1.4);
            if (uDissolveOn > 0.5 && dd > 0.0) discard;
            float dEdge = uDissolveOn * (1.0 - smoothstep(0.0, 0.3, -dd));`
          )
          .replace(
            '#include <opaque_fragment>',
            `outgoingLight = mix(outgoingLight, vec3(1.0, 0.42, 0.12) * 7.0, dEdge);
            #include <opaque_fragment>`
          );
    };
    mat.customProgramCacheKey = () => 'dissolve-' + mat.type;
    return mat;
  };
  return { uniforms, patch };
}

// Mundo cinza com "bolha de cor": fora do raio tudo fica cinza-azulado; dentro, cor real.
// A borda da bolha brilha laranja quando ela cresce (a cor "estoura" a partir do Loopy).
export function makeColorize() {
  const uniforms = {
    uColC: { value: null },
    uColR: { value: 0 },
    uColG: { value: 0 },
    uColEdge: { value: 0 },
  };
  const patch = (mat, satOut = 0.1) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.uniforms.uSatOut = { value: satOut };
      sh.vertexShader =
        'varying vec3 vCW;\n' +
        sh.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 cwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cwp = instanceMatrix * cwp;
          #endif
          vCW = (modelMatrix * cwp).xyz;`
        );
      sh.fragmentShader =
        'varying vec3 vCW;\nuniform vec3 uColC;\nuniform float uColR;\nuniform float uColG;\nuniform float uColEdge;\nuniform float uSatOut;\n' +
        sh.fragmentShader.replace(
          '#include <opaque_fragment>',
          `{
            float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
            vec3 grey = vec3(lum) * vec3(0.92, 0.97, 1.07);
            float d = distance(vCW, uColC);
            float inside = 1.0 - smoothstep(uColR * 0.8, uColR, d);
            float m = max(uColG, inside);
            vec3 outside = mix(grey, outgoingLight, uSatOut);
            float edge = smoothstep(uColR * 0.72, uColR * 0.9, d) * (1.0 - smoothstep(uColR * 0.9, uColR * 1.02, d));
            outgoingLight = mix(outside, outgoingLight, m) + vec3(1.0, 0.45, 0.15) * edge * uColEdge * (1.0 - uColG);
          }
          #include <opaque_fragment>`
        );
    };
    mat.customProgramCacheKey = () => 'colorize-' + mat.type + '-' + satOut;
    return mat;
  };
  return { uniforms, patch };
}
