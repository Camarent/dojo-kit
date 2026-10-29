'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function fakeWin(voices, opts) {
  const spoken = [];
  const win = { spoken, cancels: 0 };
  win.SpeechSynthesisUtterance = function (text) { this.text = text; };
  win.setTimeout = function (fn, delay) { return setTimeout(fn, delay); };
  win.clearTimeout = function (id) { clearTimeout(id); };
  if (!(opts && opts.noApi)) {
    win.speechSynthesis = {
      getVoices: () => voices,
      speak: (u) => spoken.push(u),
      cancel() { win.cancels++; spoken.length = 0; }
    };
  }
  return win;
}
const J = (x) => JSON.parse(JSON.stringify(x));
const V = (name, lang) => ({ name, lang });

function load(markup) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  if (markup) {
    sb.DojoExt.registerMarkup('ruby', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('ruby');
  }
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/gap.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog-audio.js']).concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}

test('lines: stimulus speak lines, item speak string, none without speak, plain() applied', () => {
  const sb = load(true);
  const S = sb.DojoSpeech;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.lines({ text: 'x', speak: { lines: [{ voice: 'a', text: '{漢|かん}字' }, { text: 'b' }] } }))),
    [{ text: '漢字', voice: 'a' }, { text: 'b' }]);
  assert.strictEqual(S.lines({ speak: '{日|に}本' })[0].text, '日本');
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

// ---- UI driver: expands components without a DOM ----
function mount(sb, vnode) {
  const cache = {};
  const root = { vnode };
  function expand(v, p) {
    if (Array.isArray(v)) return v.map((c, i) => expand(c, p + '/' + i));
    if (!v || typeof v !== 'object' || !v.type) return v;
    const props = Object.assign({}, v.props);
    let out;
    if (typeof v.type === 'function') {
      const key = p + ':' + (v.key === undefined ? '' : v.key);
      if (v.type.prototype && v.type.prototype.render) {
        let inst = cache[key];
        if (!inst || inst.ctor !== v.type) {
          inst = new v.type(props);
          inst.ctor = v.type;
          inst.setState = function (patch) { inst.state = Object.assign({}, inst.state, patch); };
          cache[key] = inst;
        }
        inst.props = props;
        out = expand(inst.render(props, inst.state), key);
      } else out = expand(v.type(props), key);
      return out;
    }
    return { type: v.type, props: props, kids: expand(props.children, p + '/c') };
  }
  return {
    tree: () => expand(root.vnode, 'r'),
    find(id) {
      let hit = null;
      (function w(n) {
        if (Array.isArray(n)) return n.forEach(w);
        if (!n || typeof n !== 'object') return;
        if (n.props && n.props['data-testid'] === id && !hit) hit = n;
        w(n.kids);
      })(this.tree());
      return hit;
    },
    click(id) { this.find(id).props.onClick(); }
  };
}

function session(questions, mode) {
  let i = 0;
  const s = {
    mode: mode || 'daily', deadline: null, total: questions.length, done: false,
    current: () => (i < questions.length ? Object.assign({ position: i + 1, total: questions.length, view: {} }, questions[i]) : null),
    next() { i++; if (i >= questions.length) s.done = true; return s.current(); },
    initialTotal: questions.length, retryCount: () => 0, shouldShowIntro: () => false,
    finish: () => ({}), answer: () => ({}), reveal() {}
  };
  return s;
}

function ui(sb, win, questions, mode, course) {
  const SS = sb.DojoApp._SessionScreen;
  const t = (k) => k;
  const props = { t, session: session(questions, mode), now: () => 0, win, course: course || { contentLanguage: 'ja' }, onEnd() {}, onExit() {} };
  const inst = new SS(props);
  inst.setState = function (patch) { inst.state = Object.assign({}, inst.state, patch); };
  inst.props = props;
  win.addEventListener = win.removeEventListener = () => {};
  const m = mount(sb, sb.preact.h(function Root() { return inst.render(inst.props, inst.state); }, {}));
  m.inst = inst;
  return m;
}

const item = (id, extra) => Object.assign({ id, unit: 'u', type: 'gap', prompt: 'P' + id, answers: ['a'] }, extra);
const stim = (extra) => Object.assign({ id: 's', text: 'Hello text', speak: { lines: [{ voice: 'f', text: 'Hello' }] } }, extra);
const JA = () => fakeWin([V('Kyoko', 'ja-JP')]);

test('UI: no speak anywhere => no play button, no notice', () => {
  const sb = load();
  const m = ui(sb, JA(), [{ item: item('a'), stimulus: { id: 's', text: 'T' } }]);
  assert.strictEqual(m.find('play-stimulus'), null);
  assert.strictEqual(m.find('play-item'), null);
  assert.strictEqual(m.find('speech-notice'), null);
});

test('UI: practice replays any number of times and item button appears', () => {
  const sb = load();
  const win = JA();
  const m = ui(sb, win, [{ item: item('a', { speak: 'Say me' }), stimulus: stim() }]);
  m.click('play-stimulus');
  assert.deepStrictEqual(win.spoken.map((u) => u.text), ['Hello']);
  win.spoken[0].onend();
  assert.strictEqual(m.find('play-stimulus').props.disabled, false);
  m.click('play-stimulus');
  assert.strictEqual(win.spoken.length, 1);
  win.spoken[0].onend();
  m.click('play-item');
  assert.strictEqual(win.spoken[0].text, 'Say me');
  assert.ok(m.find('stimulus-text'));
});

test('UI: exam plays once, button disabled and labelled played afterwards', () => {
  const sb = load();
  const win = JA();
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim() }], 'exam');
  m.click('play-stimulus');
  assert.strictEqual(m.find('play-stimulus').props.disabled, true);
  win.spoken[0].onend();
  const b = m.find('play-stimulus');
  assert.strictEqual(b.props.disabled, true);
  assert.strictEqual(b.props['aria-label'], 'speech.played');
});

test('UI: exam shared stimulus cannot be replayed on the second question', () => {
  const sb = load();
  const win = JA();
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim() }, { item: item('b'), stimulus: stim() }], 'exam');
  m.click('play-stimulus');
  win.spoken[0].onend();
  m.inst.next();
  const b = m.find('play-stimulus');
  assert.strictEqual(b.props.disabled, true);
  assert.strictEqual(b.props['aria-label'], 'speech.played');
});

test('UI: moving to the next question stops playback; leaving the screen stops too', () => {
  const sb = load();
  const win = JA();
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim() }, { item: item('b') }]);
  m.click('play-stimulus');
  const before = win.cancels;
  m.inst.next();
  assert.ok(win.cancels > before);
  assert.strictEqual(m.find('play-stimulus'), null);
  const c2 = win.cancels;
  m.inst.componentWillUnmount();
  assert.ok(win.cancels > c2);
});

test('UI: hideText stimulus hides text when speech works', () => {
  const sb = load();
  const m = ui(sb, JA(), [{ item: item('a'), stimulus: stim({ hideText: true }) }]);
  assert.strictEqual(m.find('stimulus-text'), null);
  assert.ok(m.find('play-stimulus'));
});

test('UI: no API or no voice => notice and text stays hidden for hideText, no button', () => {
  const sb = load();
  for (const win of [fakeWin([], { noApi: true }), fakeWin([V('Fr', 'fr-FR')])]) {
    const m = ui(sb, win, [{ item: item('a'), stimulus: stim({ hideText: true }) }], 'exam');
    assert.strictEqual(m.find('stimulus-text'), null);
    assert.ok(m.find('play-stimulus-notice'));
    assert.strictEqual(m.find('play-stimulus'), null);
  }
});

test('UI: playback failure at click time shows notice, text stays hidden', () => {
  const sb = load();
  const win = JA();
  win.speechSynthesis.speak = () => { throw new Error('boom'); };
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim({ hideText: true }) }]);
  m.click('play-stimulus');
  assert.strictEqual(m.find('stimulus-text'), null);
  assert.ok(m.find('play-stimulus-notice'));
});

test('courses without speech render identically to before (Stimulus without audio)', () => {
  const sb = load();
  const st = { id: 's', title: 'T', text: 'x', speak: { lines: [{ text: 'x' }] } };
  const dom = (v) => JSON.stringify(v, (k, x) => (k.startsWith('__') ? undefined : Array.isArray(x) ? x.filter((c) => c !== null) : x));
  const expected = '{"type":"section","props":{"class":"stimulus","data-testid":"stimulus","children":[{"type":"h2","props":{"class":"stimulus-title","data-testid":"stimulus-title","children":"T"}},{"type":"p","props":{"class":"stimulus-text","data-testid":"stimulus-text","children":"x"}}]}}';
  assert.strictEqual(dom(sb.DojoApp._Stimulus({ stimulus: { id: 's', title: 'T', text: 'x' } })), expected);
  assert.strictEqual(dom(sb.DojoApp._Stimulus({ stimulus: st })), expected);
  const m = ui(sb, JA(), [{ item: item('a'), stimulus: { id: 's', title: 'T', text: 'x' } }]);
  const html = JSON.stringify(m.tree());
  assert.ok(!/"data-testid":"play-/.test(html));
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
