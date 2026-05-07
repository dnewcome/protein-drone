# protein-drone

A browser-based real-time granular synthesizer that turns proteins into music. Drone field of grains driven by per-residue chemistry; autonomous walkers traverse the protein's 3D contact graph and excite sustained harmonic partials of a tonal root. Inspired by [MIT research on protein sonification](https://news.mit.edu/2019/translating-proteins-music-0626).

The goal is musical playability over physics accuracy, but the structural detail (sequence, secondary structure, contact graph, pseudo-mode collective motion) is real and shapes the sound.

## Run it

```bash
./serve.sh
# open http://localhost:8000
```

Pure ES modules, no build step. Three.js loaded via CDN import map.

Click **load**, then **play**. Audio needs a click for the browser autoplay gate.

## What's happening

### The drone (granular field)
- Each residue (or a sampled subset, capped at 64) is a granular voice that fires short oscillator grains
- Pitch comes from Kyte-Doolittle hydrophobicity quantized to a chosen scale
- Waveform comes from charge: positively charged → saw, negatively charged → square, polar → sine, aromatic → triangle
- Mass biases detune and gain
- Secondary structure (helix / sheet / coil) routes each grain through different proportions of dry / delay / reverb buses
- The protein animates with four pseudo-collective modes (sequence-position basis projected onto principal axes); residues with fewer local contacts move more, like real flexible loops
- Per-residue motion magnitude drives grain density; cohesion pulls voices toward chord tones of the active scale

### The walkers (overtone agents)
Autonomous agents that traverse the protein graph. Each visit fires a sustained sine partial at an integer (or stretched) multiple of the tonic, plus an optional percussive click. Multiple walkers stack distinct harmonic palettes into chord-like overtone clusters.

Six traversal strategies:
- **sequence** — march along the backbone, bouncing at endpoints
- **contact** — jump to a random spatial neighbor (within 10 Å) — graph-aware
- **levy** — like contact but with ~12% random teleports
- **gradient** — climb (or descend) the hydrophobicity gradient
- **sschain** — strongly prefer staying within the same secondary-structure element
- **brownian** — 3D Gaussian drift, snap to nearest residue

Each walker has its own harmonic-set preference (e.g., walker 0 favors [2, 3, 5]; walker 1 favors [3, 4, 5, 7]) so adding walkers builds chord shapes. The visited residue's hydrophobicity selects which partial in the set fires (hydrophobic residues hit higher partials).

When a walker visits, the actual residue sphere brightens and scales up; no overlay sprite.

### Mapping summary
| domain | source | drives |
|---|---|---|
| sequence | hydrophobicity, mass, charge, polarity, aromaticity | pitch, waveform, detune, gain |
| structure | helix / sheet / coil | dry / delay / reverb routing |
| dynamics | per-residue contact-density-weighted motion | grain trigger rate, pan, fade-in |
| graph | 10 Å contact map | walker traversal |
| walker visit | residue properties + walker's harmonic set | which partial of the tonic to excite |

## Controls

**source** — fungal-heavy preset list (hydrophobins, laccase, PsiM, yeast cyt-c, ATP synthase rotor) or any RCSB PDB ID. Selecting a preset auto-loads it.

**transport** — play / stop, master gain.

**dynamics** — speed, amplitude, mode mix. Speed normalizes for volume so it changes density/texture without changing perceived loudness.

**swarm** — field gain (drone level), voices (drone polyphony fraction), cohesion (pulls drone voices toward chord tones), density (grain rate), grain size, spread (stereo width).

**tonal** — tonic, scale, octave range, quantize. Updates pitches in place to avoid scheduler-burst volume jumps.

**walkers** — count, strategy, rate, gain, octave shift, repel, decay (partial sustain), harmonicity (0 = pure integer harmonics, 1 = bell-like stretched), click (visit articulation noise).

**master fx** — cutoff, resonance, delay, reverb sends.

**midi** — Web MIDI keyboard transposes; CC1 = cohesion, CC74 = cutoff, CC73 = grain size, CC71 = resonance, CC91 = reverb, CC93 = delay.

## Suggested explorations

- **2FZ6 hydrophobin**, aeolian, cohesion 0.8, walkers 4 contact rate 6 Hz decay 2 s → minor-triad drone with shimmering harmonic wash
- **6IR0 PsiM** (psilocybin biosynthesis methyltransferase), lydian, walkers 6 gradient rate 2 Hz decay 4 s → very slow harmonic evolution as walkers oscillate around hydrophobicity peaks
- **1GYC laccase**, dorian, walkers 3 sschain rate 10 Hz click 0.6 → walker locks inside helices; you can hear it cross between SS elements
- **1UBQ ubiquitin** (small + fast control), majPent, walkers 1 sequence rate 14 Hz click 0.7 decay 0.4 → walker becomes a clear melodic line tracking the backbone

## Stack

- Web Audio API for synthesis (granular voices, master FX bus with biquad filter → delay → convolver reverb → compressor)
- Three.js InstancedMesh for the residue spheres (direct typed-array writes for matrix updates; lower-poly geometry; conditional color buffer updates)
- ES modules served statically; no bundler

## Files

```
index.html           page layout + import map
css/style.css        dark UI
js/main.js           coordinator
js/pdb.js            RCSB fetch + Cα/secondary-structure parser
js/dynamics.js       4-mode collective motion + contact graph
js/mapping.js        amino acid property tables, scale/chord helpers
js/synth.js          Web Audio engine (drone grains + walker overtones + FX bus)
js/walkers.js        traversal strategies + walker manager
js/viewer.js         Three.js viewer with per-residue glow
js/ui.js             DOM control bindings
js/midi.js           Web MIDI input
js/presets.js        curated PDB preset list
serve.sh             python3 -m http.server helper
```

## Caveats

- The "collective motion" is a fast pseudo-modal animation, not real ANM/ENM. It looks and behaves like protein breathing but the magnitudes and frequencies aren't physically calibrated.
- The contact cutoff (10 Å) is a coarse approximation of structural contacts.
- Walker partial frequencies are integer (or slightly stretched) multiples of the tonic, not derived from amino-acid vibrational spectra.
- Tested on Chrome / Firefox desktop. Web MIDI requires a Chromium-based browser or Firefox with MIDI enabled.
