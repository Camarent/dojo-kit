'use strict';
// Mutation coverage (each restored): build cfg without speechCfg() in audioProps -> 'speech settings reach the session cfg' fails;
// drop the voiceschanged listener -> 'rerenders on voiceschanged' fails.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

const gap = (id) => ({ id, unit: 'u1', type: 'gap', prompt: 'Prompt ' + id, answers: ['a'], speak: 'konnichiwa' });
const V = (name, lang) => ({ name, lang });
const COURSE = { contentLanguage: 'es', speech: { lang: 'es-ES', rate: 1, voices: { M: { match: 'oscar', pitch: 0.8 }, F: { match: 'mira', pitch: 1.2 } } } };

async function settings(voices, st) {
  const win = H.fakeWin(voices);
  const m = await H.mount({ items: [gap('a')], course: COURSE, win, settings: st });
  m.app.go('settings');
  const scr = m.screen(m.sb.DojoApp._SettingsScreen);
  return { m, scr, win, v: () => scr.view() };
}

test('section: one select per role plus default, rate and pitch ranges, Test buttons', async () => {
  const { v } = await settings([V('Oscar', 'es-ES'), V('Mira', 'es-ES'), V('Alex', 'en-US')]);
  const tree = v();
  ['speech-settings', 'speech-voice-default', 'speech-voice-M', 'speech-voice-F', 'speech-rate', 'speech-pitch', 'speech-test-M', 'speech-test-default'].forEach((id) => assert.ok(H.find(tree, id), id));
  assert.ok(!/Alex/.test(H.text(H.find(tree, 'speech-voice-M'))), 'other languages are not offered');
});

test('no voices: section hidden behind a notice', async () => {
  const { v } = await settings([]);
  const tree = v();
  assert.ok(H.find(tree, 'speech-novoices'));
  assert.strictEqual(H.find(tree, 'speech-voice-default'), null);
});

test('rerenders on voiceschanged', async () => {
  const { win, scr, v } = await settings([]);
  assert.ok(H.find(v(), 'speech-novoices'));
  scr.componentDidMount();
  win.voices = [V('Oscar', 'es-ES')];
  win.listeners.voiceschanged.forEach((f) => f());
  assert.ok(H.find(v(), 'speech-voice-default'));
  scr.componentWillUnmount();
  assert.strictEqual(win.listeners.voiceschanged.length, 0);
});

test('changing a select / range writes speech:* settings; Auto clears with a tombstone', async () => {
  const { m, v } = await settings([V('Oscar', 'es-ES')]);
  H.find(v(), 'speech-voice-M').props.onChange({ target: { value: 'Oscar' } });
  assert.strictEqual(m.doc.settings['speech:voice:M'], 'Oscar');
  H.find(v(), 'speech-rate').props.onChange({ target: { value: '9' } });
  assert.strictEqual(m.doc.settings['speech:rate'], 1.5);
  H.find(v(), 'speech-voice-M').props.onChange({ target: { value: '' } });
  assert.strictEqual(m.doc.settings['speech:voice:M'], null);
  assert.ok(m.doc.settings.ts['speech:voice:M'] > 0);
});

test('a stored voice missing on this device stays selectable as "not on this device"', async () => {
  const { v } = await settings([V('Oscar', 'es-ES')], { 'speech:voice:F': 'Hanna' });
  assert.ok(/not on this device/.test(H.text(H.find(v(), 'speech-voice-F'))));
});

test('Test button plays through effective(): role voice, learner rate', async () => {
  const { win, scr } = await settings([V('Oscar', 'es-ES'), V('Mira', 'es-ES')], { 'speech:rate': 1.5, 'speech:voice:M': 'Mira' });
  scr.testSpeech('M');
  assert.strictEqual(win.spoken.length, 1);
  assert.strictEqual(win.spoken[0].voice.name, 'Mira');
  assert.strictEqual(win.spoken[0].rate, 1.5);
});

test('speech settings reach the session cfg (SessionScreen)', async () => {
  const win = H.fakeWin([V('Oscar', 'es-ES')]);
  const m = await H.mount({ items: [gap('a')], course: COURSE, win, settings: { 'speech:rate': 1.5, 'speech:voice:M': 'Oscar' } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  const cfg = scr.audioProps(scr.props, scr.state).cfg;
  assert.strictEqual(cfg.speech.voices.M.name, 'Oscar');
  assert.strictEqual(cfg.speech.rate, 1.5);
  m.doc.settings['speech:rate'] = null;
  assert.strictEqual(scr.audioProps(scr.props, scr.state).cfg.speech.rate, 1);
});

test('speech i18n keys exist in en and ru', () => {
  ['en', 'ru'].forEach((l) => {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', l + '.json'), 'utf8'));
    ['settings.speech', 'settings.speech.novoices', 'settings.speech.auto', 'settings.speech.rate', 'settings.speech.pitch', 'settings.speech.test', 'settings.speech.missing'].forEach((k) => assert.ok(d[k], l + ' ' + k));
  });
});

// Tests for generic "no voice" string with {lang} placeholder
async function withNoVoice(course, lang) {
  const win = H.fakeWin([]);
  const m = await H.mount({ items: [gap('a')], course, win, lang });
  m.app.go('session');
  m.app.startMode('daily', {});
  // Speech.status reports 'ok' until voiceschanged has fired once after the first render; fire it, then restart the session.
  m.screen(m.sb.DojoApp._SessionScreen).view();
  win.listeners.voiceschanged.forEach((f) => f());
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  return { m, scr, win };
}

test('Rendered notice contains Spanish for contentLanguage es with en UI', async () => {
  const { scr } = await withNoVoice({ contentLanguage: 'es', speech: {} }, 'en');
  const tree = scr.view();
  const notice = H.find(tree, 'play-item-notice');
  assert.ok(notice, 'should have notice');
  const noticeText = H.text(notice);
  assert.ok(noticeText.includes('Spanish'), 'should contain "Spanish"');
  assert.ok(!noticeText.includes('{lang}'), 'should not contain raw {lang}');
});

test('Rendered notice contains French word for Spanish with fr UI', async () => {
  const { scr } = await withNoVoice({ contentLanguage: 'es', speech: {} }, 'fr');
  const tree = scr.view();
  const notice = H.find(tree, 'play-item-notice');
  assert.ok(notice, 'should have notice');
  const noticeText = H.text(notice);
  assert.ok(noticeText.includes('espagnol'), 'should contain French word for Spanish');
  assert.ok(!noticeText.includes('{lang}'), 'should not contain raw {lang}');
});

test('Unknown language tag falls back to the tag text', async () => {
  const { scr } = await withNoVoice({ contentLanguage: 'xyz-qwe', speech: {} }, 'en');
  const tree = scr.view();
  const notice = H.find(tree, 'play-item-notice');
  assert.ok(notice, 'should have notice');
  const noticeText = H.text(notice);
  assert.ok(noticeText.includes('xyz-qwe'), 'should contain the raw language tag as fallback');
  assert.ok(!noticeText.includes('{lang}'), 'should not contain raw {lang}');
});

test('Notice names course.speech.lang (the spoken language), not contentLanguage', async () => {
  const { scr } = await withNoVoice({ contentLanguage: 'ru', speech: { lang: 'es' } }, 'en');
  const notice = H.find(scr.view(), 'play-item-notice');
  assert.ok(notice, 'should have notice');
  const noticeText = H.text(notice);
  assert.ok(noticeText.includes('Spanish'), noticeText);
  assert.ok(!noticeText.includes('Russian'), noticeText);
});
