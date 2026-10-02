// Le décor : ciel, lumières, et une route infinie découpée en tronçons
// régénérés au fil de la progression.

import * as THREE from 'three';
import { Builder, PALETTE as P } from './lowpoly.js';
import { hash, bumpAtCell } from './track.js';
import { mulberry32 } from './physics.js';

const CHUNK = 80;
const BEHIND = 1;
const AHEAD = 4;
export const ROAD_HALF = 2.6;
export const LANE_Z = 1.2;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();

    scene.fog = new THREE.Fog(P.skyHorizon, 70, 300);
    scene.background = new THREE.Color(P.skyHorizon);

    this.sky = makeSky();
    scene.add(this.sky);

    const hemi = new THREE.HemisphereLight('#ffe9d6', '#6b7a52', 1.4);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight('#ffd7a8', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sunOffset = new THREE.Vector3(-18, 30, 22);
    scene.add(this.sun, this.sun.target);
  }

  update(x) {
    const current = Math.floor(x / CHUNK);
    for (let i = current - BEHIND; i <= current + AHEAD; i++) {
      if (!this.chunks.has(i)) {
        const c = makeChunk(i);
        this.chunks.set(i, c);
        this.scene.add(c);
      }
    }
    for (const [i, c] of this.chunks) {
      if (i < current - BEHIND || i > current + AHEAD) {
        this.scene.remove(c);
        c.traverse((o) => o.geometry && o.geometry.dispose());
        this.chunks.delete(i);
      }
    }
    this.sky.position.x = x;
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, this.sunOffset.z);
    this.sun.target.position.set(x + 3, 0, 0);
  }

  reset() {
    for (const [, c] of this.chunks) {
      this.scene.remove(c);
      c.traverse((o) => o.geometry && o.geometry.dispose());
    }
    this.chunks.clear();
  }
}

function makeSky() {
  const g = new THREE.SphereGeometry(600, 18, 12);
  const pos = g.attributes.position;
  const colors = [];
  const top = new THREE.Color(P.skyTop);
  const mid = new THREE.Color(P.skyMid);
  const hor = new THREE.Color(P.skyHorizon);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 600;
    if (t < 0.05) c.copy(hor);
    else if (t < 0.35) c.copy(hor).lerp(mid, (t - 0.05) / 0.3);
    else c.copy(mid).lerp(top, Math.min(1, (t - 0.35) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(38, 7),
    new THREE.MeshBasicMaterial({ color: '#fff1c9', fog: false }),
  );
  sun.position.set(-120, 70, -560);
  sky.add(sun);
  return sky;
}

// Hauteur du terrain : plate près de la route, vallonnée au loin.
function groundHeight(x, z) {
  const d = Math.abs(z) - (ROAD_HALF + 1.5);
  if (d <= 0) return -0.06;
  const amp = z < 0 ? Math.min(6, d * 0.12) : Math.min(1.2, d * 0.08);
  const n =
    Math.sin(x * 0.05 + z * 0.11) * 0.5 +
    Math.sin(x * 0.13 - z * 0.07 + 1.7) * 0.3 +
    (hash(Math.round(x), Math.round(z)) - 0.5) * 0.4;
  return -0.06 + amp * (0.6 + n);
}

function makeChunk(index) {
  const x0 = index * CHUNK;
  const rand = mulberry32(index * 9973 + 17);
  const group = new THREE.Group();

  // --- Sol ---
  const ground = new THREE.PlaneGeometry(CHUNK, 200, CHUNK / 4, 50);
  ground.rotateX(-Math.PI / 2);
  ground.translate(x0 + CHUNK / 2, 0, -70);
  const gp = ground.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, groundHeight(gp.getX(i), gp.getZ(i)));
  const groundB = new Builder(rand);
  groundB.add(ground, P.grass, { jitter: 0.12 });
  // Bas-côtés en terre
  groundB.add(new THREE.BoxGeometry(CHUNK, 0.1, 0.9), P.dirt, { pos: [x0 + CHUNK / 2, -0.07, ROAD_HALF + 0.45] });
  groundB.add(new THREE.BoxGeometry(CHUNK, 0.1, 0.9), P.dirt, { pos: [x0 + CHUNK / 2, -0.07, -ROAD_HALF - 0.45] });
  group.add(groundB.build({ castShadow: false, receiveShadow: true }));

  // --- Route ---
  const road = new Builder(rand);
  road.add(new THREE.BoxGeometry(CHUNK, 0.2, ROAD_HALF * 2), P.road, { pos: [x0 + CHUNK / 2, -0.1, 0], jitter: 0.03 });
  for (let x = x0; x < x0 + CHUNK; x += 6) {
    road.add(new THREE.BoxGeometry(3, 0.02, 0.14), P.roadLine, { pos: [x + 1.5, 0.005, 0], jitter: 0 });
  }
  for (const z of [-ROAD_HALF + 0.2, ROAD_HALF - 0.2]) {
    road.add(new THREE.BoxGeometry(CHUNK, 0.02, 0.1), P.roadLine, { pos: [x0 + CHUNK / 2, 0.005, z], jitter: 0 });
  }
  // Bosses (dos d'âne jaune et noir) : mêmes positions que dans la physique.
  for (let c = Math.floor(x0 / 12); c < Math.ceil((x0 + CHUNK) / 12); c++) {
    const b = bumpAtCell(c);
    if (!b || b.x < x0 || b.x >= x0 + CHUNK) continue;
    const r = 0.13 * b.size;
    const seg = 8;
    for (let k = 0; k < seg; k++) {
      const w = (ROAD_HALF * 2) / seg;
      const half = new THREE.CylinderGeometry(r, r, w, 6, 1, false, 0, Math.PI);
      half.rotateX(Math.PI / 2).rotateZ(Math.PI / 2); // axe le long de la route, bombé vers le haut
      road.add(half, k % 2 ? P.bumpA : P.bumpB, {
        pos: [b.x, 0, -ROAD_HALF + w * (k + 0.5)],
        scale: [1.6, 1, 1],
        jitter: 0.02,
      });
    }
  }
  group.add(road.build({ castShadow: false, receiveShadow: true }));

  // --- Décor ---
  const deco = new Builder(rand);
  // Poteaux de clôture : bon repère de vitesse.
  for (let x = x0; x < x0 + CHUNK; x += 8) {
    deco.add(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 5), P.trunk, { pos: [x, 0.5, -ROAD_HALF - 1.4] });
  }
  deco.add(new THREE.BoxGeometry(CHUNK, 0.06, 0.05), '#8a6a50', { pos: [x0 + CHUNK / 2, 0.85, -ROAD_HALF - 1.4] });
  deco.add(new THREE.BoxGeometry(CHUNK, 0.06, 0.05), '#8a6a50', { pos: [x0 + CHUNK / 2, 0.5, -ROAD_HALF - 1.4] });

  // Arbres derrière la route
  const treeCount = 26;
  for (let i = 0; i < treeCount; i++) {
    const x = x0 + rand() * CHUNK;
    const z = -6 - rand() * rand() * 60;
    addTree(deco, rand, x, groundHeight(x, z), z, 0.7 + rand() * 0.9);
  }
  // Quelques arbres côté caméra, loin de l'axe de vue
  for (let i = 0; i < 3; i++) {
    const x = x0 + rand() * CHUNK;
    const z = 16 + rand() * 12;
    addTree(deco, rand, x, groundHeight(x, z), z, 0.8 + rand() * 0.6);
  }
  // Rochers et touffes
  for (let i = 0; i < 14; i++) {
    const x = x0 + rand() * CHUNK;
    // Côté caméra, on garde des cailloux petits et proches du bord.
    const front = rand() < 0.4;
    const z = front ? ROAD_HALF + 1.1 + rand() * 2.5 : -(ROAD_HALF + 2 + rand() * 9);
    const s = front ? 0.12 + rand() * 0.2 : 0.2 + rand() * 0.5;
    deco.add(new THREE.DodecahedronGeometry(s, 0), P.rock, {
      pos: [x, groundHeight(x, z) + s * 0.3, z],
      rot: [rand() * 3, rand() * 3, rand() * 3],
      scale: [1.2, 0.7, 1],
      jitter: 0.1,
    });
  }
  group.add(deco.build({ castShadow: true, receiveShadow: false }));

  // --- Lointain : montagnes et nuages (sans ombres) ---
  const far = new Builder(rand);
  for (let i = 0; i < 4; i++) {
    const x = x0 + rand() * CHUNK;
    const z = -150 - rand() * 120;
    const h = 30 + rand() * 50;
    const r = h * (0.8 + rand() * 0.5);
    far.add(new THREE.ConeGeometry(r, h, 5 + Math.floor(rand() * 3), 1), rand() < 0.5 ? P.mountainA : P.mountainB, {
      pos: [x, h / 2 - 2, z],
      rot: [0, rand() * 3, 0],
      jitter: 0.08,
    });
    if (h > 55) {
      far.add(new THREE.ConeGeometry(r * 0.28, h * 0.28, 5, 1), P.snow, { pos: [x, h - 2 - h * 0.14 + 0.3, z], rot: [0, rand() * 3, 0] });
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = x0 + rand() * CHUNK;
    const y = 28 + rand() * 25;
    const z = -80 - rand() * 120;
    for (let k = 0; k < 4; k++) {
      const s = 3 + rand() * 4;
      far.add(new THREE.IcosahedronGeometry(s, 0), P.cloud, {
        pos: [x + k * 4 - 6, y + rand() * 2, z + rand() * 3],
        scale: [1.4, 0.8, 1],
        jitter: 0.04,
      });
    }
  }
  group.add(far.build({ castShadow: false }));

  return group;
}

function addTree(b, rand, x, y, z, s) {
  const kind = rand();
  b.add(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.2 * s, 5), P.trunk, { pos: [x, y + 0.6 * s, z] });
  if (kind < 0.65) {
    // Sapin : deux cônes empilés
    const col = rand() < 0.5 ? P.treeA : P.treeB;
    b.add(new THREE.ConeGeometry(1.0 * s, 1.8 * s, 6), col, { pos: [x, y + 1.9 * s, z], rot: [0, rand() * 3, 0] });
    b.add(new THREE.ConeGeometry(0.72 * s, 1.4 * s, 6), col, { pos: [x, y + 2.7 * s, z], rot: [0, rand() * 3, 0] });
  } else {
    // Feuillu : un icosaèdre, parfois couleur automne
    const col = rand() < 0.4 ? P.treeC : P.treeB;
    b.add(new THREE.IcosahedronGeometry(1.0 * s, 0), col, { pos: [x, y + 1.9 * s, z], rot: [rand(), rand(), rand()], jitter: 0.1 });
  }
}
