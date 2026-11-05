import * as THREE from 'three';
import { vox, buildGames } from './games.js';
import { mulberry32 } from './util.js';

// O mundo colorido atrás da parede (plano final): céu quente, ilhas flutuantes com mundos de jogo.
export function buildOutside(center) {
  const group = new THREE.Group();
  group.visible = false;
  const skyGeo = new THREE.SphereGeometry(70, 48, 24);
  const col = new Float32Array(skyGeo.attributes.position.count * 3);
  const top = new THREE.Color(0x4fc3f7);
  const mid = new THREE.Color(0xffb36b);
  const low = new THREE.Color(0xff7a2e);
  const tmp = new THREE.Color();
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 70;
    if (y > 0.05) tmp.copy(mid).lerp(top, Math.min(1, (y - 0.05) / 0.55));
    else tmp.copy(mid).lerp(low, Math.min(1, (0.05 - y) / 0.5));
    col.set([tmp.r * 1.25, tmp.g * 1.25, tmp.b * 1.25], i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  sky.position.set(center.x, 2, center.z + 10);
  group.add(sky);

  const r = mulberry32(77);
  const islands = [];
  const games = [...buildGames(), ...buildGames()];
  const spots = [
    [-3.2, 2.6, 9],
    [3.6, 1.4, 8],
    [0.4, 4.2, 12],
    [-6.5, 0.9, 13],
    [6.8, 3.6, 13],
    [-2.0, -0.2, 7.2],
    [2.2, 5.6, 16],
    [-5.0, 5.0, 17],
    [8.5, 0.6, 18],
    [-9.0, 3.0, 19],
  ];
  spots.forEach(([x, y, z], i) => {
    const isl = new THREE.Group();
    const s = 0.9 + r() * 0.6;
    isl.add(
      vox(
        (V) => {
          for (let yy = 0; yy < 6; yy++) {
            const rad = 7.5 - yy * 1.1;
            for (let xx = -8; xx < 8; xx++)
              for (let zz = -8; zz < 8; zz++) if (xx * xx + zz * zz < rad * rad) V.set(xx, -yy, zz, yy === 0 ? (r() < 0.5 ? 0x5fd068 : 0x4cbf5a) : yy < 2 ? 0x8b5a2b : 0x6d4422);
          }
        },
        0.07 * s,
        [0, 0, 0]
      )
    );
    const g = games[i % games.length];
    g.group.scale.setScalar(2.2 * s);
    g.group.position.y = 0.08 * s;
    isl.add(g.group);
    isl.position.set(center.x + x, y, center.z + z);
    isl.rotation.y = (r() - 0.5) * 1.2;
    isl.userData = { y, ph: r() * 6, g };
    group.add(isl);
    islands.push(isl);
  });
  // nuvenzinhas de voxel
  for (let i = 0; i < 9; i++) {
    const c = vox(
      (V) => {
        for (let k = 0; k < 5; k++) {
          const cx = Math.floor(r() * 6);
          const cz = Math.floor(r() * 3);
          V.box(cx, 0, cz, cx + 2, 1, cz + 1, 0xffffff);
        }
      },
      0.18,
      [4, 0, 2]
    );
    c.position.set(center.x + (r() - 0.5) * 26, 4 + r() * 5, center.z + 14 + r() * 14);
    group.add(c);
  }
  function update(t) {
    for (const isl of islands) {
      isl.position.y = isl.userData.y + Math.sin(t * 0.8 + isl.userData.ph) * 0.12;
      isl.userData.g.update(t + isl.userData.ph);
    }
  }
  return { group, update };
}
