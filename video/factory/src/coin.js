import * as THREE from 'three';
import { mulberry32, clamp, smooth } from './util.js';

// Moeda que racha como um ovo: rachaduras laranja acendem, ela treme e estoura em 8 cacos.
export function buildCrackCoin() {
  const group = new THREE.Group();
  const R = 0.07;
  const H = 0.014;
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.25 });
  const wedges = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(R, R, H, 6, 1, false, th, (Math.PI * 2) / n);
    const m = new THREE.Mesh(g, gold);
    m.castShadow = true;
    m.userData.dir = new THREE.Vector3(Math.sin(th + Math.PI / n), 0, Math.cos(th + Math.PI / n));
    group.add(m);
    wedges.push(m);
  }
  // rachaduras: linhas em zigue-zague nas duas faces, brilho laranja
  const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.15).multiplyScalar(4), transparent: true });
  const cracks = [];
  const r = mulberry32(17);
  for (let c = 0; c < 5; c++) {
    let a = r() * Math.PI * 2;
    let p = new THREE.Vector2(0, 0);
    for (let k = 0; k < 4; k++) {
      const len = R * (0.22 + r() * 0.12);
      a += (r() - 0.5) * 1.3;
      const q = p.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(len));
      if (q.length() > R * 0.97) break;
      for (const face of [1, -1]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.002, 0.0035), crackMat);
        seg.position.set((p.x + q.x) / 2, (face * H) / 2 + face * 0.0012, (p.y + q.y) / 2);
        seg.rotation.y = -Math.atan2(q.y - p.y, q.x - p.x);
        seg.userData.order = c * 4 + k;
        group.add(seg);
        cracks.push(seg);
      }
      p = q;
    }
  }
  const light = new THREE.PointLight(0xff8a3d, 0, 1.2, 2);
  group.add(light);
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,210,1)');
    gr.addColorStop(0.3, 'rgba(255,150,60,0.6)');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.visible = false;
  group.add(flash);

  // k: 0..1 progresso da rachadura; a: segundos depois do pop (negativo antes)
  function update(t, crack0, crack1, pop) {
    const k = clamp((t - crack0) / (crack1 - crack0));
    const a = t - pop;
    const shake = k > 0 && a < 0 ? k * k * 0.25 : 0;
    group.rotation.z = Math.sin(t * 61) * shake * 0.5;
    group.rotation.x = Math.sin(t * 47) * shake * 0.3;
    const shown = Math.floor(k * cracks.length * 0.5 + 0.0001) * 2;
    cracks.forEach((c, i) => {
      c.visible = a < 0 && i < shown;
    });
    crackMat.opacity = 0.8 + 0.2 * Math.sin(t * 30);
    light.intensity = a < 0 ? k * 0.5 : Math.max(0, 0.9 - a * 2);
    wedges.forEach((w) => {
      if (a < 0) {
        w.position.set(0, 0, 0);
        w.rotation.set(0, 0, 0);
        w.scale.setScalar(1);
        w.visible = true;
      } else {
        const d = w.userData.dir;
        w.position.set(d.x * a * 0.9, a * 0.5 - 2.2 * a * a, d.z * a * 0.9);
        w.rotation.set(d.z * a * 14, 0, -d.x * a * 14);
        w.scale.setScalar(Math.max(0, 1 - a / 0.5));
        w.visible = a < 0.5;
      }
    });
    flash.visible = a > -0.02 && a < 0.35;
    if (flash.visible) {
      const f = clamp((a + 0.02) / 0.37);
      flash.scale.setScalar(0.12 + f * 0.6);
      flash.material.opacity = 1 - smooth(f);
    }
  }
  return { group, update, wedges };
}
