export const AA_PROPS = {
  A: { hydro:  1.8, mass:  89, charge:  0, polar: 0, aroma: 0 },
  R: { hydro: -4.5, mass: 174, charge:  1, polar: 1, aroma: 0 },
  N: { hydro: -3.5, mass: 132, charge:  0, polar: 1, aroma: 0 },
  D: { hydro: -3.5, mass: 133, charge: -1, polar: 1, aroma: 0 },
  C: { hydro:  2.5, mass: 121, charge:  0, polar: 1, aroma: 0 },
  E: { hydro: -3.5, mass: 147, charge: -1, polar: 1, aroma: 0 },
  Q: { hydro: -3.5, mass: 146, charge:  0, polar: 1, aroma: 0 },
  G: { hydro: -0.4, mass:  75, charge:  0, polar: 0, aroma: 0 },
  H: { hydro: -3.2, mass: 155, charge:  0.5, polar: 1, aroma: 1 },
  I: { hydro:  4.5, mass: 131, charge:  0, polar: 0, aroma: 0 },
  L: { hydro:  3.8, mass: 131, charge:  0, polar: 0, aroma: 0 },
  K: { hydro: -3.9, mass: 146, charge:  1, polar: 1, aroma: 0 },
  M: { hydro:  1.9, mass: 149, charge:  0, polar: 0, aroma: 0 },
  F: { hydro:  2.8, mass: 165, charge:  0, polar: 0, aroma: 1 },
  P: { hydro: -1.6, mass: 115, charge:  0, polar: 0, aroma: 0 },
  S: { hydro: -0.8, mass: 105, charge:  0, polar: 1, aroma: 0 },
  T: { hydro: -0.7, mass: 119, charge:  0, polar: 1, aroma: 0 },
  W: { hydro: -0.9, mass: 204, charge:  0, polar: 0, aroma: 1 },
  Y: { hydro: -1.3, mass: 181, charge:  0, polar: 1, aroma: 1 },
  V: { hydro:  4.2, mass: 117, charge:  0, polar: 0, aroma: 0 },
  X: { hydro:  0.0, mass: 120, charge:  0, polar: 0, aroma: 0 },
};

export const SCALES = {
  minPent:   [0, 3, 5, 7, 10],
  majPent:   [0, 2, 4, 7, 9],
  dorian:    [0, 2, 3, 5, 7, 9, 10],
  phrygian:  [0, 1, 3, 5, 7, 8, 10],
  lydian:    [0, 2, 4, 6, 7, 9, 11],
  aeolian:   [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
};

const TONICS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function tonicSemitone(name) {
  return TONICS.indexOf(name);
}

function quantizeToScale(semi, scaleSteps, octaves, tonic) {
  const span = octaves * 12;
  const wrapped = ((semi % span) + span) % span;
  const oct = Math.floor(wrapped / 12);
  const within = wrapped % 12;
  let best = scaleSteps[0], bestD = 99;
  for (const s of scaleSteps) {
    const d = Math.abs(s - within);
    if (d < bestD) { bestD = d; best = s; }
  }
  return tonic + oct * 12 + best;
}

export function computePitches(residues, params) {
  const scaleSteps = SCALES[params.scale] || SCALES.minPent;
  const tonic = tonicSemitone(params.tonic);
  const octaves = params.octaves;
  const quantize = params.quantize;
  const baseNote = 36 + tonic;

  let minH = +Infinity, maxH = -Infinity;
  for (const r of residues) {
    const p = AA_PROPS[r.oneLetter] || AA_PROPS.X;
    if (p.hydro < minH) minH = p.hydro;
    if (p.hydro > maxH) maxH = p.hydro;
  }
  const hRange = maxH - minH || 1;

  const midis = new Float32Array(residues.length);
  for (let i = 0; i < residues.length; i++) {
    const p = AA_PROPS[residues[i].oneLetter] || AA_PROPS.X;
    const norm = (p.hydro - minH) / hRange;
    const rawSemi = Math.round(norm * (octaves * 12 - 1));
    const quantSemi = quantizeToScale(rawSemi, scaleSteps, octaves, 0);
    const semi = quantize * quantSemi + (1 - quantize) * rawSemi;
    midis[i] = baseNote + semi;
  }
  return midis;
}

export function buildVoiceConfig(residues, params) {
  const scaleSteps = SCALES[params.scale] || SCALES.minPent;
  const tonic = tonicSemitone(params.tonic);
  const octaves = params.octaves;
  const quantize = params.quantize;
  const baseNote = 36 + tonic;

  const cfg = [];
  let minH = +Infinity, maxH = -Infinity;
  for (const r of residues) {
    const p = AA_PROPS[r.oneLetter] || AA_PROPS.X;
    if (p.hydro < minH) minH = p.hydro;
    if (p.hydro > maxH) maxH = p.hydro;
  }
  const hRange = maxH - minH || 1;

  for (let i = 0; i < residues.length; i++) {
    const r = residues[i];
    const p = AA_PROPS[r.oneLetter] || AA_PROPS.X;
    const norm = (p.hydro - minH) / hRange;
    const rawSemi = Math.round(norm * (octaves * 12 - 1));
    const quantSemi = quantizeToScale(rawSemi, scaleSteps, octaves, 0);
    const semi = quantize * quantSemi + (1 - quantize) * rawSemi;
    const note = baseNote + semi;

    let waveform = 'sine';
    if (p.charge >= 1) waveform = 'sawtooth';
    else if (p.charge <= -1) waveform = 'square';
    else if (p.aroma) waveform = 'triangle';
    else if (p.polar) waveform = 'sine';
    else waveform = 'sine';

    const detune = (p.mass - 100) * 0.5;
    const massGain = 0.55 + 0.45 * Math.min(1, p.mass / 200);

    cfg.push({
      index: i,
      oneLetter: r.oneLetter,
      ss: r.ss,
      midi: note,
      waveform,
      detune,
      massGain,
      polar: !!p.polar,
      aroma: !!p.aroma,
    });
  }
  return cfg;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function ssRoutingWeights(ss) {
  switch (ss) {
    case 'H': return { dry: 0.4, delay: 0.45, reverb: 0.15 };
    case 'E': return { dry: 0.6, delay: 0.1,  reverb: 0.3  };
    default:  return { dry: 0.5, delay: 0.15, reverb: 0.35 };
  }
}
