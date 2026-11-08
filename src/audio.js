/*
 * Procedural sound design (Web Audio, no samples):
 * - flat-plane V8 whose rpm follows scroll speed, with overrun crackles
 * - mechanical one-shots when parts detach / snap back, per category
 * - air whoosh, starter motor and UI ticks
 */

const KIND = {
  Carroceria: 'panel', Iluminação: 'panel', Rodas: 'impact', Freios: 'metal', Suspensão: 'metal', Direção: 'metal',
  Motor: 'metal', Ignição: 'elec', Admissão: 'panel', Alimentação: 'metal', Lubrificação: 'metal', Arrefecimento: 'metal',
  Transmissão: 'metal', Escape: 'metal', Combustível: 'panel', Estrutura: 'metal', Interior: 'soft', Segurança: 'soft',
  Climatização: 'soft', Elétrica: 'elec', Chicotes: 'wire', Áudio: 'elec',
};

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function impulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function softClip(k) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** One engine cycle (2 revolutions) as a waveform: the 8th harmonic is the firing order. */
function engineWave(ctx) {
  const N = 64;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 1; k < N; k++) {
    const order = k % 8 === 0 ? 1 : k % 4 === 0 ? 0.5 : k % 2 === 0 ? 0.2 : 0.09;
    imag[k] = order * Math.exp(-k / 22) * (0.6 + 0.8 * rnd());
    real[k] = imag[k] * (rnd() - 0.5) * 0.6;
  }
  return ctx.createPeriodicWave(real, imag);
}

export class CarAudio {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.rpm = 1000;
    this.lastShot = 0;
    this.shots = 0;
    this.crackleAt = 0;
    this.boost = 0;
  }

  get enabled() {
    return this.on;
  }

  async enable() {
    if (!this.ctx) this.build();
    await this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.15);
  }

  disable() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.noise = noiseBuffer(ctx, 2);

    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx, 1.8, 3);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.28;
    this.verb.connect(verbOut).connect(master);

    // Engine
    const wave = engineWave(ctx);
    const pre = ctx.createGain();
    pre.gain.value = 0.55;
    this.osc = [0, 9].map((detune) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = 9;
      o.detune.value = detune;
      o.connect(pre);
      o.start();
      return o;
    });
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(2.2);
    shaper.oversample = '2x';
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 140;
    body.Q.value = 0.9;
    body.gain.value = 7;
    this.engLP = ctx.createBiquadFilter();
    this.engLP.type = 'lowpass';
    this.engLP.Q.value = 0.8;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    pre.connect(shaper).connect(body).connect(this.engLP).connect(this.engGain);
    this.engGain.connect(master);
    this.engGain.connect(this.verb);

    // Intake roar (filtered noise riding on load)
    const intake = ctx.createBufferSource();
    intake.buffer = this.noise;
    intake.loop = true;
    this.intakeBP = ctx.createBiquadFilter();
    this.intakeBP.type = 'bandpass';
    this.intakeBP.Q.value = 1.2;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    intake.connect(this.intakeBP).connect(this.intakeGain).connect(master);
    intake.start();

    // Air whoosh following scroll speed
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.airBP = ctx.createBiquadFilter();
    this.airBP.type = 'bandpass';
    this.airBP.frequency.value = 500;
    this.airBP.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    air.connect(this.airBP).connect(this.airGain).connect(master);
    air.start();
  }

  /** Called every frame. velocity = scroll progress per second; alive = 0..1 how assembled the engine is. */
  update(dt, velocity, alive) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const speed = Math.min(1, Math.abs(velocity) * 3.2);
    const target = 1050 + Math.max(speed, this.boost) * 7950;
    this.boost = Math.max(0, this.boost - dt * 0.9);
    const rising = target > this.rpm + 50;
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt * (rising ? 4.5 : 1.4)));
    const rpm = this.rpm * (1 + 0.012 * Math.sin(t * 9.3) * (this.rpm < 1500 ? 1 : 0));
    const load = rising ? Math.min(1, (target - this.rpm) / 2500) : 0;
    const cycle = rpm / 120;

    for (const o of this.osc) o.frequency.setTargetAtTime(cycle, t, 0.025);
    this.engLP.frequency.setTargetAtTime(450 + rpm * 0.5 + load * 1800, t, 0.05);
    const engVol = alive * (0.2 + 0.22 * (rpm / 9000) + 0.18 * load);
    this.engGain.gain.setTargetAtTime(engVol, t, 0.06);
    this.intakeBP.frequency.setTargetAtTime(300 + rpm * 0.35, t, 0.05);
    this.intakeGain.gain.setTargetAtTime(alive * (0.02 + 0.12 * load * (rpm / 9000)), t, 0.06);
    this.airBP.frequency.setTargetAtTime(350 + speed * 1400, t, 0.1);
    this.airGain.gain.setTargetAtTime(speed * 0.16, t, 0.1);

    // Overrun crackles when lifting off from high rpm
    if (alive > 0.5 && !rising && this.rpm > 3800 && target < this.rpm - 1500 && t > this.crackleAt) {
      this.crackleAt = t + 0.04 + Math.random() * 0.12;
      this.pop(alive);
    }
  }

  pop(level = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.04);
    src.connect(lp).connect(g);
    g.connect(this.master);
    g.connect(this.verb);
    src.start(t, Math.random() * 1.5, 0.12);
  }

  /** Starter motor whirr, then the V8 catches and blips. */
  ignite() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(170, t + 0.75);
    const am = ctx.createOscillator();
    am.frequency.value = 14;
    const amG = ctx.createGain();
    amG.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.setValueAtTime(0.12, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    am.connect(amG).connect(g.gain);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    am.start(t);
    o.stop(t + 0.9);
    am.stop(t + 0.9);
    this.rpm = 400;
    setTimeout(() => {
      this.boost = 0.62;
    }, 750);
  }

  /** Detach / snap-back sound for a part of category `cat`, panned -1..1. */
  part(cat, pan = 0, dir = 1) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    if (t - this.lastShot < 0.035) return;
    if (t - this.lastShot > 0.25) this.shots = 0;
    if (++this.shots > 6) return;
    this.lastShot = t;
    const kind = KIND[cat] || 'metal';
    const vol = dir > 0 ? 1 : 0.7;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    p.connect(this.master);
    p.connect(this.verb);
    this[`_${kind}`](t, p, vol, dir);
  }

  hover() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.value = 2400;
    const g = this.env(t, 0.025, 0.002, 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.05);
  }

  /* ---------- one-shot voices ---------- */

  env(t, peak, a, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  burst(t, out, { type = 'bandpass', f = 1000, q = 1, peak = 0.3, a = 0.002, d = 0.08, sweep } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    flt.Q.value = q;
    const g = this.env(t, peak, a, d);
    src.connect(flt).connect(g).connect(out);
    src.start(t, Math.random() * 1.5, a + d + 0.05);
  }

  ping(t, out, f, peak, d, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = this.env(t, peak, 0.002, d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  _metal(t, out, vol) {
    const f = 1400 + Math.random() * 1600;
    this.burst(t, out, { f: f * 1.6, q: 6, peak: 0.25 * vol, d: 0.04 });
    this.ping(t, out, f, 0.06 * vol, 0.35);
    this.ping(t, out, f * 2.76, 0.025 * vol, 0.2);
  }

  _panel(t, out, vol) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = this.env(t, 0.32 * vol, 0.004, 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
    this.burst(t, out, { type: 'lowpass', f: 900, peak: 0.2 * vol, d: 0.06 });
    this.burst(t + 0.02, out, { f: 600, q: 0.7, peak: 0.08 * vol, a: 0.08, d: 0.25, sweep: 2400 });
  }

  _impact(t, out, vol, dir) {
    // Pneumatic wrench rattle
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.burst(t + i * 0.024, out, { f: 1700, q: 3, peak: 0.18 * vol, d: 0.018 });
    this.ping(t + n * 0.024, out, dir > 0 ? 900 : 700, 0.05 * vol, 0.12, 'triangle');
  }

  _soft(t, out, vol) {
    this.burst(t, out, { type: 'lowpass', f: 420, peak: 0.35 * vol, a: 0.006, d: 0.12 });
    this.burst(t, out, { f: 1800, q: 0.8, peak: 0.04 * vol, a: 0.03, d: 0.12 });
  }

  _elec(t, out, vol) {
    this.burst(t, out, { type: 'highpass', f: 4000, peak: 0.16 * vol, d: 0.012 });
    this.burst(t + 0.03, out, { type: 'highpass', f: 3000, peak: 0.1 * vol, d: 0.01 });
    this.ping(t, out, 3200, 0.02 * vol, 0.05, 'square');
  }

  _wire(t, out, vol) {
    this.burst(t, out, { f: 3500, q: 2, peak: 0.12 * vol, a: 0.01, d: 0.13, sweep: 900 });
  }
}
