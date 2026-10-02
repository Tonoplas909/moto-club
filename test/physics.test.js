import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBike, step, zoneFor, BALANCE_ANGLE, TUNING } from '../src/physics.js';
import { bumpsBetween, bumpAtCell } from '../src/track.js';

const DT = 1 / 120;
const DEG = Math.PI / 180;

function simulate(policy, { seed = 1, maxTime = 60 } = {}) {
  const s = createBike(seed);
  let t = 0;
  while (t < maxTime && (s.phase === 'rolling' || s.phase === 'wheelie')) {
    step(s, policy(s, t), DT);
    s.events.length = 0;
    t += DT;
  }
  return s;
}

test('sans gaz, la moto reste sur ses deux roues', () => {
  const s = simulate(() => ({ throttle: false, brake: false }), { maxTime: 5 });
  assert.equal(s.phase, 'rolling');
  assert.equal(s.theta, 0);
});

test('plein gaz sans relâcher finit en looping', () => {
  const s = simulate(() => ({ throttle: true }), { maxTime: 10 });
  assert.equal(s.phase, 'crashed');
  assert.ok(s.wheelieTime < 3, 'le looping arrive vite');
});

test('le looping coûte la moitié du score', () => {
  const s = simulate(() => ({ throttle: true }), { maxTime: 10 });
  assert.equal(s.score, Math.floor(s.scoreBeforeCrash * 0.5));
});

test('un coup de gaz court lève la roue puis la repose', () => {
  const s = simulate((_, t) => ({ throttle: t < 0.8 }), { maxTime: 10 });
  assert.equal(s.phase, 'landed');
  assert.ok(s.wheelieDist > 5);
  assert.ok(s.score > 0);
});

test('un pilote qui dose les gaz tient bien plus longtemps', () => {
  const delay = Math.round(0.18 / DT);
  const hist = [];
  const s = simulate((cur) => {
    hist.push({ th: cur.theta, om: cur.omega });
    const o = hist[Math.max(0, hist.length - 1 - delay)];
    const pred = o.th + o.om * 0.45;
    const target = 65 * DEG;
    return { throttle: pred < target - 0.02, brake: pred > target + 0.1 };
  });
  assert.ok(s.wheelieTime > 5, `wheelie de ${s.wheelieTime.toFixed(1)} s`);
});

test('le point d\'équilibre tombe dans la zone Parfait', () => {
  assert.equal(zoneFor(BALANCE_ANGLE).label, 'Parfait');
  assert.equal(zoneFor(TUNING.crashAngle - 0.01).label, 'Limite');
  assert.equal(zoneFor(0), null);
});

test('les bosses sont déterministes et absentes du départ', () => {
  assert.deepEqual(bumpsBetween(0, 59), []);
  const a = bumpsBetween(0, 2000);
  const b = bumpsBetween(0, 2000);
  assert.deepEqual(a, b);
  assert.ok(a.length > 20);
  for (const bump of a) assert.ok(bump.x >= 60);
  // Les découpages en tronçons ne doivent ni perdre ni doubler de bosse.
  const parts = [...bumpsBetween(0, 777), ...bumpsBetween(777, 2000)];
  assert.deepEqual(parts, a);
  assert.equal(bumpAtCell(0), null);
});
