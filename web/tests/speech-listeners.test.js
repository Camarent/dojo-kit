'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fakeWin, load } = require('./speech.helpers.js');

test('voiceschanged listener is registered once per synth across repeated status and available calls', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([]);
  const added = [];
  win.speechSynthesis.addEventListener = (name, fn) => { added.push({ name, fn }); };
  S.status({}, win);
  S.status({}, win);
  assert.strictEqual(S.available(win), true);
  assert.strictEqual(S.available(win), true);
  assert.deepStrictEqual(added.map((a) => a.name), ['voiceschanged']);
});

test('voiceschanged fired after an empty voice list turns status into no_voice', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([]);
  let fire = null;
  win.speechSynthesis.addEventListener = (name, fn) => { fire = fn; };
  assert.strictEqual(S.status({}, win), 'ok');
  fire();
  assert.strictEqual(S.status({}, win), 'no_voice');
});
