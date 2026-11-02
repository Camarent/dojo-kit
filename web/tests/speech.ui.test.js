'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fakeWin, V, load } = require('./speech.helpers.js');

// ---- UI driver: expands components without a DOM ----
function mount(sb, vnode) {
  const cache = {};
  const root = { vnode };
  return {
    tree: () => expandNode(root.vnode, 'r', cache),
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

function expandNode(v, p, cache) {
  if (Array.isArray(v)) return v.map((c, i) => expandNode(c, p + '/' + i, cache));
  if (!v || typeof v !== 'object' || !v.type) return v;
  const props = Object.assign({}, v.props);
  if (typeof v.type === 'function') return expandComponent(v, props, p, cache);
  return { type: v.type, props: props, kids: expandNode(props.children, p + '/c', cache) };
}

function expandComponent(v, props, p, cache) {
  const key = p + ':' + (v.key === undefined ? '' : v.key);
  if (!(v.type.prototype && v.type.prototype.render)) return expandNode(v.type(props), key, cache);
  let inst = cache[key];
  if (!inst || inst.ctor !== v.type) {
    inst = new v.type(props);
    inst.ctor = v.type;
    inst.setState = function (patch) { inst.state = Object.assign({}, inst.state, patch); };
    cache[key] = inst;
  }
  inst.props = props;
  return expandNode(inst.render(props, inst.state), key, cache);
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

function ui(sb, win, questions, opts = {}) {
  const SS = sb.DojoApp._SessionScreen;
  const t = (k) => k;
  const props = { t, session: session(questions, opts.mode), now: () => 0, win, course: opts.course || { contentLanguage: 'ja' }, onEnd() {}, onExit() {} };
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
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim() }], { mode: 'exam' });
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
  const m = ui(sb, win, [{ item: item('a'), stimulus: stim() }, { item: item('b'), stimulus: stim() }], { mode: 'exam' });
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
    const m = ui(sb, win, [{ item: item('a'), stimulus: stim({ hideText: true }) }], { mode: 'exam' });
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
