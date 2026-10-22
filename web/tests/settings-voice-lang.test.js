'use strict';
// Mutation coverage: restore the voice filter to course.contentLanguage only -> 'speech.lang wins over contentLanguage' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id) => ({ id, unit: 'u1', type: 'gap', prompt: 'Prompt ' + id, answers: ['a'], speak: 'konnichiwa' });
const V = (name, lang) => ({ name, lang });

async function settingsFor(course, voices) {
  const win = H.fakeWin(voices);
  const m = await H.mount({ items: [gap('a')], course, win, settings: {} });
  m.app.go('settings');
  const scr = m.screen(m.sb.DojoApp._SettingsScreen);
  return () => scr.view();
}

const VOICES = [V('Milena', 'ru-RU'), V('Otoya', 'ja-JP')];

test('speech.lang wins over contentLanguage: only ja voices are listed', async () => {
  const v = await settingsFor({ contentLanguage: 'ru', speech: { lang: 'ja' } }, VOICES);
  const text = H.text(H.find(v(), 'speech-voice-default'));
  assert.ok(/Otoya/.test(text), 'ja voice listed');
  assert.ok(!/Milena/.test(text), 'ru voice not listed');
});

test('no speech.lang: falls back to contentLanguage', async () => {
  const v = await settingsFor({ contentLanguage: 'ru', speech: { rate: 1 } }, VOICES);
  const text = H.text(H.find(v(), 'speech-voice-default'));
  assert.ok(/Milena/.test(text), 'ru voice listed');
  assert.ok(!/Otoya/.test(text), 'ja voice not listed');
});
