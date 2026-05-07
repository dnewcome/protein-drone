export class MidiInput {
  constructor() {
    this.access = null;
    this.onNoteOn = () => {};
    this.onNoteOff = () => {};
    this.onCC = () => {};
    this.onPitchBend = () => {};
  }

  async enable() {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI not supported');
    }
    this.access = await navigator.requestMIDIAccess();
    const attach = () => {
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = (msg) => this._handle(msg.data);
      }
    };
    attach();
    this.access.onstatechange = attach;
    return Array.from(this.access.inputs.values()).map(i => i.name);
  }

  _handle(data) {
    const status = data[0] & 0xf0;
    const d1 = data[1], d2 = data[2];
    if (status === 0x90 && d2 > 0) this.onNoteOn(d1, d2 / 127);
    else if (status === 0x80 || (status === 0x90 && d2 === 0)) this.onNoteOff(d1);
    else if (status === 0xb0) this.onCC(d1, d2 / 127);
    else if (status === 0xe0) {
      const v = ((d2 << 7) | d1) - 8192;
      this.onPitchBend(v / 8192);
    }
  }
}
