'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);

const course = {
  units: [{ id: 'u2', title: 'Second' }, { id: 'u1', title: 'First' }],
  tagLabels: { zeta: 'Zeta', mid: 'Mid', hidden: { kind: 'internal' } }
};
const items = [
  gap('g1', 'u1', { tags: ['zeta', 'hidden'] }),
  gap('g2', 'u1', { tags: ['mid'] }),
  gap('g3', 'u2', { tags: ['zeta', 'alpha'] }),
  gap('g4', 'u2', { tags: ['beta'], status: 'retired' }),
  { id: 'g5', unit: 'u2', type: 'mcq', prompt: 'P', answers: ['x'], tags: ['mid'] }
];

// Returns the PracticeSetup instance with a synchronous setState, like practice-tags.test.js.
async function instance() {
  const m = await H.mount({ items, course });
  m.app.go('practice');
  const ps = m.screen(m.sb.DojoApp._PracticeSetup);
  const Cls = m.sb.DojoApp._PracticeSetup;
  const inst = new Cls(Object.assign({}, ps.props));
  inst.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  return inst;
}

const view = (inst) => H.expand(inst.render(inst.props, inst.state));
const chipIds = (v) => H.findAll(v, /^chip-/).map((n) => n.props['data-testid']);

test('PracticeSetup chip ids and order are the same before and after a chip toggle', async () => {
  const inst = await instance();
  const before = chipIds(view(inst));
  assert.deepStrictEqual(before, [
    'chip-units-u2', 'chip-units-u1',
    'chip-tags-alpha', 'chip-tags-mid', 'chip-tags-zeta',
    'chip-types-gap', 'chip-types-mcq'
  ]);
  H.find(view(inst), 'chip-tags-mid').props.onClick();
  assert.deepStrictEqual(chipIds(view(inst)), before);
});

test('PracticeSetup unit chip labels come from the course units, every render', async () => {
  const inst = await instance();
  const first = H.text(H.find(view(inst), 'chip-units-u2'));
  H.find(view(inst), 'chip-units-u2').props.onClick();
  const second = H.text(H.find(view(inst), 'chip-units-u2'));
  assert.strictEqual(first, 'Second');
  assert.strictEqual(second, 'Second');
});

test('PracticeSetup hides internal tags and retired-only tags', async () => {
  const inst = await instance();
  const v = view(inst);
  assert.strictEqual(H.find(v, 'chip-tags-hidden'), null);
  assert.strictEqual(H.find(v, 'chip-tags-beta'), null, 'tag only on a retired item has no chip');
});
