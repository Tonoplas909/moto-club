// Génération déterministe de la piste : même x => même décor, mêmes bosses.

export function hash(...ns) {
  let h = 2166136261;
  for (const n of ns) {
    h ^= Math.floor(n * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

const BUMP_CELL = 12;
const FIRST_BUMP = 60;

// Une bosse au plus par cellule, de plus en plus fréquentes avec la distance.
export function bumpAtCell(cell) {
  const x = cell * BUMP_CELL;
  if (x < FIRST_BUMP) return null;
  const chance = Math.min(0.45, 0.12 + x / 4000);
  if (hash(cell, 7) > chance) return null;
  return {
    x: x + hash(cell, 3) * (BUMP_CELL - 2),
    size: 0.7 + hash(cell, 5) * 0.6,
  };
}

export function bumpsBetween(x0, x1) {
  const out = [];
  if (x1 <= x0) return out;
  for (let c = Math.floor(x0 / BUMP_CELL); c <= Math.floor(x1 / BUMP_CELL); c++) {
    const b = bumpAtCell(c);
    if (b && b.x > x0 && b.x <= x1) out.push(b);
  }
  return out;
}
