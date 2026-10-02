// Physique du wheelie : un pendule inversé autour de l'axe de la roue arrière.
// θ = angle de la moto (0 = deux roues au sol, positif = avant levé).
// L'accélération longitudinale lève l'avant, la gravité le ramène,
// sauf passé le point d'équilibre où elle fait basculer la moto en arrière.

import { bumpsBetween } from './track.js';

const DEG = Math.PI / 180;

export const TUNING = {
  wheelbase: 1.4,
  wheelRadius: 0.33,
  cruiseSpeed: 9, // m/s avant de lever la roue
  accMax: 8, // m/s² à bas régime
  vMax: 55, // m/s
  dragK: 0.0032,
  rollRes: 0.3,
  brakeDecel: 7,
  throttleRise: 3.5, // inertie moteur (1/s)
  throttleFall: 6,
  brakeRise: 10,
  brakeFall: 14,
  kAccel: 0.85, // couple de cabrage par m/s² d'accélération
  kGrav: 3.2, // couple de gravité max
  cgAngle: 18 * DEG, // le centre de gravité est devant l'axe arrière
  damping: 1.1,
  wheelieStart: 4 * DEG,
  crashAngle: 98 * DEG,
};

export const BALANCE_ANGLE = 90 * DEG - TUNING.cgAngle;

// Zones de score selon l'angle (en degrés).
export const ZONES = [
  { min: 4, max: 25, mult: 1, label: 'Petit', color: '#8ecae6' },
  { min: 25, max: 50, mult: 2, label: 'Propre', color: '#90be6d' },
  { min: 50, max: 78, mult: 3, label: 'Parfait', color: '#f9c74f' },
  { min: 78, max: 98, mult: 4, label: 'Limite', color: '#f94144' },
];

export function zoneFor(angleRad) {
  const d = angleRad / DEG;
  for (const z of ZONES) if (d >= z.min && d < z.max) return z;
  return null;
}

export function createBike(seed = 1) {
  return {
    phase: 'rolling', // rolling | wheelie | landed | crashed
    x: 0,
    v: TUNING.cruiseSpeed,
    a: 0,
    theta: 0,
    omega: 0,
    engine: 0,
    brake: 0,
    time: 0,
    wheelieTime: 0,
    wheelieDist: 0,
    maxSpeed: TUNING.cruiseSpeed,
    maxAngle: 0,
    score: 0,
    combo: 1,
    perfectTime: 0,
    bumpHit: 0, // > 0 juste après une bosse (pour l'effet visuel/sonore)
    rng: mulberry32(seed),
    events: [],
  };
}

export function comboFor(perfectTime) {
  return Math.min(3, 1 + Math.floor(perfectTime / 2) * 0.25);
}

export function step(s, input, dt) {
  const T = TUNING;
  s.time += dt;
  s.bumpHit = Math.max(0, s.bumpHit - dt);

  if (s.phase === 'crashed') return stepCrash(s, dt);

  const throttle = s.phase === 'landed' ? 0 : input.throttle ? 1 : 0;
  const brake = s.phase === 'landed' ? 0.4 : input.brake ? 1 : 0;
  s.engine = approach(s.engine, throttle, throttle > s.engine ? T.throttleRise : T.throttleFall, dt);
  s.brake = approach(s.brake, brake, brake > s.brake ? T.brakeRise : T.brakeFall, dt);

  const drive = s.engine * T.accMax * Math.max(0, 1 - s.v / T.vMax);
  const drag = T.dragK * s.v * s.v + T.rollRes;
  const braking = s.v > 0.1 ? s.brake * T.brakeDecel : 0;
  s.a = drive - drag - braking;

  // Tant que la roue n'est pas levée, la moto roule à vitesse de croisière :
  // les gaz ne servent qu'à décoller l'avant.
  if (s.phase !== 'rolling') s.v = Math.max(0, s.v + s.a * dt);

  const prevX = s.x;
  s.x += s.v * dt;

  if (s.phase === 'landed') {
    s.theta = 0;
    s.omega = 0;
    return;
  }

  // Dynamique de tangage.
  let alpha = T.kAccel * s.a - T.kGrav * Math.cos(s.theta + T.cgAngle) - T.damping * s.omega;

  if (s.theta > 0) {
    // Turbulences : grandissent avec la vitesse et la distance.
    const sigma = 0.25 + s.v * 0.012 + s.wheelieDist * 0.00012;
    alpha += gaussian(s.rng) * sigma / Math.sqrt(dt) * 0.35;
  }

  s.omega += alpha * dt;

  // Bosses sur la route, touchées par la roue arrière.
  for (const b of bumpsBetween(prevX, s.x)) {
    const kick = (0.25 + 0.35 * s.rng()) * (0.5 + s.v / 30) * b.size;
    // Une bosse fait plutôt piquer, parfois cabrer.
    s.omega += s.rng() < 0.6 ? -kick : kick;
    s.bumpHit = 0.25;
    s.events.push({ type: 'bump', size: b.size });
  }

  s.theta += s.omega * dt;

  if (s.theta <= 0) {
    s.theta = 0;
    if (s.omega < 0) s.omega = 0;
    if (s.phase === 'wheelie') {
      s.phase = 'landed';
      s.events.push({ type: 'landed' });
    }
    return;
  }

  if (s.phase === 'rolling' && s.theta > T.wheelieStart) {
    s.phase = 'wheelie';
    s.events.push({ type: 'start' });
  }

  if (s.phase === 'wheelie') {
    const dx = s.x - prevX;
    s.wheelieTime += dt;
    s.wheelieDist += dx;
    s.maxSpeed = Math.max(s.maxSpeed, s.v);
    s.maxAngle = Math.max(s.maxAngle, s.theta);

    const zone = zoneFor(s.theta);
    if (zone && zone.mult >= 3) s.perfectTime += dt;
    else s.perfectTime = 0;
    s.combo = comboFor(s.perfectTime);
    if (zone) s.score += dx * 10 * zone.mult * s.combo;

    if (s.theta > T.crashAngle) {
      s.phase = 'crashed';
      s.crashTime = 0;
      s.scoreBeforeCrash = s.score;
      s.score = Math.floor(s.score * 0.5);
      s.events.push({ type: 'crash' });
    }
  }
}

// La moto bascule sur le dos et glisse jusqu'à l'arrêt.
function stepCrash(s, dt) {
  const T = TUNING;
  s.crashTime += dt;
  s.engine = approach(s.engine, 0, 3, dt);
  const limit = 165 * Math.PI / 180;
  if (s.theta < limit) {
    s.omega += T.kGrav * 1.6 * Math.abs(Math.cos(s.theta + T.cgAngle)) * dt + 2 * dt;
    s.theta = Math.min(limit, s.theta + s.omega * dt);
    if (s.theta >= limit) s.omega = 0;
  }
  s.v = Math.max(0, s.v - 7 * dt);
  s.x += s.v * dt;
}

function approach(cur, target, rate, dt) {
  const d = target - cur;
  const stepSize = rate * dt;
  return Math.abs(d) <= stepSize ? target : cur + Math.sign(d) * stepSize;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
