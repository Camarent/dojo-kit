'use strict';
// Mutation coverage (restored): make matching count all voices -> 'diag: 2 voices (en-US, fr_FR) with cfg lang fr-FR gives voices 2, matching 1' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');
const { loadBundle } = require('./load-bundle.js');

const V = (name, lang) => ({ name, lang });
const COURSE = { contentLanguage: 'fr-FR', speech: { lang: 'fr-FR', rate: 1 } };

function loadSpeech() {
  const sb = { console };
  loadBundle(sb, { only: ['speech.js'] });
  return sb.DojoSpeech;
}

test('diag: no speech API gives api false, voices 0', () => {
  const S = loadSpeech();
  const d = S.diag({ lang: 'fr-FR' }, {});
  assert.strictEqual(d.api, false);
  assert.strictEqual(d.voices, 0);
  assert.strictEqual(d.matching, 0);
  assert.strictEqual(d.lang, 'fr-FR');
});

test('diag: 2 voices (en-US, fr_FR) with cfg lang fr-FR gives voices 2, matching 1', () => {
  const S = loadSpeech();
  const win = H.fakeWin([V('Alex', 'en-US'), V('Amelie', 'fr_FR')]);
  const d = S.diag({ lang: 'fr-FR' }, win);
  assert.strictEqual(d.api, true);
  assert.strictEqual(d.voices, 2);
  assert.strictEqual(d.matching, 1);
  assert.strictEqual(d.lang, 'fr-FR');
});

test('diag: lang taken from course.speech.lang first', () => {
  const S = loadSpeech();
  const win = H.fakeWin([V('Alex', 'en-US'), V('Amelie', 'fr_FR')]);
  const d = S.diag({ speech: { lang: 'en' }, lang: 'fr-FR' }, win);
  assert.strictEqual(d.lang, 'en');
  assert.strictEqual(d.matching, 1);
});

test('settings render: speech-diag line shows api, voice count and language match', async () => {
  const win = H.fakeWin([V('Alex', 'en-US'), V('Amelie', 'fr_FR')]);
  const m = await H.mount({ items: [{ id: 'a', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'], speak: 'bonjour' }], course: COURSE, win, settings: {} });
  m.app.go('settings');
  const scr = m.screen(m.sb.DojoApp._SettingsScreen);
  const line = H.find(scr.view(), 'speech-diag');
  assert.ok(line, 'speech-diag rendered');
  assert.ok(/yes/.test(H.text(line)));
  assert.ok(/voices: 2/.test(H.text(line)));
  assert.ok(/fr-FR: 1/.test(H.text(line)));
});

test('settings render without speech API: speech-diag line still shown with api no', async () => {
  const win = H.fakeWin([]);
  delete win.speechSynthesis;
  const m = await H.mount({ items: [{ id: 'a', unit: 'u1', type: 'gap', prompt: 'P', answers: ['a'], speak: 'bonjour' }], course: COURSE, win, settings: {} });
  m.app.go('settings');
  const scr = m.screen(m.sb.DojoApp._SettingsScreen);
  const tree = scr.view();
  assert.ok(H.find(tree, 'speech-novoices'));
  const line = H.find(tree, 'speech-diag');
  assert.ok(line, 'speech-diag rendered without API');
  assert.ok(/: no;/.test(H.text(line)));
  assert.ok(/voices: 0/.test(H.text(line)));
});
