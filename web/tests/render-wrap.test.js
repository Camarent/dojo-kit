'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// Body of the last rule whose selector text is exactly `selector` (e.g. '.qtext {'); the rules this suite checks sit at the end of app.css.
function ruleBody(css, selector) {
  const start = css.lastIndexOf(selector + ' {');
  assert.ok(start >= 0, 'rule missing: ' + selector);
  return css.slice(start, css.indexOf('}', start));
}

test('a: kana and kanji words never split inside the word (keep-all, no anywhere wrap) on question, option, feedback text', () => {
  const css = read('styles/app.css');
  const body = ruleBody(css, '.qtext, .opt-text, .stimulus-text, .back, .feedback');
  assert.match(body, /word-break:\s*keep-all/, 'question, option and feedback text need word-break: keep-all');
  assert.doesNotMatch(body, /overflow-wrap:\s*anywhere/, 'no anywhere wrap on word text');
  assert.match(body, /overflow-wrap:\s*break-word/, 'word text uses overflow-wrap: break-word (breaks only when a line has no other break)');
  const block = read('styles/answer-block.css');
  const abBody = ruleBody(block, '.ab-feedback, .ab-answers');
  assert.match(abBody, /word-break:\s*keep-all/, 'answer block text keeps words whole');
  assert.match(abBody, /overflow-wrap:\s*break-word/, 'answer block text uses overflow-wrap: break-word');
});

test('a: cloze, order and match text keep words whole too', () => {
  const rules = [
    ['styles/types-cloze.css', '.cloze-sentence'],
    ['styles/types-order.css', '.order-text'],
    ['styles/types-order.css', '.order-sentence'],
    ['styles/types-match.css', '.match-left'],
  ];
  for (const [file, sel] of rules) {
    const css = read(file);
    const start = css.indexOf(sel + ' {');
    assert.ok(start >= 0, 'rule missing: ' + sel);
    const body = css.slice(start, css.indexOf('}', start));
    assert.match(body, /word-break:\s*keep-all/, sel + ' needs word-break: keep-all');
    assert.doesNotMatch(body, /overflow-wrap:\s*anywhere/, sel + ' must not wrap anywhere');
  }
});

test('a: ruby units do not wrap (nowrap, display: ruby)', () => {
  const css = read('styles/app.css');
  assert.match(ruleBody(css, 'ruby, rt'), /white-space:\s*nowrap/, 'ruby and rt nowrap');
  assert.match(ruleBody(css, 'ruby'), /display:\s*ruby/, 'ruby uses display: ruby');
});

test('b: dontKnow and next button rows wrap and stack full width on phones, no overflow hidden', () => {
  const css = read('styles/app.css');
  assert.match(ruleBody(css, '.actions-row, .row.end'), /flex-wrap:\s*wrap/, 'button rows wrap');
  assert.match(ruleBody(css, '.actions-row .btn, .row.end .btn'), /min-width:\s*0/, 'buttons min-width 0');
  assert.match(ruleBody(css, '.actions-row .btn, .actions-row .btn:disabled'), /flex:\s*1 1 100%/, 'next button full width under 600px');
  const media = css.lastIndexOf('@media (max-width: 600px) {');
  assert.ok(media >= 0 && css.lastIndexOf('.actions-row .btn, .actions-row .btn:disabled {') > media, 'full-width rule sits in the 600px block');
  assert.doesNotMatch(ruleBody(css, '.actions-row .btn, .row.end .btn'), /overflow:\s*hidden/, 'no overflow hidden on buttons');
  assert.doesNotMatch(ruleBody(css, '.actions-row, .row.end'), /overflow:\s*hidden/, 'no overflow hidden on rows');
});

test('c: wide grammar table scrolls in its wrapper with edge cue and nowrap ruby cells', () => {
  const css = read('styles/app.css');
  assert.match(css, /\.detail-table-wrap\s*\{[^}]*overflow-x:\s*auto/, 'wrapper scrolls');
  const wrap = ruleBody(css, '.detail-table-wrap');
  assert.match(wrap, /linear-gradient\(to right/, 'left edge fade');
  assert.match(wrap, /linear-gradient\(to left/, 'right edge fade');
  assert.match(ruleBody(css, '.detail-table ruby, .detail-table rt'), /white-space:\s*nowrap/, 'ruby cells nowrap');
});
