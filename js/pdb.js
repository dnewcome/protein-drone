const THREE_TO_ONE = {
  ALA:'A', ARG:'R', ASN:'N', ASP:'D', CYS:'C', GLU:'E', GLN:'Q', GLY:'G',
  HIS:'H', ILE:'I', LEU:'L', LYS:'K', MET:'M', PHE:'F', PRO:'P', SER:'S',
  THR:'T', TRP:'W', TYR:'Y', VAL:'V', SEC:'U', PYL:'O',
};

export async function fetchPDB(id) {
  const url = `https://files.rcsb.org/download/${id.toUpperCase()}.pdb`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${id}: ${r.status}`);
  return r.text();
}

export function parsePDB(text) {
  const residues = [];
  const helixRanges = [];
  const sheetRanges = [];
  const seenKey = new Set();
  let title = '';

  for (const line of text.split('\n')) {
    const rec = line.slice(0, 6).trim();
    if (rec === 'TITLE') {
      title += ' ' + line.slice(10, 80).trim();
    } else if (rec === 'HELIX') {
      const chain = line[19];
      const start = parseInt(line.slice(21, 25));
      const end = parseInt(line.slice(33, 37));
      helixRanges.push({ chain, start, end });
    } else if (rec === 'SHEET') {
      const chain = line[21];
      const start = parseInt(line.slice(22, 26));
      const end = parseInt(line.slice(33, 37));
      sheetRanges.push({ chain, start, end });
    } else if (rec === 'ATOM') {
      const atomName = line.slice(12, 16).trim();
      if (atomName !== 'CA') continue;
      const altLoc = line[16];
      if (altLoc !== ' ' && altLoc !== 'A') continue;
      const resName = line.slice(17, 20).trim();
      const chain = line[21];
      const resSeq = parseInt(line.slice(22, 26));
      const iCode = line[26];
      const key = `${chain}|${resSeq}|${iCode}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      const x = parseFloat(line.slice(30, 38));
      const y = parseFloat(line.slice(38, 46));
      const z = parseFloat(line.slice(46, 54));
      const bfactor = parseFloat(line.slice(60, 66)) || 0;
      residues.push({
        chain, resSeq, resName,
        oneLetter: THREE_TO_ONE[resName] || 'X',
        x, y, z, bfactor,
        ss: 'C',
      });
    } else if (rec === 'ENDMDL') {
      break;
    }
  }

  for (const r of residues) {
    for (const h of helixRanges) {
      if (r.chain === h.chain && r.resSeq >= h.start && r.resSeq <= h.end) { r.ss = 'H'; break; }
    }
    if (r.ss === 'C') {
      for (const s of sheetRanges) {
        if (r.chain === s.chain && r.resSeq >= s.start && r.resSeq <= s.end) { r.ss = 'E'; break; }
      }
    }
  }

  let cx = 0, cy = 0, cz = 0;
  for (const r of residues) { cx += r.x; cy += r.y; cz += r.z; }
  const n = residues.length || 1;
  cx /= n; cy /= n; cz /= n;
  for (const r of residues) { r.x -= cx; r.y -= cy; r.z -= cz; }

  return {
    title: title.trim(),
    residues,
  };
}
