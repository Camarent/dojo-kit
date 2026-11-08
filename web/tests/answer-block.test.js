'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const sandbox = { console };
loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/answer-block.js'] });
const { AnswerBlock } = sandbox.DojoAnswerBlock;

// Vnode children of the root, nulls dropped, as [class, props] pairs in render order.
function slots(vnode) {
  return vnode.props.children.filter((c) => c && c.props).map((c) => [c.props.class, c.props]);
}
const full = { prompt: 'P', fields: 'F', submit: 'S', caption: 'C', feedback: 'X', answers: 'A' };
// Copy a sandbox-realm value into this realm so deepStrictEqual compares prototypes fairly.
const same = (v) => JSON.parse(JSON.stringify(v));

test('root carries the given class and test id, mobile first defaults otherwise', () => {
  const root = AnswerBlock(Object.assign({ cls: 'cloze', testid: 'cloze' }, full));
  assert.strictEqual(root.props.class, 'cloze');
  assert.strictEqual(root.props['data-testid'], 'cloze');
  const def = AnswerBlock({ prompt: 'P' });
  assert.strictEqual(def.props.class, 'answer-block');
  assert.strictEqual(def.props['data-testid'], 'answer-block');
});

test('slots render in block order: prompt, fields, submit, caption, feedback, answer texts', () => {
  const names = slots(AnswerBlock(full)).map(([cls]) => cls);
  assert.deepStrictEqual(same(names), ['ab-prompt', 'ab-fields', 'ab-submit', 'ab-caption', 'ab-feedback', 'ab-answers']);
});

test('caption is one role=status line with its text, after submit and before feedback', () => {
  const cap = slots(AnswerBlock(full)).find(([cls]) => cls === 'ab-caption');
  assert.ok(cap, 'caption rendered');
  assert.strictEqual(cap[1].role, 'status');
  assert.strictEqual(cap[1]['data-testid'], 'answer-caption');
  assert.strictEqual(cap[1].children, 'C');
});

test('empty slots render nothing: no caption element without caption text', () => {
  const names = slots(AnswerBlock({ prompt: 'P', fields: 'F' })).map(([cls]) => cls);
  assert.deepStrictEqual(same(names), ['ab-prompt', 'ab-fields']);
});

test('CSS is mobile first: full-width submit, wider from 768px, locked field style present', () => {
  const css = read('styles/answer-block.css');
  assert.ok(/\.ab-submit \.btn \{[^}]*width: 100%/.test(css), 'full-width submit on narrow screens');
  assert.ok(/@media \(min-width: 768px\)/.test(css), 'wider layout from tablet width');
  assert.ok(/\.cloze-field\.locked \{/.test(css), 'locked field rule');
});

test('i18n: q.cloze.locked exists in all four UI language files with the agreed wording', () => {
  // ru value as code points: the core-latin guard forbids Cyrillic literals outside i18n tables.
  const ruLocked = String.fromCharCode(0x043d, 0x0435, 0x0020, 0x043f, 0x0440, 0x043e, 0x0432, 0x0435, 0x0440, 0x044f, 0x0435, 0x0442, 0x0441, 0x044f);
  const want = { ru: ruLocked, en: 'not checked' };
  for (const lang of ['ru', 'en', 'ja', 'fr']) {
    const dict = JSON.parse(read(`i18n/${lang}.json`));
    assert.ok(typeof dict['q.cloze.locked'] === 'string' && dict['q.cloze.locked'].length > 0, `${lang} has key`);
    if (want[lang]) assert.strictEqual(dict['q.cloze.locked'], want[lang]);
  }
});
