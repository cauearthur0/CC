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
