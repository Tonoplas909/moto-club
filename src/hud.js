// Interface : jauge d'angle, score, écrans.

import { ZONES, BALANCE_ANGLE, TUNING } from './physics.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const CX = 110;
const CY = 112;
const RADIUS = 92;
const SVGNS = 'http://www.w3.org/2000/svg';

// La jauge est un rapporteur : l'aiguille montre l'angle réel de la moto.
function polar(deg, r = RADIUS) {
  const a = deg * DEG;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arc(d0, d1, r = RADIUS) {
  const [x0, y0] = polar(d0, r);
  const [x1, y1] = polar(d1, r);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      score: $('score'),
      mult: $('mult'),
      dist: $('dist'),
      speed: $('speed'),
      best: $('best'),
      needle: $('gauge-needle'),
      angle: $('gauge-angle'),
      gas: $('bar-gas'),
      brake: $('bar-brake'),
      toast: $('toast'),
      title: $('screen-title'),
      over: $('screen-over'),
      titleBest: $('title-best'),
    };

    const zones = $('gauge-zones');
    const base = document.createElementNS(SVGNS, 'path');
    base.setAttribute('d', arc(0, TUNING.crashAngle / DEG));
    base.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    zones.appendChild(base);
    for (const z of ZONES) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', arc(z.min, z.max));
      p.setAttribute('stroke', z.color);
      zones.appendChild(p);
    }
    const [bx0, by0] = polar(BALANCE_ANGLE / DEG, RADIUS - 14);
    const [bx1, by1] = polar(BALANCE_ANGLE / DEG, RADIUS + 14);
    const bal = $('gauge-balance');
    bal.setAttribute('x1', bx0);
    bal.setAttribute('y1', by0);
    bal.setAttribute('x2', bx1);
    bal.setAttribute('y2', by1);

    this.lastZone = null;
  }

  showTitle(best) {
    this.el.titleBest.textContent = fmt(best);
    this.el.title.classList.remove('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.add('hidden');
  }

  showGame(best) {
    this.el.title.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.best.textContent = fmt(best);
    this.lastZone = null;
  }

  update(s, zone) {
    const deg = Math.max(0, s.theta / DEG);
    const [nx, ny] = polar(Math.min(deg, 110), RADIUS - 6);
    this.el.needle.setAttribute('x2', nx.toFixed(1));
    this.el.needle.setAttribute('y2', ny.toFixed(1));
    this.el.needle.style.stroke = zone ? zone.color : '';
    this.el.angle.textContent = `${Math.round(deg)}°`;

    this.el.score.textContent = fmt(s.score);
    this.el.dist.textContent = Math.floor(s.wheelieDist);
    this.el.speed.textContent = Math.round(s.v * 3.6);
    this.el.gas.style.height = `${s.engine * 100}%`;
    this.el.brake.style.height = `${s.brake * 100}%`;

    if (s.phase === 'wheelie' && zone) {
      const combo = s.combo > 1 ? ` · combo ×${s.combo.toFixed(2).replace(/\.?0+$/, '')}` : '';
      this.el.mult.textContent = `×${zone.mult} ${zone.label}${combo}`;
      this.el.mult.style.color = zone.color;
    } else if (s.phase === 'rolling') {
      this.el.mult.textContent = 'Gaz pour lever la roue !';
      this.el.mult.style.color = '';
    } else {
      this.el.mult.textContent = '';
    }
  }

  toast(text, color = '') {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.remove('show');
    void t.offsetWidth; // relance l'animation
    t.classList.add('show');
  }

  showResults(s, best, isRecord) {
    this.el.hud.classList.add('hidden');
    this.el.over.classList.remove('hidden');
    $('over-title').textContent = s.phase === 'crashed' ? 'Looping !' : 'Fin du wheelie';
    $('over-score').textContent = fmt(s.score);
    $('over-record').classList.toggle('hidden', !isRecord);
    $('over-dist').textContent = `${Math.floor(s.wheelieDist)} m`;
    $('over-time').textContent = `${s.wheelieTime.toFixed(1)} s`;
    $('over-speed').textContent = `${Math.round(s.maxSpeed * 3.6)} km/h`;
    $('over-angle').textContent = `${Math.round(s.maxAngle / DEG)}°`;
    const crashNote = s.phase === 'crashed' ? ` <br>Le looping t'a coûté ${fmt(s.scoreBeforeCrash - s.score)} points.` : '';
    $('over-rank').innerHTML = `Rang : <b>${rank(s.score)}</b> · record ${fmt(best)}${crashNote}`;
  }
}

function rank(score) {
  const ranks = [
    [0, 'Piéton'],
    [500, 'Apprenti'],
    [1500, 'Motard du dimanche'],
    [4000, 'Stunter'],
    [9000, 'Roi du bitume'],
    [18000, 'Légende du Moto Club'],
  ];
  let r = ranks[0][1];
  for (const [min, name] of ranks) if (score >= min) r = name;
  return r;
}

export function fmt(n) {
  return Math.floor(n).toLocaleString('fr-FR');
}
