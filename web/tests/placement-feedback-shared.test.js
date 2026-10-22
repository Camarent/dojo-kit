'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console: { warn() {}, log() {} } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext.js'] });
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/app.js']) });
  return sb;
}

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  return i;
}

const tr = (k) => k;
const ITEM = { id: 'i1', type: 'gap', unit: 'u', tags: [], prompt: 'q', answers: ['a'] };

function stubSession(calls, mode) {
  const cur = { item: ITEM, view: { prompt: 'q' }, position: 1, total: 2 };
  return {
    mode, calls,
    current: () => cur,
    answer: (input) => { calls.answer.push(input); return { correct: true, expected: 'a', given: 'a' }; },
    dontKnow: () => { calls.dontKnow++; return { correct: false, expected: 'a', given: '-', dontKnow: true }; },
    canDontKnow: () => true,
    shouldShowIntro: () => false,
    entityIntro: () => null,
    next: () => cur,
    finish: () => ({})
  };
}

function props(session) {
  return { t: tr, session, now: () => 0, win: {}, course: {}, content: { items: [ITEM] }, store: null, onEnd() {}, onExit() {} };
}

function placement(sb, calls) {
  const s = stubSession(calls, 'placement');
  s.placementMode = 'check';
  const p = props(s);
  const i = inst(sb.DojoApp._PlacementSession, p);
  i.state = i.freshCheck(s.current());
  return i;
}

test('placement check mode records a double-tapped answer once', () => {
  const calls = { answer: [], dontKnow: 0 };
  const ui = placement(load(), calls);
  ui.setState = function () {};
  ui.submit('a', 'a');
  ui.submit('a', 'a');
  assert.strictEqual(calls.answer.length, 1);
});

test('placement check mode records a double-tapped "I don\'t know" once', () => {
  const calls = { answer: [], dontKnow: 0 };
  const ui = placement(load(), calls);
  ui.setState = function () {};
  ui.dontKnowAnswer();
  ui.dontKnowAnswer();
  assert.strictEqual(calls.dontKnow, 1);
});

test('"I don\'t know" produces the same result in placement and in a normal session', () => {
  const sb = load();
  const c1 = { answer: [], dontKnow: 0 };
  const c2 = { answer: [], dontKnow: 0 };
  const pl = placement(sb, c1);
  const ss = inst(sb.DojoApp._SessionScreen, props(stubSession(c2, 'practice')));
  ss.state = { cur: ss.props.session.current(), result: null, answered: 0 };
  pl.dontKnowAnswer();
  ss.dontKnowAnswer();
  assert.deepStrictEqual(pl.state.result, ss.state.result);
  assert.strictEqual(pl.state.error, ss.state.error);
  assert.strictEqual(pl.state.guard, ss.state.guard);
  assert.strictEqual(c1.dontKnow, c2.dontKnow);
});

test('audio props are produced by one implementation for placement and session', () => {
  const sb = load();
  const pl = placement(sb, { answer: [], dontKnow: 0 });
  const ss = inst(sb.DojoApp._SessionScreen, props(stubSession({ answer: [], dontKnow: 0 }, 'practice')));
  const strip = (a) => a && JSON.parse(JSON.stringify(a, (k, v) => (typeof v === 'function' ? undefined : v)));
  const a = pl.audioProps(pl.props, pl.state);
  const b = ss.audioProps(ss.props, { cur: pl.state.cur, speechFail: false });
  assert.deepStrictEqual(strip(a), strip(b));
});
