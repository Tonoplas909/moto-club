// Particules low poly : poussière sous la roue arrière, fumée d'échappement.

import * as THREE from 'three';

export class Particles {
  constructor(scene, count = 70) {
    this.items = [];
    const geo = new THREE.TetrahedronGeometry(0.12, 0);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: '#d9c3a0', flatShading: true, transparent: true });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.items.push({ mesh: m, life: 0, max: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3(), grow: 1 });
    }
    this.next = 0;
  }

  emit(pos, vel, { color = '#d9c3a0', life = 0.8, size = 1, grow = 2 } = {}) {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.mesh.position.copy(pos);
    p.mesh.material.color.set(color);
    p.mesh.scale.setScalar(size);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    p.mesh.visible = true;
    p.vel.copy(vel);
    p.spin.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
    p.life = p.max = life;
    p.size = size;
    p.grow = grow;
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.vel.multiplyScalar(Math.exp(-dt * 2.5));
      p.vel.y += 0.4 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(p.size * (1 + t * p.grow));
      p.mesh.material.opacity = 1 - t;
    }
  }

  clear() {
    for (const p of this.items) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }
}
