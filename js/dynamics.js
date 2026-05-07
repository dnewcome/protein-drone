function jacobi3(M) {
  let a = [
    [M[0][0], M[0][1], M[0][2]],
    [M[1][0], M[1][1], M[1][2]],
    [M[2][0], M[2][1], M[2][2]],
  ];
  let v = [[1,0,0],[0,1,0],[0,0,1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-10) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-12) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta*theta + 1));
        const c = 1 / Math.sqrt(t*t + 1);
        const s = t * c;
        const app = a[p][p] - t * apq;
        const aqq = a[q][q] + t * apq;
        a[p][p] = app; a[q][q] = aqq;
        a[p][q] = 0; a[q][p] = 0;
        for (let r = 0; r < 3; r++) {
          if (r !== p && r !== q) {
            const arp = a[r][p], arq = a[r][q];
            a[r][p] = c*arp - s*arq; a[p][r] = a[r][p];
            a[r][q] = s*arp + c*arq; a[q][r] = a[r][q];
          }
        }
        for (let r = 0; r < 3; r++) {
          const vrp = v[r][p], vrq = v[r][q];
          v[r][p] = c*vrp - s*vrq;
          v[r][q] = s*vrp + c*vrq;
        }
      }
    }
  }
  const eigs = [
    { val: a[0][0], vec: [v[0][0], v[1][0], v[2][0]] },
    { val: a[1][1], vec: [v[0][1], v[1][1], v[2][1]] },
    { val: a[2][2], vec: [v[0][2], v[1][2], v[2][2]] },
  ];
  eigs.sort((x, y) => y.val - x.val);
  return eigs;
}

export function buildModes(residues) {
  const n = residues.length;
  let cxx=0, cyy=0, czz=0, cxy=0, cxz=0, cyz=0;
  for (const r of residues) {
    cxx += r.x*r.x; cyy += r.y*r.y; czz += r.z*r.z;
    cxy += r.x*r.y; cxz += r.x*r.z; cyz += r.y*r.z;
  }
  const C = [
    [cxx/n, cxy/n, cxz/n],
    [cxy/n, cyy/n, cyz/n],
    [cxz/n, cyz/n, czz/n],
  ];
  const pcs = jacobi3(C);

  const cutoff = 10.0, c2 = cutoff * cutoff;
  const contacts = new Float32Array(n);
  const adjacency = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const ri = residues[i];
    for (let j = i + 1; j < n; j++) {
      const rj = residues[j];
      const dx = ri.x - rj.x, dy = ri.y - rj.y, dz = ri.z - rj.z;
      if (dx*dx + dy*dy + dz*dz < c2) {
        adjacency[i].push(j);
        adjacency[j].push(i);
      }
    }
    contacts[i] = adjacency[i].length;
  }
  const fluctuation = new Float32Array(n);
  let maxFlux = 0;
  for (let i = 0; i < n; i++) {
    fluctuation[i] = 1 / Math.sqrt(contacts[i] + 1);
    if (fluctuation[i] > maxFlux) maxFlux = fluctuation[i];
  }
  for (let i = 0; i < n; i++) fluctuation[i] /= maxFlux;

  const modes = [];
  for (let k = 0; k < 4; k++) {
    const wavenumber = (k + 1) * Math.PI;
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      phase[i] = wavenumber * (i / n) + (k * 0.31);
    }
    const axis = pcs[k % 3].vec.slice();
    const angularFreq = 0.6 + 0.7 * k;
    modes.push({ phase, axis, angularFreq });
  }

  return { modes, fluctuation, pcs, adjacency };
}

export function evaluatePositions(residues, modeData, params, t, out) {
  const { modes, fluctuation } = modeData;
  const n = residues.length;
  const amp = params.amp;
  const speed = params.speed;
  const mix = params.modemix;
  const weights = [
    1.0 - 0.6 * mix,
    0.85,
    0.7 * mix,
    0.45 * mix,
  ];
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0, dz = 0;
    const flux = fluctuation[i];
    for (let k = 0; k < modes.length; k++) {
      const m = modes[k];
      const a = Math.sin(m.angularFreq * speed * t + m.phase[i]) * weights[k] * flux;
      dx += a * m.axis[0];
      dy += a * m.axis[1];
      dz += a * m.axis[2];
    }
    const r = residues[i];
    out[3*i]   = r.x + dx * amp;
    out[3*i+1] = r.y + dy * amp;
    out[3*i+2] = r.z + dz * amp;
  }
}

export function residueSpeeds(modeData, params, t, prevPositions, currPositions, out) {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const dx = currPositions[3*i]   - prevPositions[3*i];
    const dy = currPositions[3*i+1] - prevPositions[3*i+1];
    const dz = currPositions[3*i+2] - prevPositions[3*i+2];
    out[i] = Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
}
