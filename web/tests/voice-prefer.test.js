'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console };
  loadBundle(sb, { only: ['ext/registry.js', 'ext/input-script.js', 'ext.js', 'speech.js'] });
  return sb;
}
const V = (name, lang, local) => ({ name, lang, localService: local });
const voices = [V('Alpha', 'es-ES'), V('Mira', 'es-ES'), V('Oscar Premium', 'es-ES'), V('Zed', 'en-US')];

test('prefer ranks matching voices first, earlier pattern wins, case-insensitive', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { role: 'm', prefer: ['OSCAR', 'mira'] }).name, 'Oscar Premium');
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { role: 'm', prefer: ['nomatch', 'mira'] }).name, 'Mira');
});

test('no prefer, empty, or invalid patterns keep the default order', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, {}).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { prefer: [] }).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { prefer: ['(', '', 5, 'mira'] }).name, 'Mira');
});

test('prefer outranks the DojoExt.voiceRank hook; the hook still breaks ties', () => {
  const sb = load();
  sb.DojoExt.registerVoiceRank((v) => (v.name === 'Alpha' ? 5 : 0));
  assert.strictEqual(sb.DojoSpeech.pickVoice(voices, 'es-ES', undefined, { prefer: ['mira'] }).name, 'Mira');
  assert.strictEqual(sb.DojoSpeech.pickVoice(voices, 'es-ES', undefined, { prefer: ['zzz'] }).name, 'Alpha');
});

test('prefer never leaves the language pool and an explicit name still wins', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { prefer: ['zed'] }).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'es-ES', undefined, { name: 'Zed', prefer: ['mira'] }).name, 'Zed');
});

test('play passes the role prefer from course speech.voices', () => {
  const S = load().DojoSpeech;
  const spoken = [];
  const win = { SpeechSynthesisUtterance: function (t) { this.text = t; }, speechSynthesis: { getVoices: () => voices, speak: (u) => spoken.push(u), cancel() {} } };
  S.play([{ text: 'x', voice: 'm' }, { text: 'y', voice: 'f' }], { lang: 'es', speech: { lang: 'es-ES', voices: { m: { prefer: ['oscar'] }, f: { prefer: ['mira'] } } } }, {}, win);
  assert.deepStrictEqual(spoken.map((u) => u.voice.name), ['Oscar Premium', 'Mira']);
});
