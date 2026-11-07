'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { fakeWin, J, V, load } = require('./speech.helpers.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('lines: stimulus speak lines, item speak string, none without speak, plain() applied', () => {
  const sb = load(true);
  const S = sb.DojoSpeech;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.lines({ text: 'x', speak: { lines: [{ voice: 'a', text: '{Ca|ca}t' }, { text: 'b' }] } }))),
    [{ text: 'Cat', voice: 'a' }, { text: 'b' }]);
  assert.strictEqual(S.lines({ speak: '{Ta|ta}ble' })[0].text, 'Table');
  assert.deepStrictEqual(J(S.lines({ text: 'visible text' })), []);
  assert.deepStrictEqual(J(S.lines({ prompt: 'p' })), []);
  assert.deepStrictEqual(J(S.lines(null)), []);
});

test('play: queue order, lang, rate/pitch, voice match, default voice of lang', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([V('Alpha', 'en-US'), V('Mira Premium', 'es-ES'), V('Oscar', 'es-ES')]);
  const cfg = { lang: 'en', speech: { lang: 'es-ES', rate: 0.8, voices: { f: { match: 'mira', pitch: 1.5 }, m: { match: 'nobody', rate: 1.2 } } } };
  const r = S.play([{ text: 'one', voice: 'f' }, { text: 'two', voice: 'm' }, { text: 'three' }], cfg, {}, win);
  assert.deepStrictEqual(J(r), { ok: true });
  assert.deepStrictEqual(win.spoken.map((u) => u.text), ['one', 'two', 'three']);
  assert.ok(win.spoken.every((u) => u.lang === 'es-ES'));
  assert.strictEqual(win.spoken[0].voice.name, 'Mira Premium');
  assert.strictEqual(win.spoken[0].pitch, 1.5);
  assert.strictEqual(win.spoken[0].rate, 0.8);
  assert.strictEqual(win.spoken[1].voice.name, 'Mira Premium');
  assert.strictEqual(win.spoken[1].rate, 1.2);
  assert.strictEqual(win.spoken[2].voice.lang, 'es-ES');
});

test('play: lang falls back to the course content language; onEnd fires after the last utterance only', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([V('A', 'de-DE')]);
  let ended = 0;
  S.play([{ text: 'a' }, { text: 'b' }], { lang: 'de' }, { onEnd: () => ended++ }, win);
  assert.strictEqual(win.spoken[0].lang, 'de');
  assert.strictEqual(win.spoken[0].onend, undefined);
  win.spoken[1].onend();
  assert.strictEqual(ended, 1);
});

test('stop cancels and silences callbacks; no API or no voice never throws', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([V('A', 'de-DE')]);
  let ended = 0;
  S.play([{ text: 'a' }], { lang: 'de' }, { onEnd: () => ended++ }, win);
  const u = win.spoken[0];
  S.stop(win);
  u.onend();
  assert.strictEqual(ended, 0);
  assert.ok(win.cancels >= 1);
  const none = fakeWin([], { noApi: true });
  assert.strictEqual(S.available(none), false);
  assert.strictEqual(S.status({}, none), 'unavailable');
  assert.deepStrictEqual(J(S.play([{ text: 'a' }], {}, {}, none)), { ok: false, reason: 'unavailable' });
  S.stop(none);
  const fr = fakeWin([V('A', 'fr-FR')]);
  assert.strictEqual(S.status({ lang: 'es' }, fr), 'no_voice');
  assert.deepStrictEqual(J(S.play([{ text: 'a' }], { lang: 'es' }, {}, fr)), { ok: false, reason: 'no_voice' });
});

test('speech.js is bundled after ext.js and before ui/app.js; i18n keys exist', () => {
  const b = JSON.parse(read('bundle.json')).scripts;
  assert.ok(b.indexOf('speech.js') > b.indexOf('ext.js') && b.indexOf('speech.js') < b.indexOf('ui/app.js'));
  for (const l of ['en', 'ru']) {
    const d = JSON.parse(read('i18n/' + l + '.json'));
    ['speech.play', 'speech.stop', 'speech.playing', 'speech.played', 'speech.novoice'].forEach((k) => assert.ok(d[k], k));
  }
});

test('pickVoice prefers voices with localService === true', () => {
  const sb = { DojoSpeech: require('../speech.js') };
  const S = sb.DojoSpeech;
  const voices = [
    { name: 'Remote US', lang: 'en-US', localService: false },
    { name: 'Local US', lang: 'en-US', localService: true },
    { name: 'Remote UK', lang: 'en-GB', localService: false },
    { name: 'Local UK', lang: 'en-GB', localService: true }
  ];
  const picked = S.pickVoice(voices, 'en-US', null);
  assert.strictEqual(picked.name, 'Local US', 'should pick local voice when exact lang match exists');
  const pickedGB = S.pickVoice(voices, 'en-GB', null);
  assert.strictEqual(pickedGB.name, 'Local UK', 'should pick local voice for en-GB');
  const pickedAny = S.pickVoice(voices, 'en', null);
  assert.strictEqual(pickedAny.name, 'Local US', 'should prefer local when lang matches prefix');
  const pickedMatch = S.pickVoice(voices, 'en', 'US');
  assert.strictEqual(pickedMatch.name, 'Local US', 'should prefer local when matching by name');
});

// ---- effective() and voice choice ----
const S2 = require('../speech.js');
const COURSE = { contentLanguage: 'es-ES', speech: { lang: 'es-ES', rate: 0.9, voices: { M: { pitch: 0.8, rate: 1, match: 'oscar' }, F: { pitch: 1.2 }, N: {} } } };

test('effective: no settings returns the course values and does not mutate the input', () => {
  const before = J(COURSE);
  const cfg = S2.effective(COURSE, {});
  assert.deepStrictEqual(cfg.speech, COURSE.speech);
  assert.strictEqual(cfg.lang, 'es-ES');
  assert.deepStrictEqual(J(COURSE), before);
  assert.deepStrictEqual(S2.effective(undefined, undefined), { speech: {}, lang: undefined });
});

test('effective: rate and pitch multiply per role so M and F stay distinct', () => {
  const cfg = S2.effective(COURSE, { 'speech:rate': 0.5, 'speech:pitch': 1.5 });
  assert.strictEqual(cfg.speech.rate, 0.45);
  assert.strictEqual(cfg.speech.voices.M.rate, 0.5);
  assert.strictEqual(cfg.speech.voices.M.pitch, 0.8 * 1.5);
  assert.strictEqual(cfg.speech.voices.F.pitch, 1.2 * 1.5);
  assert.strictEqual(cfg.speech.voices.F.rate, 0.45);
  assert.notStrictEqual(cfg.speech.voices.M.pitch, cfg.speech.voices.F.pitch);
  assert.strictEqual(cfg.speech.voices.M.match, 'oscar');
});

test('effective: learner rate and pitch are clamped, junk and null are ignored', () => {
  const hi = S2.effective({ speech: { voices: { M: {} } } }, { 'speech:rate': 9, 'speech:pitch': 9 });
  assert.strictEqual(hi.speech.rate, 1.5);
  assert.strictEqual(hi.speech.voices.M.rate, 1.5);
  assert.strictEqual(hi.speech.voices.M.pitch, 2);
  const lo = S2.effective({ speech: { voices: { M: {} } } }, { 'speech:rate': 0.01, 'speech:pitch': -4 });
  assert.strictEqual(lo.speech.voices.M.rate, 0.5);
  assert.strictEqual(lo.speech.voices.M.pitch, 0);
  const junk = S2.effective(COURSE, { 'speech:rate': 'fast', 'speech:pitch': null, 'speech:voice': 5, 'speech:voice:M': '' });
  assert.deepStrictEqual(junk.speech, COURSE.speech);
});

test('effective: voice names for default and per role', () => {
  const cfg = S2.effective(COURSE, { 'speech:voice': 'Mira', 'speech:voice:M': 'Ivan' });
  assert.strictEqual(cfg.speech.voiceName, 'Mira');
  assert.strictEqual(cfg.speech.voices.M.name, 'Ivan');
  assert.strictEqual(cfg.speech.voices.F.name, undefined);
});

test('pickVoice: exact chosen name beats match and language; unknown name falls back', () => {
  const voices = [
    { name: 'Oscar', lang: 'es-ES', localService: true },
    { name: 'Mira', lang: 'es-ES', localService: true },
    { name: 'Alex', lang: 'en-US', localService: true }
  ];
  assert.strictEqual(S2.pickVoice(voices, 'es-ES', 'oscar', { name: 'Mira' }).name, 'Mira');
  assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, { name: 'Alex' }).name, 'Alex');
  assert.strictEqual(S2.pickVoice(voices, 'es-ES', 'oscar', { name: 'Gone' }).name, 'Oscar');
  assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, { name: 'oscar' }).name, 'Oscar', 'name is exact, falls back to language pool');
});

test('pickVoice: DojoExt.voiceRank orders the language pool per role', () => {
  const Ext = require('../ext.js');
  const prev = global.DojoExt;
  global.DojoExt = Ext;
  try {
    const voices = [{ name: 'Mira', lang: 'es-ES' }, { name: 'Oscar', lang: 'es-ES' }, { name: 'Ivan', lang: 'es-ES', localService: true }];
    assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, { role: 'M' }).name, 'Ivan');
    Ext.registerVoiceRank((v, role) => ({ M: { Oscar: 2, Ivan: 1 }, F: { Mira: 2 } }[role] || {})[v.name] || 0);
    assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, { role: 'M' }).name, 'Oscar');
    assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, { role: 'F' }).name, 'Mira');
    assert.strictEqual(S2.pickVoice(voices, 'es-ES', null, {}).name, 'Ivan', 'no role: all ranks 0, local wins');
  } finally {
    Ext.reset();
    if (prev === undefined) delete global.DojoExt; else global.DojoExt = prev;
  }
});

test('play: uses effective() cfg, chosen voice name per role and the role-less default', () => {
  const voices = [{ name: 'Oscar', lang: 'es-ES' }, { name: 'Mira', lang: 'es-ES' }, { name: 'Ivan', lang: 'es-ES' }];
  const win = fakeWin(voices);
  const cfg = S2.effective(COURSE, { 'speech:rate': 1.5, 'speech:voice': 'Mira', 'speech:voice:F': 'Ivan' });
  const r = S2.play([{ text: 'a', voice: 'M' }, { text: 'b', voice: 'F' }, { text: 'c', voice: undefined }], cfg, {}, win);
  assert.ok(r.ok);
  const [m, f, n] = win.spoken;
  assert.deepStrictEqual([m.voice.name, f.voice.name, n.voice.name], ['Oscar', 'Ivan', 'Mira']);
  assert.strictEqual(m.rate, 1.5);
  assert.strictEqual(m.pitch, 0.8);
  assert.strictEqual(f.pitch, 1.2);
});
