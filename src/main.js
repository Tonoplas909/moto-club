import * as THREE from 'three';
import { createBike, step, zoneFor, TUNING } from './physics.js';
import { World, LANE_Z } from './world.js';
import { Bike } from './bike.js';
import { Particles } from './fx.js';
import { Hud } from './hud.js';
import { EngineAudio } from './audio.js';

const DT = 1 / 120;
const BEST_KEY = 'motoclub.best';

// ---------- Rendu ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // En portrait, on recule et on recentre la caméra pour garder la moto en entier.
  const portrait = w / h < 1;
  camera.userData.distance = portrait ? 12.5 : 9;
  camera.userData.ahead = portrait ? 0.7 : 2.6;
  camera.userData.side = portrait ? 1.3 : 4.2;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const world = new World(scene);
const bike = new Bike(scene);
const particles = new Particles(scene);
const hud = new Hud();
const audio = new EngineAudio();

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const touchPad = document.getElementById('touch');

// ---------- État du jeu ----------
let mode = 'title'; // title | playing | over
let s = createBike(1);
let best = loadBest();
let endTimer = 0;
let shake = 0;
let lastCombo = 1;
let armed = false; // évite que la touche qui lance la partie mette les gaz

hud.showTitle(best);
document.getElementById('btn-mute').classList.toggle('muted', audio.muted);

function startRun() {
  audio.unlock();
  s = createBike((Math.random() * 1e9) | 0);
  bike.reset();
  particles.clear();
  mode = 'playing';
  endTimer = 0;
  lastCombo = 1;
  armed = !anyInput();
  hud.showGame(best);
  touchPad.classList.toggle('hidden', !isTouch);
}

function endRun() {
  mode = 'over';
  const isRecord = s.score > best && s.score > 0;
  if (isRecord) {
    best = Math.floor(s.score);
    saveBest(best);
  }
  hud.showResults(s, best, isRecord);
  touchPad.classList.add('hidden');
}

// ---------- Entrées ----------
const keys = new Set();
const pointer = { gas: false, brake: false };
const GAS_KEYS = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
const BRAKE_KEYS = ['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'];

function anyInput() {
  return keys.size > 0 || pointer.gas || pointer.brake;
}

function readInput() {
  if (!armed) {
    if (!anyInput()) armed = true;
    return { throttle: false, brake: false };
  }
  return {
    throttle: pointer.gas || GAS_KEYS.some((k) => keys.has(k)),
    brake: pointer.brake || BRAKE_KEYS.some((k) => keys.has(k)),
  };
}

window.addEventListener('keydown', (e) => {
  if ([...GAS_KEYS, ...BRAKE_KEYS].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyM') return toggleMute();
  if (mode !== 'playing' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')) {
    keys.add(e.code);
    return startRun();
  }
  if (mode === 'playing' && e.code === 'KeyR') return startRun();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  pointer.gas = pointer.brake = false;
});

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'playing') return;
  if (e.button === 2) pointer.brake = true;
  else pointer.gas = true;
});
window.addEventListener('pointerup', () => {
  pointer.gas = pointer.brake = false;
  document.querySelectorAll('.touch-btn.active').forEach((b) => b.classList.remove('active'));
});
window.addEventListener('pointercancel', () => (pointer.gas = pointer.brake = false));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

for (const [id, key] of [
  ['touch-gas', 'gas'],
  ['touch-brake', 'brake'],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    pointer[key] = true;
    btn.classList.add('active');
  });
}

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-retry').addEventListener('click', startRun);
document.getElementById('btn-mute').addEventListener('click', toggleMute);

function toggleMute() {
  audio.unlock();
  const muted = audio.toggleMute();
  document.getElementById('btn-mute').classList.toggle('muted', muted);
}


// ---------- Boucle ----------
let acc = 0;
let last = performance.now();
const tmp = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(5, 2.5, 10);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = mode === 'playing' ? readInput() : { throttle: false, brake: false };
  acc += dt;
  while (acc >= DT) {
    step(s, input, DT);
    acc -= DT;
  }
  handleEvents();

  if (mode === 'playing' && (s.phase === 'landed' || s.phase === 'crashed')) {
    endTimer += dt;
    if (endTimer > (s.phase === 'crashed' ? 2.2 : 1.3)) endRun();
  }
  // Sur l'écran titre, la moto roule tranquillement en boucle.
  if (mode === 'title' && s.x > 400) s = createBike(1);

  bike.update(s, dt);
  world.update(s.x);
  emitParticles(dt);
  particles.update(dt);
  updateCamera(dt);

  const zone = zoneFor(s.theta);
  if (mode === 'playing') {
    hud.update(s, zone);
    const rpm = Math.min(1, s.v / TUNING.vMax + s.engine * 0.35);
    audio.setEngine(rpm, s.engine, s.phase !== 'crashed' || s.engine > 0.05);
  } else {
    audio.setEngine(0, 0, false);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function handleEvents() {
  for (const e of s.events) {
    if (mode !== 'playing') continue;
    if (e.type === 'start') hud.toast('Wheelie !', '#f9c74f');
    if (e.type === 'bump') {
      shake = Math.max(shake, 0.12 * e.size);
      audio.thump(e.size);
    }
    if (e.type === 'crash') {
      hud.toast('Looping !', '#f94144');
      shake = 0.5;
      audio.crash();
    }
    if (e.type === 'landed') hud.toast(s.wheelieDist > 5 ? 'Posé !' : 'Trop court…', '#fff8ef');
  }
  s.events.length = 0;

  if (mode === 'playing' && s.combo > lastCombo) hud.toast(`Combo ×${s.combo}`, '#f9c74f');
  lastCombo = s.combo;
}

function emitParticles(dt) {
  const moving = s.v > 1;
  // Poussière sous la roue arrière quand on met les gaz
  if (moving && s.phase !== 'crashed' && Math.random() < s.engine * 40 * dt) {
    bike.rearContact(tmp);
    tmp.x -= 0.1;
    tmpV.set(-s.v * 0.25 - Math.random(), 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2);
    particles.emit(tmp, tmpV, { color: '#e8d7b9', life: 0.6, size: 0.4 + Math.random() * 0.4 });
  }
  // Fumée d'échappement
  if (s.phase !== 'crashed' && Math.random() < (0.15 + s.engine) * 25 * dt) {
    bike.exhaust(tmp);
    tmpV.set(-2 - Math.random() * 2, 0.3, (Math.random() - 0.5) * 0.4);
    particles.emit(tmp, tmpV, { color: '#9a98a8', life: 0.6, size: 0.35, grow: 3 });
  }
  // Étincelles quand la moto glisse sur le dos
  if (s.phase === 'crashed' && moving && Math.random() < 60 * dt) {
    bike.rearContact(tmp);
    tmp.x -= 0.6;
    tmp.y = 0.1;
    tmpV.set(-s.v * 0.4 - Math.random() * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
    particles.emit(tmp, tmpV, { color: Math.random() < 0.5 ? '#ffb703' : '#fb8500', life: 0.4, size: 0.4, grow: -0.8 });
  }
}

function updateCamera(dt) {
  const { distance: dist, ahead, side } = camera.userData;
  const x = s.x;
  const lift = Math.min(1.2, Math.max(0, s.theta) * 0.7);
  const speedBack = s.v * 0.05;
  camTarget.set(x + ahead + speedBack * 0.4, 0.9 + lift * 0.5, LANE_Z);
  const desired = tmp.set(x + side, 1.9 + lift * 0.6, LANE_Z + dist + speedBack);
  if (mode === 'title') desired.set(x + side + 1.3, 1.6, LANE_Z + dist * 0.8);
  camPos.lerp(desired, 1 - Math.exp(-dt * 4));
  // On suit la moto strictement en x pour éviter tout décrochage à haute vitesse.
  camPos.x = desired.x;
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.2);
  }
  camera.lookAt(camTarget);
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* stockage indisponible */
  }
}

// Petit accès pour déboguer depuis la console.
window.motoClub = {
  get state() {
    return s;
  },
  get mode() {
    return mode;
  },
};

requestAnimationFrame(frame);
