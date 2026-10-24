'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const h = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() });
const htmMod = (() => { const m = { exports: {} }; vm.runInNewContext(read('vendor/htm.umd.js'), { module: m, exports: m.exports, self: {} }); return m.exports.default || m.exports; })();
const sandbox = { preact: { h }, htm: htmMod, console };
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('ui/session-feedback.js'), sandbox);
vm.runInContext(read('ui/clip-flags-section.js'), sandbox);
const FLAG = sandbox.DojoSessionFeedback.flagButton;
const Section = sandbox.DojoClipFlagsSection;

const t = (k) => k;
const text = (n) => (n == null ? '' : typeof n === 'string' ? n : n.kids.map(text).join(''));
const find = (n, id) => { if (!n || typeof n !== 'object') return null; if (n.props['data-testid'] === id) return n; for (const k of n.kids) { const r = find(k, id); if (r) return r; } return null; };
const findAll = (n, id, out = []) => { if (!n || typeof n !== 'object') return out; if (n.props['data-testid'] === id) out.push(n); for (const k of n.kids) findAll(k, id, out); return out; };
const S = { cur: { stimulus: { id: 'st' } }, result: { correct: false }, audioMark: 0 };

function host(exam) {
  const hst = { state: {}, isExam: () => exam, setState(patch) { this.state = { ...this.state, ...patch }; } };
  return hst;
}
function setHeard(id) { sandbox.DojoAudio = { heardClip: () => id, clipMeta: (c) => (c === 'a1' ? { text: 'Trois' } : null) }; }
function engine(flagged = [], log = []) {
  const set = new Set(flagged);
  return {
    flagClip: (id, on) => { log.push([id, on]); if (on) set.add(id); else set.delete(id); },
    isClipFlagged: (id) => set.has(id),
    flaggedClips: () => [...set].sort(),
  };
}

test('button absent in exam', () => {
  setHeard('c1');
  assert.strictEqual(FLAG(host(true), { t, session: engine() }, S), null);
});

test('button absent without a heard clip', () => {
  setHeard(null);
  assert.strictEqual(FLAG(host(false), { t, session: engine() }, S), null);
});

test('button present in non-exam and toggles the flag with its label', () => {
  setHeard('c1');
  const log = [];
  const hst = host(false);
  const p = { t, session: engine([], log) };
  let btn = find(FLAG(hst, p, S), 'btn-flag-clip');
  assert.strictEqual(text(btn), 'session.flagClip');
  btn.props.onClick();
  assert.deepStrictEqual(log, [['c1', true]]);
  btn = find(FLAG(hst, p, S), 'btn-flag-clip');
  assert.strictEqual(text(btn), 'session.flagClipDone');
  btn.props.onClick();
  assert.deepStrictEqual(log, [['c1', true], ['c1', false]]);
});

test('section lists flagged clips in content and un-flags a row', () => {
  const log = [];
  const hst = host(false);
  const p = { t, engine: engine(['a1', 'zz'], log), content: { stimuli: [{ id: 's', audio: ['a1'] }] } };
  setHeard(null);
  const n = Section.render(p, t, hst);
  const rows = findAll(n, 'btn-clip-unflag');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(text(find(n, 'clip-flags')).includes('Trois'), true);
  rows[0].props.onClick();
  assert.deepStrictEqual(log, [['a1', false]]);
});

test('Copy ids gives sorted exact JSON shape', () => {
  const hst = host(false);
  const p = { t, engine: engine(['b2', 'a1']), content: { stimuli: [{ id: 's', audio: ['b2', 'a1'] }] } };
  const n = Section.render(p, t, hst);
  find(n, 'btn-clip-copy').props.onClick();
  assert.strictEqual(hst.state.clipFlagsText, '{"v":1,"ids":["a1","b2"]}');
  const area = find(Section.render(p, t, hst), 'clip-flags-ids');
  assert.strictEqual(area.props.value, '{"v":1,"ids":["a1","b2"]}');
});

test('Copy ids with nothing listed gives empty text', () => {
  const hst = host(false);
  const p = { t, engine: engine(['zz']), content: { stimuli: [{ id: 's', audio: ['a1'] }] } };
  const n = Section.render(p, t, hst);
  assert.strictEqual(find(n, 'btn-clip-copy'), null);
  assert.ok(find(n, 'clip-flags-empty'));
});

test('section hidden with no audio and no flags, shown with audio', () => {
  setHeard(null);
  assert.strictEqual(Section.render({ t, engine: engine(), content: { stimuli: [{ id: 's' }] } }, t, host(false)), null);
  assert.ok(Section.render({ t, engine: engine(), content: { stimuli: [{ id: 's', audio: ['a1'] }] } }, t, host(false)));
  assert.ok(Section.render({ t, engine: engine(['zz']), content: { stimuli: [{ id: 's' }] } }, t, host(false)));
});
