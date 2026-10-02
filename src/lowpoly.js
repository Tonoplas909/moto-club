// Petits utilitaires pour fabriquer des géométries low poly colorées
// et les fusionner en un seul mesh (un draw call par morceau de décor).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// Retourne une géométrie non indexée, colorée face par face (légère variation de teinte).
export function painted(geometry, color, jitter = 0.06, rand = Math.random) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const base = new THREE.Color(color);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const k = 1 + (rand() - 0.5) * 2 * jitter;
    c.setRGB(base.r * k, base.g * k, base.b * k);
    for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

// Builder : accumule des pièces positionnées, puis produit un mesh unique.
export class Builder {
  constructor(rand = Math.random) {
    this.parts = [];
    this.rand = rand;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }

  add(geometry, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], jitter = 0.06 } = {}) {
    const g = painted(geometry, color, jitter, this.rand);
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    g.applyMatrix4(this.m);
    this.parts.push(g);
    return this;
  }

  build({ castShadow = true, receiveShadow = false } = {}) {
    const merged = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

export const PALETTE = {
  skyTop: '#3d5a98',
  skyMid: '#e88f7a',
  skyHorizon: '#ffd29d',
  grass: '#7fae5a',
  grassDark: '#5f8f45',
  dirt: '#c9a26b',
  road: '#3b3a4a',
  roadLine: '#f1e9da',
  treeA: '#2f6b4f',
  treeB: '#3f8a5a',
  treeC: '#d07a3a',
  trunk: '#6b4430',
  rock: '#8a8aa0',
  mountainA: '#6d597a',
  mountainB: '#8f6f8f',
  snow: '#f6eee8',
  cloud: '#fff4ec',
  bumpA: '#f2c14e',
  bumpB: '#2b2b33',
  bike: '#e63946',
  bikeDark: '#1d1d24',
  chrome: '#c8ccd6',
  rider: '#283c63',
  helmet: '#f1faee',
  visor: '#1d3557',
  skin: '#e0a37a',
};
