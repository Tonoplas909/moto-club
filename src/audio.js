// Son moteur synthétisé (WebAudio) : pas de fichier à charger.

export class EngineAudio {
  constructor() {
    this.ctx = null;
    try {
      this.muted = localStorage.getItem('motoclub.muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  // Le contexte audio ne peut démarrer qu'après une action du joueur.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.filter.connect(this.engineGain).connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.osc1.start();
    this.osc2.start();

    this.noise = makeNoiseBuffer(ctx);
  }

  setEngine(rpm, load, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 38 + rpm * 120;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(400 + load * 1600 + rpm * 600, t, 0.05);
    this.engineGain.gain.setTargetAtTime(on ? 0.25 + load * 0.35 : 0, t, 0.08);
  }

  thump(strength = 1) {
    this.burst(0.12, 180, 0.6 * strength);
  }

  crash() {
    this.burst(0.9, 900, 1);
  }

  burst(duration, freq, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('motoclub.muted', this.muted ? '1' : '0');
    } catch {
      /* stockage indisponible : tant pis */
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}

function makeNoiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
