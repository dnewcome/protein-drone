import { AA_PROPS } from './mapping.js';

const STRATEGIES = {
  sequence(w, ctx) {
    const n = ctx.n;
    w.dir = w.dir || 1;
    let next = w.residue + w.dir;
    if (next >= n || next < 0) {
      w.dir *= -1;
      next = w.residue + w.dir;
    }
    return next;
  },

  contact(w, ctx) {
    const adj = ctx.adjacency[w.residue];
    if (!adj.length) return (w.residue + 1) % ctx.n;
    return adj[(Math.random() * adj.length) | 0];
  },

  levy(w, ctx) {
    if (Math.random() < 0.12) {
      return (Math.random() * ctx.n) | 0;
    }
    const adj = ctx.adjacency[w.residue];
    if (!adj.length) return (w.residue + (Math.random() < 0.5 ? -1 : 1) + ctx.n) % ctx.n;
    return adj[(Math.random() * adj.length) | 0];
  },

  gradient(w, ctx) {
    const adj = ctx.adjacency[w.residue];
    if (!adj.length) return (w.residue + 1) % ctx.n;
    const cur = AA_PROPS[ctx.residues[w.residue].oneLetter] || AA_PROPS.X;
    let best = adj[0], bestScore = -Infinity;
    for (const j of adj) {
      const p = AA_PROPS[ctx.residues[j].oneLetter] || AA_PROPS.X;
      const score = (p.hydro - cur.hydro) * w.gradientSign + (Math.random() - 0.5) * 0.6;
      if (score > bestScore) { bestScore = score; best = j; }
    }
    return best;
  },

  sschain(w, ctx) {
    const curSS = ctx.residues[w.residue].ss;
    const adj = ctx.adjacency[w.residue];
    const same = adj.filter(j => ctx.residues[j].ss === curSS);
    if (same.length && Math.random() < 0.8) return same[(Math.random() * same.length) | 0];
    if (adj.length) return adj[(Math.random() * adj.length) | 0];
    return (w.residue + 1) % ctx.n;
  },

  brownian(w, ctx) {
    const r = ctx.residues[w.residue];
    const sigma = 4.0;
    const tx = r.x + (Math.random() - 0.5) * sigma * 2;
    const ty = r.y + (Math.random() - 0.5) * sigma * 2;
    const tz = r.z + (Math.random() - 0.5) * sigma * 2;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < ctx.n; i++) {
      const ri = ctx.residues[i];
      const dx = ri.x - tx, dy = ri.y - ty, dz = ri.z - tz;
      const d = dx*dx + dy*dy + dz*dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  },
};

export const STRATEGY_NAMES = Object.keys(STRATEGIES);

export class WalkerSystem {
  constructor() {
    this.walkers = [];
    this.ctx = null;
    this.strategy = 'contact';
    this.rate = 6;
    this.gain = 0.7;
    this.octaveOffset = 0;
    this.repel = 0;
    this.onVisit = () => {};
    this._lastTime = 0;
  }

  setContext(residues, adjacency) {
    this.ctx = { residues, adjacency, n: residues.length };
    for (const w of this.walkers) {
      if (w.residue >= this.ctx.n) w.residue = 0;
      w.nextStepTime = 0;
    }
  }

  setStrategy(s) { if (STRATEGIES[s]) this.strategy = s; }
  setRate(hz) { this.rate = Math.max(0.1, hz); }
  setGain(g) { this.gain = g; }
  setOctaveOffset(o) { this.octaveOffset = o; }
  setRepel(r) { this.repel = r; }

  setCount(n) {
    n = Math.max(0, Math.min(16, n | 0));
    if (!this.ctx) return;
    while (this.walkers.length < n) this._spawn();
    while (this.walkers.length > n) this.walkers.pop();
  }

  _spawn() {
    if (!this.ctx) return;
    const id = this.walkers.length;
    const hue = (id * 67) % 360;
    const harmonicSets = [
      [2, 3, 5],
      [3, 4, 5, 7],
      [2, 4, 6, 8],
      [3, 5, 7, 9],
      [2, 3, 4, 6, 8],
      [5, 6, 7, 9, 11],
      [2, 5, 8],
      [3, 6, 9, 12],
    ];
    this.walkers.push({
      id,
      residue: (Math.random() * this.ctx.n) | 0,
      dir: Math.random() < 0.5 ? 1 : -1,
      gradientSign: Math.random() < 0.5 ? 1 : -1,
      hue,
      harmonicSet: harmonicSets[id % harmonicSets.length],
      nextStepTime: 0,
      lastVisit: 0,
    });
  }

  walkerPositions(out) {
    if (!this.ctx) return 0;
    for (let i = 0; i < this.walkers.length; i++) {
      const r = this.ctx.residues[this.walkers[i].residue];
      out[3*i] = r.x; out[3*i+1] = r.y; out[3*i+2] = r.z;
    }
    return this.walkers.length;
  }

  walkerHues(out) {
    for (let i = 0; i < this.walkers.length; i++) out[i] = this.walkers[i].hue;
    return this.walkers.length;
  }

  tick(now) {
    if (!this.ctx) return;
    const fn = STRATEGIES[this.strategy];
    const stepInterval = 1 / this.rate;
    for (const w of this.walkers) {
      if (w.nextStepTime === 0) w.nextStepTime = now;
      while (w.nextStepTime <= now) {
        let next = fn(w, this.ctx);
        if (this.repel > 0 && this.walkers.length > 1) {
          const r = this.ctx.residues[next];
          let crowded = 0;
          for (const o of this.walkers) {
            if (o === w) continue;
            const or = this.ctx.residues[o.residue];
            const dx = r.x - or.x, dy = r.y - or.y, dz = r.z - or.z;
            if (dx*dx + dy*dy + dz*dz < 25) crowded++;
          }
          if (crowded > 0 && Math.random() < this.repel) {
            const adj = this.ctx.adjacency[w.residue];
            if (adj.length) next = adj[(Math.random() * adj.length) | 0];
          }
        }
        w.residue = next;
        w.lastVisit = now;
        this.onVisit(w);
        w.nextStepTime += stepInterval * (0.7 + Math.random() * 0.6);
      }
    }
  }
}
