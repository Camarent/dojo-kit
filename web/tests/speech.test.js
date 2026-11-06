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
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.lines({ text: 'x', speak: { lines: [{ voice: 'a', text: '{Kan|kan}ji' }, { text: 'b' }] } }))),
    [{ text: 'Kanji', voice: 'a' }, { text: 'b' }]);
  assert.strictEqual(S.lines({ speak: '{Ni|ni}hon' })[0].text, 'Nihon');
  assert.deepStrictEqual(J(S.lines({ text: 'visible text' })), []);
  assert.deepStrictEqual(J(S.lines({ prompt: 'p' })), []);
  assert.deepStrictEqual(J(S.lines(null)), []);
});

test('play: queue order, lang, rate/pitch, voice match, default voice of lang', () => {
  const S = load().DojoSpeech;
  const win = fakeWin([V('Alpha', 'en-US'), V('Kyoko Premium', 'ja-JP'), V('Otoya', 'ja-JP')]);
  const cfg = { lang: 'en', speech: { lang: 'ja-JP', rate: 0.8, voices: { f: { match: 'kyoko', pitch: 1.5 }, m: { match: 'nobody', rate: 1.2 } } } };
  const r = S.play([{ text: 'one', voice: 'f' }, { text: 'two', voice: 'm' }, { text: 'three' }], cfg, {}, win);
  assert.deepStrictEqual(J(r), { ok: true });
  assert.deepStrictEqual(win.spoken.map((u) => u.text), ['one', 'two', 'three']);
  assert.ok(win.spoken.every((u) => u.lang === 'ja-JP'));
  assert.strictEqual(win.spoken[0].voice.name, 'Kyoko Premium');
  assert.strictEqual(win.spoken[0].pitch, 1.5);
  assert.strictEqual(win.spoken[0].rate, 0.8);
  assert.strictEqual(win.spoken[1].voice.name, 'Kyoko Premium');
  assert.strictEqual(win.spoken[1].rate, 1.2);
  assert.strictEqual(win.spoken[2].voice.lang, 'ja-JP');
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
  assert.strictEqual(S.status({ lang: 'ja' }, fr), 'no_voice');
  assert.deepStrictEqual(J(S.play([{ text: 'a' }], { lang: 'ja' }, {}, fr)), { ok: false, reason: 'no_voice' });
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
const COURSE = { contentLanguage: 'ja-JP', speech: { lang: 'ja-JP', rate: 0.9, voices: { M: { pitch: 0.8, rate: 1, match: 'otoya' }, F: { pitch: 1.2 }, N: {} } } };

test('effective: no settings returns the course values and does not mutate the input', () => {
  const before = J(COURSE);
  const cfg = S2.effective(COURSE, {});
  assert.deepStrictEqual(cfg.speech, COURSE.speech);
  assert.strictEqual(cfg.lang, 'ja-JP');
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
  assert.strictEqual(cfg.speech.voices.M.match, 'otoya');
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
  const cfg = S2.effective(COURSE, { 'speech:voice': 'Kyoko', 'speech:voice:M': 'Ichiro' });
  assert.strictEqual(cfg.speech.voiceName, 'Kyoko');
  assert.strictEqual(cfg.speech.voices.M.name, 'Ichiro');
  assert.strictEqual(cfg.speech.voices.F.name, undefined);
});

test('pickVoice: exact chosen name beats match and language; unknown name falls back', () => {
  const voices = [
    { name: 'Otoya', lang: 'ja-JP', localService: true },
    { name: 'Kyoko', lang: 'ja-JP', localService: true },
    { name: 'Alex', lang: 'en-US', localService: true }
  ];
  assert.strictEqual(S2.pickVoice(voices, 'ja-JP', 'otoya', { name: 'Kyoko' }).name, 'Kyoko');
  assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, { name: 'Alex' }).name, 'Alex');
  assert.strictEqual(S2.pickVoice(voices, 'ja-JP', 'otoya', { name: 'Gone' }).name, 'Otoya');
  assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, { name: 'otoya' }).name, 'Otoya', 'name is exact, falls back to language pool');
});

test('pickVoice: DojoExt.voiceRank orders the language pool per role', () => {
  const Ext = require('../ext.js');
  const prev = global.DojoExt;
  global.DojoExt = Ext;
  try {
    const voices = [{ name: 'Kyoko', lang: 'ja-JP' }, { name: 'Otoya', lang: 'ja-JP' }, { name: 'Ichiro', lang: 'ja-JP', localService: true }];
    assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, { role: 'M' }).name, 'Ichiro');
    Ext.registerVoiceRank((v, role) => ({ M: { Otoya: 2, Ichiro: 1 }, F: { Kyoko: 2 } }[role] || {})[v.name] || 0);
    assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, { role: 'M' }).name, 'Otoya');
    assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, { role: 'F' }).name, 'Kyoko');
    assert.strictEqual(S2.pickVoice(voices, 'ja-JP', null, {}).name, 'Ichiro', 'no role: all ranks 0, local wins');
  } finally {
    Ext.reset();
    if (prev === undefined) delete global.DojoExt; else global.DojoExt = prev;
  }
});

test('play: uses effective() cfg, chosen voice name per role and the role-less default', () => {
  const voices = [{ name: 'Otoya', lang: 'ja-JP' }, { name: 'Kyoko', lang: 'ja-JP' }, { name: 'Ichiro', lang: 'ja-JP' }];
  const win = fakeWin(voices);
  const cfg = S2.effective(COURSE, { 'speech:rate': 1.5, 'speech:voice': 'Kyoko', 'speech:voice:F': 'Ichiro' });
  const r = S2.play([{ text: 'a', voice: 'M' }, { text: 'b', voice: 'F' }, { text: 'c', voice: undefined }], cfg, {}, win);
  assert.ok(r.ok);
  const [m, f, n] = win.spoken;
  assert.deepStrictEqual([m.voice.name, f.voice.name, n.voice.name], ['Otoya', 'Ichiro', 'Kyoko']);
  assert.strictEqual(m.rate, 1.5);
  assert.strictEqual(m.pitch, 0.8);
  assert.strictEqual(f.pitch, 1.2);
});
