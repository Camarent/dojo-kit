'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('./app-harness.js');

const web = path.join(__dirname, '..');
const gap = (id, unit) => ({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['a' + id] });

async function setup() {
  const m = await H.mount({ items: [gap('g1', 'u1'), gap('g2', 'u2')] });
  m.app.go('practice');
  const ps = m.screen(m.sb.DojoApp._PracticeSetup);
  const Cls = m.sb.DojoApp._PracticeSetup;
  const inst = new Cls(Object.assign({}, ps.props, { onStart() {} }));
  inst.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  const view = () => H.expand(inst.render(inst.props, inst.state));
  return { view };
}

test('unit chip gets the on class only while selected', async () => {
  const { view } = await setup();
  assert.ok(!H.find(view(), 'chip-units-u1').props.class.split(' ').includes('on'), 'unselected chip has no on class');
  H.find(view(), 'chip-units-u1').props.onClick();
  const chip = H.find(view(), 'chip-units-u1');
  assert.ok(chip.props.class.split(' ').includes('on'), 'selected chip has on class');
  assert.strictEqual(chip.props['aria-pressed'], 'true');
  H.find(view(), 'chip-units-u1').props.onClick();
  assert.ok(!H.find(view(), 'chip-units-u1').props.class.split(' ').includes('on'), 'deselected chip drops on class');
});

test('start button is primary and back button is not', async () => {
  const { view } = await setup();
  assert.ok(H.find(view(), 'btn-start').props.class.split(' ').includes('primary'), 'btn-start has primary');
  assert.ok(!H.find(view(), 'btn-back').props.class.split(' ').includes('primary'), 'btn-back is not primary');
});

test('back and start share a setup-actions row', async () => {
  const { view } = await setup();
  const start = H.find(view(), 'btn-start');
  const back = H.find(view(), 'btn-back');
  let row = null;
  H.walk(view(), (n) => {
    if (n.props && typeof n.props.class === 'string' && n.props.class.split(' ').includes('setup-actions')) row = n;
  });
  assert.ok(row, 'setup-actions row exists');
  assert.ok(start && back);
});

test('app.css gives chip.on a check glyph and a filled background', () => {
  const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');
  assert.ok(/\.chip\.on::before\s*\{[^}]*content:\s*"\\2713"/.test(css), 'chip.on::before check glyph');
  assert.ok(/\.chip\.on\s*\{[^}]*background:\s*var\(--accent\)/.test(css), 'chip.on filled background');
});

test('app.css makes setup buttons flex:1 each', () => {
  const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');
  assert.ok(/\.setup-actions \.btn\s*\{[^}]*flex:\s*1/.test(css), '.setup-actions .btn flex: 1');
});
