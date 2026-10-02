// La moto et son pilote, en low poly.
// Hiérarchie : root (position sur la route) > pitch (rotation autour de l'axe arrière)
//   > châssis, roues, pilote.

import * as THREE from 'three';
import { Builder, PALETTE as P } from './lowpoly.js';
import { TUNING } from './physics.js';
import { LANE_Z } from './world.js';

const R = TUNING.wheelRadius;
const WB = TUNING.wheelbase;
const HIP = new THREE.Vector3(0.42, 0.74, 0);

export class Bike {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.pitch = new THREE.Group();
    this.root.add(this.pitch);
    scene.add(this.root);

    this.pitch.add(makeChassis());
    this.rearWheel = makeWheel();
    this.frontWheel = makeWheel();
    this.frontWheel.position.x = WB;
    this.pitch.add(this.rearWheel, this.frontWheel);

    this.rider = makeRider();
    this.pitch.add(this.rider);

    this.wheelSpin = 0;
    this.riderVel = new THREE.Vector3();
    this.riderSpin = new THREE.Vector3();
    this.reset();
  }

  reset() {
    if (this.rider.parent !== this.pitch) this.pitch.add(this.rider);
    this.rider.position.copy(HIP);
    this.rider.rotation.set(0, 0, 0);
    this.riderFlying = false;
    this.bounce = 0;
    this.bounceV = 0;
  }

  update(s, dt) {
    // Petit rebond de suspension sur les bosses.
    if (s.bumpHit > 0.24) this.bounceV += 1.4;
    this.bounceV += (-this.bounce * 90 - this.bounceV * 9) * dt;
    this.bounce += this.bounceV * dt;

    // Sur le dos, la moto repose sur la selle et le guidon, pas dans le sol.
    const flip = s.phase === 'crashed' ? Math.max(0, -Math.cos(s.theta)) * 0.5 : 0;
    this.root.position.set(s.x, R + flip + Math.max(-0.03, this.bounce * 0.12), LANE_Z);
    this.pitch.rotation.z = s.theta;

    this.wheelSpin -= (s.v / R) * dt;
    this.rearWheel.rotation.z = this.wheelSpin;
    // En l'air, la roue avant ralentit doucement.
    if (s.theta > 0.02) this.frontSpinV = (this.frontSpinV ?? s.v / R) * Math.exp(-dt * 0.6);
    else this.frontSpinV = s.v / R;
    this.frontWheel.rotation.z -= this.frontSpinV * dt;

    if (s.phase === 'crashed') this.updateCrash(s, dt);
    else {
      // Le pilote se penche vers l'avant pour contrer le cabrage.
      const lean = -Math.min(0.5, s.theta * 0.35) + s.engine * -0.05;
      this.rider.rotation.z += (lean - this.rider.rotation.z) * Math.min(1, dt * 8);
    }
  }

  updateCrash(s, dt) {
    if (!this.riderFlying) {
      this.riderFlying = true;
      this.scene.attach(this.rider);
      this.riderVel.set(s.v * 0.55, 3.2, 0.6);
      this.riderSpin.set(0.6, 0.4, 5 + Math.random() * 3);
    }
    const r = this.rider;
    this.riderVel.y -= 9.8 * dt;
    r.position.addScaledVector(this.riderVel, dt);
    r.rotation.x += this.riderSpin.x * dt;
    r.rotation.y += this.riderSpin.y * dt;
    r.rotation.z += this.riderSpin.z * dt;
    const floor = 0.25;
    if (r.position.y < floor) {
      r.position.y = floor;
      this.riderVel.y = Math.abs(this.riderVel.y) * 0.35;
      this.riderVel.x *= 0.6;
      this.riderVel.z *= 0.6;
      this.riderSpin.multiplyScalar(0.55);
      if (this.riderVel.y < 0.4) this.riderVel.y = 0;
    }
  }

  // Positions monde utiles pour les particules.
  rearContact(out) {
    return out.set(this.root.position.x, 0.02, LANE_Z);
  }

  exhaust(out) {
    out.set(-0.25, 0.32, 0.2);
    return this.pitch.localToWorld(out);
  }
}

function makeWheel() {
  const g = new THREE.Group();
  const b = new Builder();
  const tire = new THREE.CylinderGeometry(R, R, 0.17, 10);
  tire.rotateX(Math.PI / 2);
  b.add(tire, '#26252c', { jitter: 0.12 });
  const rim = new THREE.CylinderGeometry(R * 0.66, R * 0.66, 0.19, 10);
  rim.rotateX(Math.PI / 2);
  b.add(rim, P.chrome, { jitter: 0.1 });
  // Rayons bien visibles pour voir la roue tourner
  for (let i = 0; i < 3; i++) {
    b.add(new THREE.BoxGeometry(R * 1.25, 0.05, 0.2), P.bike, { rot: [0, 0, (i * Math.PI) / 3], jitter: 0 });
  }
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 6);
  hub.rotateX(Math.PI / 2);
  b.add(hub, P.bikeDark);
  g.add(b.build());
  return g;
}

function makeChassis() {
  const b = new Builder();
  const dark = P.bikeDark;
  // Bras oscillant
  b.add(new THREE.BoxGeometry(0.62, 0.07, 0.08), dark, { pos: [0.3, 0.08, 0.1], rot: [0, 0, 0.22] });
  b.add(new THREE.BoxGeometry(0.62, 0.07, 0.08), dark, { pos: [0.3, 0.08, -0.1], rot: [0, 0, 0.22] });
  // Moteur
  b.add(new THREE.BoxGeometry(0.46, 0.36, 0.3), '#4a4a58', { pos: [0.72, 0.18, 0], rot: [0, 0, 0.1] });
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 6), '#5a5a6a', { pos: [0.66, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  // Cadre
  b.add(new THREE.BoxGeometry(0.75, 0.07, 0.07), dark, { pos: [0.85, 0.5, 0], rot: [0, 0, 0.45] });
  // Réservoir
  b.add(new THREE.BoxGeometry(0.5, 0.24, 0.34), P.bike, { pos: [0.9, 0.62, 0], rot: [0, 0, -0.12] });
  b.add(new THREE.BoxGeometry(0.42, 0.06, 0.36), '#ffffff', { pos: [0.92, 0.6, 0], rot: [0, 0, -0.12], jitter: 0 });
  // Selle et coque arrière
  b.add(new THREE.BoxGeometry(0.55, 0.09, 0.28), dark, { pos: [0.42, 0.66, 0], rot: [0, 0, 0.06] });
  b.add(new THREE.BoxGeometry(0.42, 0.14, 0.22), P.bike, { pos: [0.06, 0.66, 0], rot: [0, 0, 0.28] });
  b.add(new THREE.BoxGeometry(0.08, 0.06, 0.14), '#ff5a5f', { pos: [-0.15, 0.6, 0], jitter: 0 });
  // Garde-boue arrière
  b.add(new THREE.BoxGeometry(0.4, 0.04, 0.18), dark, { pos: [-0.05, 0.38, 0], rot: [0, 0, 0.6] });
  // Fourche
  for (const z of [-0.1, 0.1]) {
    b.add(new THREE.BoxGeometry(0.06, 0.9, 0.06), P.chrome, { pos: [WB - 0.1, 0.43, z], rot: [0, 0, 0.24] });
  }
  b.add(new THREE.BoxGeometry(0.1, 0.06, 0.28), dark, { pos: [WB - 0.2, 0.86, 0], rot: [0, 0, 0.24] });
  // Garde-boue avant
  b.add(new THREE.BoxGeometry(0.42, 0.04, 0.18), P.bike, { pos: [WB, 0.4, 0], rot: [0, 0, -0.1] });
  // Guidon
  b.add(new THREE.BoxGeometry(0.06, 0.06, 0.62), dark, { pos: [WB - 0.26, 0.97, 0] });
  // Phare et plaque
  const light = new THREE.CylinderGeometry(0.09, 0.11, 0.08, 7);
  light.rotateZ(Math.PI / 2);
  b.add(light, '#fff4c2', { pos: [WB - 0.08, 0.8, 0], jitter: 0 });
  b.add(new THREE.BoxGeometry(0.06, 0.24, 0.22), P.bike, { pos: [WB - 0.14, 0.82, 0], rot: [0, 0, 0.24] });
  // Pot d'échappement
  const pipe = new THREE.CylinderGeometry(0.06, 0.07, 0.62, 6);
  pipe.rotateZ(Math.PI / 2 - 0.25);
  b.add(pipe, P.chrome, { pos: [0.05, 0.36, 0.2] });
  b.add(new THREE.BoxGeometry(0.5, 0.04, 0.04), P.chrome, { pos: [0.55, 0.12, 0.2], rot: [0, 0, 0.3] });
  // Repose-pieds
  b.add(new THREE.BoxGeometry(0.06, 0.04, 0.5), dark, { pos: [0.5, 0.26, 0] });
  return b.build();
}

// Pilote : origine au niveau des hanches pour pouvoir le pencher.
function makeRider() {
  const g = new THREE.Group();
  const b = new Builder();
  const o = (x, y) => [x - HIP.x, y - HIP.y];
  for (const z of [-0.15, 0.15]) {
    // Cuisse et tibia
    b.add(new THREE.BoxGeometry(0.44, 0.15, 0.14), P.rider, { pos: [...o(0.62, 0.7), z], rot: [0, 0, -0.25] });
    b.add(new THREE.BoxGeometry(0.13, 0.42, 0.13), P.rider, { pos: [...o(0.7, 0.46), z], rot: [0, 0, -0.55] });
    b.add(new THREE.BoxGeometry(0.2, 0.08, 0.12), P.bikeDark, { pos: [...o(0.56, 0.27), z] });
    // Bras
    b.add(new THREE.BoxGeometry(0.5, 0.11, 0.11), P.rider, { pos: [...o(0.9, 1.06), z * 1.4], rot: [0, 0, -0.55] });
    b.add(new THREE.BoxGeometry(0.09, 0.09, 0.09), P.bikeDark, { pos: [...o(1.13, 0.96), z * 1.7] });
  }
  // Torse (blouson)
  b.add(new THREE.BoxGeometry(0.26, 0.56, 0.38), P.rider, { pos: o(0.56, 1.0), rot: [0, 0, -0.42] });
  b.add(new THREE.BoxGeometry(0.27, 0.12, 0.39), P.bike, { pos: o(0.6, 1.02), rot: [0, 0, -0.42], jitter: 0 });
  // Casque
  b.add(new THREE.IcosahedronGeometry(0.18, 0), P.helmet, { pos: o(0.8, 1.42), jitter: 0.05 });
  b.add(new THREE.BoxGeometry(0.1, 0.1, 0.26), P.visor, { pos: o(0.93, 1.42), jitter: 0 });
  b.add(new THREE.BoxGeometry(0.2, 0.04, 0.3), P.bike, { pos: o(0.78, 1.55), jitter: 0 });
  const mesh = b.build();
  g.add(mesh);
  return g;
}
