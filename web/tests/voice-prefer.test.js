'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console };
  loadBundle(sb, { only: ['ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'speech.js'] });
  return sb;
}
const V = (name, lang, local) => ({ name, lang, localService: local });
const voices = [V('Alpha', 'ja-JP'), V('Kyoko', 'ja-JP'), V('Otoya Premium', 'ja-JP'), V('Zed', 'en-US')];

test('prefer ranks matching voices first, earlier pattern wins, case-insensitive', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { role: 'm', prefer: ['OTOYA', 'kyoko'] }).name, 'Otoya Premium');
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { role: 'm', prefer: ['nomatch', 'kyoko'] }).name, 'Kyoko');
});

test('no prefer, empty, or invalid patterns keep the default order', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, {}).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { prefer: [] }).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { prefer: ['(', '', 5, 'kyoko'] }).name, 'Kyoko');
});

test('prefer outranks the DojoExt.voiceRank hook; the hook still breaks ties', () => {
  const sb = load();
  sb.DojoExt.registerVoiceRank((v) => (v.name === 'Alpha' ? 5 : 0));
  assert.strictEqual(sb.DojoSpeech.pickVoice(voices, 'ja-JP', undefined, { prefer: ['kyoko'] }).name, 'Kyoko');
  assert.strictEqual(sb.DojoSpeech.pickVoice(voices, 'ja-JP', undefined, { prefer: ['zzz'] }).name, 'Alpha');
});

test('prefer never leaves the language pool and an explicit name still wins', () => {
  const S = load().DojoSpeech;
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { prefer: ['zed'] }).name, 'Alpha');
  assert.strictEqual(S.pickVoice(voices, 'ja-JP', undefined, { name: 'Zed', prefer: ['kyoko'] }).name, 'Zed');
});

test('play passes the role prefer from course speech.voices', () => {
  const S = load().DojoSpeech;
  const spoken = [];
  const win = { SpeechSynthesisUtterance: function (t) { this.text = t; }, speechSynthesis: { getVoices: () => voices, speak: (u) => spoken.push(u), cancel() {} } };
  S.play([{ text: 'x', voice: 'm' }, { text: 'y', voice: 'f' }], { lang: 'ja', speech: { lang: 'ja-JP', voices: { m: { prefer: ['otoya'] }, f: { prefer: ['kyoko'] } } } }, {}, win);
  assert.deepStrictEqual(spoken.map((u) => u.voice.name), ['Otoya Premium', 'Kyoko']);
});
