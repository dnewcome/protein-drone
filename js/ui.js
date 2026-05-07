import { PRESETS } from './presets.js';

export class UI {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.handlers = {};
  }

  on(name, fn) { this.handlers[name] = fn; }
  emit(name, ...args) { if (this.handlers[name]) this.handlers[name](...args); }

  init() {
    const presetSel = this.el('preset');
    for (const p of PRESETS) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id} — ${p.name}`;
      presetSel.appendChild(opt);
    }
    presetSel.addEventListener('change', () => {
      const id = presetSel.value;
      this.el('pdbid').value = id;
      if (id) this.emit('load', id);
    });
    this.el('pdbid').value = PRESETS[0].id;

    this.el('load').addEventListener('click', () => {
      const id = this.el('pdbid').value.trim();
      if (id) this.emit('load', id);
    });
    this.el('play').addEventListener('click', () => this.emit('play'));
    this.el('stop').addEventListener('click', () => this.emit('stop'));

    const param = (id, name, transform = (x) => x) => {
      const el = this.el(id);
      const fire = () => this.emit('param', name, transform(el.value));
      el.addEventListener('input', fire);
      fire();
    };

    param('master',  'master',  v => parseFloat(v));
    param('speed',   'speed',   v => parseFloat(v));
    param('amp',     'amp',     v => parseFloat(v));
    param('modemix', 'modemix', v => parseFloat(v));
    param('field',   'field',   v => parseFloat(v));
    param('voices',  'voices',  v => parseFloat(v));
    param('cohesion','cohesion',v => parseFloat(v));
    param('density', 'density', v => parseFloat(v));
    param('grain',   'grain',   v => parseFloat(v));
    param('spread',  'spread',  v => parseFloat(v));
    param('octaves', 'octaves', v => parseInt(v));
    param('quantize','quantize',v => parseFloat(v));
    param('wcount',  'wcount',  v => parseInt(v));
    param('wrate',   'wrate',   v => parseFloat(v));
    param('wgain',   'wgain',   v => parseFloat(v));
    param('woct',    'woct',    v => parseInt(v));
    param('wrepel',  'wrepel',  v => parseFloat(v));
    param('wdecay',  'wdecay',  v => parseFloat(v));
    param('wharmonicity', 'wharmonicity', v => parseFloat(v));
    param('wclick',  'wclick',  v => parseFloat(v));
    this.el('wstrategy').addEventListener('change', () => this.emit('param', 'wstrategy', this.el('wstrategy').value));
    this.emit('param', 'wstrategy', this.el('wstrategy').value);
    param('cutoff',  'cutoff',  v => parseFloat(v));
    param('reso',    'reso',    v => parseFloat(v));
    param('delay',   'delay',   v => parseFloat(v));
    param('reverb',  'reverb',  v => parseFloat(v));
    this.el('tonic').addEventListener('change', () => this.emit('param', 'tonic', this.el('tonic').value));
    this.el('scale').addEventListener('change', () => this.emit('param', 'scale', this.el('scale').value));
    this.emit('param', 'tonic', this.el('tonic').value);
    this.emit('param', 'scale', this.el('scale').value);

    this.el('midi-enable').addEventListener('click', () => this.emit('midi-enable'));
  }

  setStatus(s) { this.el('status').textContent = s; }
  setInfo(s)   { this.el('info').textContent = s; }
  setMidiStatus(s) { this.el('midi-status').textContent = s; }
}
