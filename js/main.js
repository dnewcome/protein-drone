import { fetchPDB, parsePDB } from './pdb.js';
import { buildModes, evaluatePositions } from './dynamics.js';
import { SynthEngine } from './synth.js';
import { Viewer } from './viewer.js';
import { UI } from './ui.js';
import { MidiInput } from './midi.js';
import { buildVoiceConfig, computePitches, AA_PROPS, tonicSemitone, SCALES } from './mapping.js';
import { WalkerSystem } from './walkers.js';

const state = {
  protein: null,
  modeData: null,
  positions: null,
  prevPositions: null,
  speeds: null,
  t0: 0,
  params: {
    master: 0.5,
    speed: 0.5,
    amp: 1.0,
    modemix: 0.5,
    cohesion: 0.5,
    density: 4,
    grain: 0.08,
    spread: 0.6,
    field: 0.6,
    voices: 0.4,
    tonic: 'C',
    scale: 'minPent',
    octaves: 3,
    quantize: 1,
    cutoff: 6000,
    reso: 1.5,
    delay: 0.25,
    reverb: 0.35,
    wcount: 3,
    wstrategy: 'contact',
    wrate: 6,
    wgain: 0.7,
    woct: 0,
    wrepel: 0,
    wdecay: 1.5,
    wharmonicity: 0.0,
    wclick: 0.25,
  },
  voiceCfg: null,
  residuePulses: null,
};

const ui = new UI();
const synth = new SynthEngine();
const midi = new MidiInput();
const canvas = document.getElementById('viewer');
const viewer = new Viewer(canvas);
const walkers = new WalkerSystem();

walkers.onVisit = (w) => {
  if (!state.voiceCfg || !state.protein) return;
  const cfg = state.voiceCfg[w.residue];
  if (!cfg) return;
  const aa = AA_PROPS[state.protein.residues[w.residue].oneLetter] || AA_PROPS.X;
  const tonicMidi = 48 + tonicSemitone(state.params.tonic);
  const setLen = w.harmonicSet.length;
  const setIdx = Math.max(0, Math.min(setLen - 1,
    Math.floor(((aa.hydro + 4.5) / 9) * setLen)));
  const harmonic = w.harmonicSet[setIdx];
  const xPos = state.positions ? state.positions[3 * w.residue] : 0;
  const pan = Math.max(-1, Math.min(1, xPos / 25));
  synth.triggerOvertone({
    fundamentalMidi: tonicMidi,
    harmonic,
    gain: walkers.gain,
    octaveShift: walkers.octaveOffset,
    pan,
    sustain: state.params.wdecay,
    harmonicity: state.params.wharmonicity,
    ss: cfg.ss,
  });
  if (state.params.wclick > 0) {
    synth.triggerWalkerClick(pan, walkers.gain * state.params.wclick);
  }
  if (state.residuePulses) state.residuePulses[w.residue] = 1;
};

function rebuildVoices() {
  if (!state.protein) return;
  const cfg = buildVoiceConfig(state.protein.residues, state.params);
  state.voiceCfg = cfg;
  synth.setVoices(cfg);
}

function rebuildPitches() {
  if (!state.protein || !state.voiceCfg) return;
  const midis = computePitches(state.protein.residues, state.params);
  for (let i = 0; i < state.voiceCfg.length; i++) {
    state.voiceCfg[i].midi = midis[i];
  }
  synth.setVoicePitches(midis);
}

function applyWalkerCount(n) {
  walkers.setCount(n);
}

async function loadProtein(id) {
  ui.setStatus(`fetching ${id}...`);
  try {
    const txt = await fetchPDB(id);
    const protein = parsePDB(txt);
    if (!protein.residues.length) throw new Error('no Cα atoms parsed');
    state.protein = protein;
    state.modeData = buildModes(protein.residues);
    const n = protein.residues.length;
    state.positions = new Float32Array(n * 3);
    state.prevPositions = new Float32Array(n * 3);
    state.speeds = new Float32Array(n);
    state.residuePulses = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = protein.residues[i];
      state.positions[3*i] = r.x;
      state.positions[3*i+1] = r.y;
      state.positions[3*i+2] = r.z;
    }
    state.prevPositions.set(state.positions);
    state.t0 = performance.now() / 1000;
    viewer.loadProtein(protein.residues);
    rebuildVoices();
    walkers.setContext(protein.residues, state.modeData.adjacency);
    applyWalkerCount(state.params.wcount);
    ui.setStatus(`${id} · ${n} residues`);
    ui.setInfo([
      protein.title.slice(0, 80),
      `${id}  residues=${n}  helices=${protein.residues.filter(r=>r.ss==='H').length}  sheets=${protein.residues.filter(r=>r.ss==='E').length}`,
    ].filter(Boolean).join('\n'));
  } catch (e) {
    console.error(e);
    ui.setStatus(`error: ${e.message}`);
  }
}

ui.on('load', loadProtein);
ui.on('play', () => {
  synth.init();
  synth.start();
  ui.setStatus('playing');
});
ui.on('stop', () => {
  synth.stop();
  ui.setStatus('stopped');
});
ui.on('param', (name, value) => {
  state.params[name] = value;
  if (name === 'master') synth.setMaster(value);
  else if (name === 'cutoff') synth.setCutoff(value);
  else if (name === 'reso') synth.setResonance(value);
  else if (name === 'delay') synth.setDelay(value);
  else if (name === 'reverb') synth.setReverb(value);
  if (name === 'tonic' || name === 'scale' || name === 'octaves' || name === 'quantize') {
    rebuildPitches();
    synth.setTonic(tonicSemitone(state.params.tonic), SCALES[state.params.scale]);
  }
  if (name === 'voices') synth.setVoiceRatio(value);
  if (name === 'wcount') applyWalkerCount(value);
  if (name === 'wstrategy') walkers.setStrategy(value);
  if (name === 'wrate') walkers.setRate(value);
  if (name === 'wgain') walkers.setGain(value);
  if (name === 'woct') walkers.setOctaveOffset(value);
  if (name === 'wrepel') walkers.setRepel(value);
  synth.setParams(state.params);
});

ui.on('midi-enable', async () => {
  try {
    const inputs = await midi.enable();
    ui.setMidiStatus(inputs.length ? `enabled: ${inputs.join(', ')}` : 'enabled (no inputs)');
    midi.onNoteOn = (note) => synth.setTranspose(note - 60);
    midi.onNoteOff = () => synth.setTranspose(0);
    midi.onCC = (cc, v) => {
      if (cc === 1)  { state.params.cohesion = v; synth.setParams(state.params); }
      if (cc === 74) { state.params.cutoff = 200 + v * 12000; synth.setCutoff(state.params.cutoff); }
      if (cc === 73) { state.params.grain = 0.01 + v * 0.4; synth.setParams(state.params); }
      if (cc === 71) { state.params.reso = 0.1 + v * 18; synth.setResonance(state.params.reso); }
      if (cc === 91) { state.params.reverb = v; synth.setReverb(v); }
      if (cc === 93) { state.params.delay = v; synth.setDelay(v); }
    };
    midi.onPitchBend = (v) => synth.setTranspose(v * 12);
  } catch (e) {
    ui.setMidiStatus(`error: ${e.message}`);
  }
});

ui.init();
synth.setParams(state.params);
synth.setTonic(tonicSemitone(state.params.tonic), SCALES[state.params.scale]);
synth.setVoiceRatio(state.params.voices);

const initial = document.getElementById('pdbid').value;
if (initial) loadProtein(initial);

function frame() {
  if (state.protein && state.modeData) {
    const t = performance.now() / 1000 - state.t0;
    state.prevPositions.set(state.positions);
    evaluatePositions(state.protein.residues, state.modeData, state.params, t, state.positions);
    const n = state.protein.residues.length;
    for (let i = 0; i < n; i++) {
      const dx = state.positions[3*i]   - state.prevPositions[3*i];
      const dy = state.positions[3*i+1] - state.prevPositions[3*i+1];
      const dz = state.positions[3*i+2] - state.prevPositions[3*i+2];
      const raw = Math.sqrt(dx*dx + dy*dy + dz*dz);
      state.speeds[i] = Math.min(0.05, raw);
    }
    synth.updateMotion(state.speeds, state.positions);

    walkers.tick(t);

    if (state.residuePulses) {
      const rp = state.residuePulses;
      for (let i = 0; i < rp.length; i++) rp[i] *= 0.88;
    }
    viewer.updatePositions(state.positions, state.residuePulses);
  }
  viewer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
