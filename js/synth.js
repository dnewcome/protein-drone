import { midiToFreq, ssRoutingWeights } from './mapping.js';

function makeReverbImpulse(ctx, duration = 2.4, decay = 2.5) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.delay = null;
    this.delayFeedback = null;
    this.reverb = null;
    this.dryBus = null;
    this.delayBus = null;
    this.reverbBus = null;
    this.compressor = null;

    this.voices = [];
    this.allVoices = [];
    this.voiceRatio = 0.4;
    this.params = null;
    this.running = false;
    this.lookaheadMs = 25;
    this.scheduleAhead = 0.12;
    this.transposeSemi = 0;
    this.modWheel = 0;
    this.intervalId = null;
    this.tonicPc = 0;
    this.chordOffsets = [0, 4, 7];
  }

  init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain(); this.master.gain.value = 0.5;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 6000;
    this.filter.Q.value = 1.5;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.18;

    this.dryBus = ctx.createGain();    this.dryBus.gain.value = 1.0;
    this.delayBus = ctx.createGain();  this.delayBus.gain.value = 0.25;
    this.reverbBus = ctx.createGain(); this.reverbBus.gain.value = 0.35;

    this.delay = ctx.createDelay(2.0); this.delay.delayTime.value = 0.36;
    this.delayFeedback = ctx.createGain(); this.delayFeedback.gain.value = 0.45;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeReverbImpulse(ctx);

    this.dryBus.connect(this.filter);
    this.delayBus.connect(this.delay);
    this.delay.connect(this.filter);
    this.reverbBus.connect(this.reverb);
    this.reverb.connect(this.filter);

    this.filter.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);
  }

  setVoices(voiceConfig) {
    this.allVoices = voiceConfig;
    this._resampleVoices();
  }

  setVoiceRatio(r) {
    this.voiceRatio = Math.max(0.05, Math.min(1, r));
    this._resampleVoices();
  }

  setVoicePitches(midiArray) {
    if (!this.allVoices || !midiArray) return;
    for (let i = 0; i < this.allVoices.length && i < midiArray.length; i++) {
      this.allVoices[i].midi = midiArray[i];
    }
    for (const v of this.voices) {
      if (v.sourceIndex < midiArray.length) v.midi = midiArray[v.sourceIndex];
    }
  }

  _resampleVoices() {
    const cfg = this.allVoices;
    if (!cfg || !cfg.length) { this.voices = []; return; }
    const HARD_CAP = 64;
    const cap = Math.max(1, Math.min(HARD_CAP, Math.round(cfg.length * this.voiceRatio)));
    const sampled = [];
    if (cap >= cfg.length) {
      sampled.push(...cfg);
    } else {
      const stride = cfg.length / cap;
      for (let i = 0; i < cap; i++) sampled.push(cfg[Math.floor(i * stride)]);
    }
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.voices = sampled.map(v => ({
      ...v,
      nextGrainTime: t + Math.random() * 0.3,
      spawnTime: t,
      currentSpeed: 0,
      pan: 0,
      sourceIndex: v.index,
    }));
  }

  setTonic(pc, scaleSteps) {
    this.tonicPc = ((pc % 12) + 12) % 12;
    const s = (scaleSteps && scaleSteps.length) ? scaleSteps : [0, 4, 7];
    this.chordOffsets = s.length <= 3
      ? s.slice()
      : [s[0], s[Math.floor(s.length / 3)], s[Math.floor(2 * s.length / 3)]];
  }

  _snapToChord(midi) {
    let best = midi, bestD = 999;
    for (const c of this.chordOffsets) {
      const candidate = c + this.tonicPc + Math.round((midi - this.tonicPc - c) / 12) * 12;
      const d = Math.abs(candidate - midi);
      if (d < bestD) { bestD = d; best = candidate; }
    }
    return best;
  }

  setMaster(v) { if (this.master) this.master.gain.value = v; }
  setCutoff(f) { if (this.filter) this.filter.frequency.value = f; }
  setResonance(q) { if (this.filter) this.filter.Q.value = q; }
  setDelay(amt) {
    if (!this.delayBus) return;
    this.delayBus.gain.value = amt;
    this.delayFeedback.gain.value = 0.25 + 0.5 * amt;
  }
  setReverb(amt) { if (this.reverbBus) this.reverbBus.gain.value = amt; }

  setParams(p) { this.params = p; }
  setTranspose(s) { this.transposeSemi = s; }
  setModWheel(v) { this.modWheel = v; }

  triggerOvertone({ fundamentalMidi, harmonic, gain, octaveShift, pan, sustain, harmonicity, ss }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.005;

    const baseFreq = midiToFreq(fundamentalMidi + this.transposeSemi);
    const stretch = 1 + harmonicity * 0.04 * (harmonic - 1) * (harmonic - 1) / Math.max(1, harmonic);
    const partialFreq = baseFreq * harmonic * Math.pow(2, octaveShift || 0) * stretch;

    if (partialFreq < 20 || partialFreq > 18000) return;

    const partialPeak = gain * 0.45 / (1 + (harmonic - 1) * 0.12);
    const attack = 0.025;
    const release = Math.max(0.05, sustain * 0.08);
    const totalDur = sustain + release;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = partialFreq;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(partialPeak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(1e-4, partialPeak * 0.05), t0 + sustain);
    env.gain.linearRampToValueAtTime(0, t0 + totalDur);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan || 0));

    osc.connect(env);
    const out = panner ? (env.connect(panner), panner) : env;

    const ssr = ssRoutingWeights(ss);
    const dryGain = ctx.createGain();    dryGain.gain.value    = ssr.dry    * 1.1;
    const delayGain = ctx.createGain();  delayGain.gain.value  = ssr.delay  * 1.6;
    const reverbGain = ctx.createGain(); reverbGain.gain.value = ssr.reverb * 1.8;
    out.connect(dryGain);    dryGain.connect(this.dryBus);
    out.connect(delayGain);  delayGain.connect(this.delayBus);
    out.connect(reverbGain); reverbGain.connect(this.reverbBus);

    osc.start(t0);
    osc.stop(t0 + totalDur + 0.05);
  }

  triggerWalkerClick(pan, gain) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.001;
    const dur = 0.06;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain * 0.5, t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 4;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
    src.connect(bp); bp.connect(env);
    const out = panner ? (env.connect(panner), panner) : env;
    out.connect(this.dryBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  updateMotion(speeds, positions) {
    if (!this.voices.length) return;
    const allN = speeds.length;
    let xMin = +Infinity, xMax = -Infinity;
    for (let i = 0; i < allN; i++) {
      const x = positions[3*i];
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
    const xRange = (xMax - xMin) || 1;

    for (const v of this.voices) {
      const i = v.sourceIndex;
      v.currentSpeed = speeds[i];
      v.pan = 2 * (positions[3*i] - xMin) / xRange - 1;
    }
  }

  start() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.running = true;
    if (this.intervalId == null) {
      this.intervalId = setInterval(() => this._tick(), this.lookaheadMs);
    }
  }

  stop() {
    this.running = false;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _tick() {
    if (!this.running || !this.params || !this.voices.length) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const horizon = now + this.scheduleAhead;

    const density = this.params.density;
    const grainSize = this.params.grain;
    const cohesion = this.params.cohesion;
    const spread = this.params.spread;
    const fieldGain = this.params.field ?? 0.6;
    const modemix = this.params.modemix ?? 0.5;
    const detuneJitter = 25 * (1 - cohesion) * (0.4 + 1.8 * modemix);

    for (const v of this.voices) {
      if (v.nextGrainTime < now - 0.5) v.nextGrainTime = now + Math.random() * 0.3;
      const motionFactor = Math.min(4, 0.25 + 80 * v.currentSpeed);
      const baseRate = Math.min(40, density * motionFactor);
      const voiceFade = v.spawnTime ? Math.min(1, (now - v.spawnTime) / 0.25) : 1;
      const rateComp = 1 / Math.sqrt(Math.max(1, motionFactor));
      while (v.nextGrainTime < horizon) {
        const chordTarget = this._snapToChord(v.midi);
        const targetMidi = v.midi + (chordTarget - v.midi) * cohesion;
        const transposed = targetMidi + this.transposeSemi;
        const freq = midiToFreq(transposed);
        const detuneCents = v.detune + (Math.random() - 0.5) * detuneJitter;
        const ss = ssRoutingWeights(v.ss);
        const grainAmp = 0.3 * v.massGain * fieldGain * voiceFade * rateComp;
        const pan = v.pan * spread + (Math.random() - 0.5) * 0.2 * spread;
        this._scheduleGrain(v.nextGrainTime, freq, detuneCents, grainSize, grainAmp, v.waveform, ss, pan);
        const period = 1 / Math.max(0.3, baseRate);
        const jitter = period * (0.3 + 0.7 * (1 - cohesion));
        v.nextGrainTime += period * 0.5 + Math.random() * jitter;
      }
    }
  }

  _scheduleGrain(t, freq, detuneCents, dur, amp, waveform, ss, pan) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = freq;
    osc.detune.value = detuneCents;

    const env = ctx.createGain();
    env.gain.value = 0;
    const peakAt = dur * 0.35;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(amp, t + peakAt);
    env.gain.linearRampToValueAtTime(0, t + dur);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(env);
    const out = panner ? (env.connect(panner), panner) : env;

    const dryGain = ctx.createGain(); dryGain.gain.value = ss.dry;
    const delayGain = ctx.createGain(); delayGain.gain.value = ss.delay;
    const reverbGain = ctx.createGain(); reverbGain.gain.value = ss.reverb;
    out.connect(dryGain);    dryGain.connect(this.dryBus);
    out.connect(delayGain);  delayGain.connect(this.delayBus);
    out.connect(reverbGain); reverbGain.connect(this.reverbBus);

    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
