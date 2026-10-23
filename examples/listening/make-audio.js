'use strict';
// Generates audio/pack-00.bin (concatenated 8-bit mono 8 kHz WAV clips d0..d9) and audio/manifest.json.
// Clip dN holds N beeps (d0: one long low tone). Synthetic tones only. Usage: node make-audio.js
const fs = require('node:fs');
const path = require('node:path');

const RATE = 8000;

function tone(freq, ms) {
  const n = Math.round((RATE * ms) / 1000);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = 128 + Math.round(90 * Math.sin((2 * Math.PI * freq * i) / RATE));
  return out;
}

function silence(ms) {
  return Buffer.alloc(Math.round((RATE * ms) / 1000), 128);
}

function wav(data) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function clip(n) {
  if (n === 0) return wav(tone(220, 600));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(tone(880, 80), silence(80));
  return wav(Buffer.concat(parts));
}

function build() {
  const clips = {};
  const bufs = [];
  let off = 0;
  for (let n = 0; n <= 9; n++) {
    const b = clip(n);
    clips['d' + n] = { pack: 0, off, len: b.length, ms: Math.round((b.length - 44) * 1000 / RATE), mime: 'audio/wav' };
    bufs.push(b);
    off += b.length;
  }
  const pack = Buffer.concat(bufs);
  return { pack, manifest: { v: 1, packs: [{ file: 'pack-00.bin', bytes: pack.length }], clips } };
}

if (require.main === module) {
  const dir = path.join(__dirname, 'audio');
  fs.mkdirSync(dir, { recursive: true });
  const { pack, manifest } = build();
  fs.writeFileSync(path.join(dir, 'pack-00.bin'), pack);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
module.exports = { build };
