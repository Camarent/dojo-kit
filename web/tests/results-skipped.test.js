'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['x'] };

async function render(review, courseExtra, lang) {
  const m = await H.mount({ items: [item], course: Object.assign({ id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U' }] }, courseExtra), lang });
  const summary = { mode: 'practice', raw: 0, total: 1, pct: 0, durationMs: 0, review, skipped: [], fraction: 0, correct: 0, answered: 1 };
  return m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary });
}

// Test a: skipped/dont-know answer shows session.dontKnow text
test('results skipped answer shows session.dontKnow instead of dash', async () => {
  for (const lang of ['en', 'ru']) {
    const v = await render([{ id: 'g1', correct: false, given: '-', expected: 'x' }], {}, lang);
    const li = H.find(v, 'missed-g1');
    assert.ok(li, 'missed-g1 not found');
    const txt = H.text(li);
    assert.ok(txt.includes(lang === 'en' ? "I don't know" : 'Не знаю'),
      `Expected ${lang === 'en' ? "I don't know" : 'Не знаю'} in: ${txt}`);
    assert.ok(!txt.includes(' - ') && !txt.includes('\u2013 '),
      `Should not contain bare dash in: ${txt}`);
  }
});

// Test b: 0/N result shows results-hint, N/N or partial does not
test('results zero score shows hint, non-zero does not', async () => {
  for (const lang of ['en', 'ru']) {
    // Zero score
    const v0 = await render([{ id: 'g1', correct: false, given: '-', expected: 'x' }], {}, lang);
    const hint0 = H.find(v0, 'results-hint');
    assert.ok(hint0, 'results-hint not found for 0 score');
    const hintText = H.text(hint0);
    assert.ok(hintText.includes(lang === 'en' ? 'Review weak spots from Home' : 'Повторите слабые места на главной'),
      `Unexpected hint text: ${hintText}`);

    // Non-zero score (partial)
    const summaryPartial = { mode: 'practice', raw: 1, total: 2, pct: 50, durationMs: 0, review: [], skipped: [], fraction: 0.5, correct: 1, answered: 2 };
    const vPartial = m => m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary: summaryPartial });
    const m = await H.mount({ items: [item] });
    const vP = vPartial(m);
    const hintP = H.find(vP, 'results-hint');
    assert.strictEqual(hintP, null, 'results-hint should not appear for partial score');

    // Full score
    const summaryFull = { mode: 'practice', raw: 1, total: 1, pct: 100, durationMs: 0, review: [], skipped: [], fraction: 1, correct: 1, answered: 1 };
    const vF = m2 => m2.sb.DojoApp._Results({ t: m2.t, byId: { g1: item }, go() {}, onAgain() {}, summary: summaryFull });
    const m2 = await H.mount({ items: [item] });
    const vFull = vF(m2);
    const hintFull = H.find(vFull, 'results-hint');
    assert.strictEqual(hintFull, null, 'results-hint should not appear for full score');
  }
});

// Test c: btn-again-session exists on results screen
test('results screen has btn-again-session button', async () => {
  const m = await H.mount({ items: [item] });
  const summary = { mode: 'practice', raw: 1, total: 2, pct: 50, durationMs: 0, review: [], skipped: [], fraction: 0.5, correct: 1, answered: 2 };
  const v = m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary });
  const btn = H.find(v, 'btn-again-session');
  assert.ok(btn, 'btn-again-session not found');
});

// CSS checks
test('app.css .stat span uses font-size token', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../styles/app.css'), 'utf8');
  const statSpanMatch = css.match(/\.stat span\s*\{[^}]*\}/);
  assert.ok(statSpanMatch, 'app.css should contain .stat span rule');
  const rule = statSpanMatch[0];
  assert.ok(rule.includes('font-size: var(--fs-sm)'),
    '.stat span should use font-size: var(--fs-sm)');
  assert.ok(rule.match(/color:\s*var\(--[\w-]+\)/),
    '.stat span should use color token');
});

test('app.css .notice uses font-size token and fg color', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../styles/app.css'), 'utf8');
  const noticeMatch = css.match(/\.notice\s*\{[^}]*\}/);
  assert.ok(noticeMatch, 'app.css should contain .notice rule');
  const rule = noticeMatch[0];
  assert.ok(rule.includes('font-size: var(--fs-sm)'),
    '.notice should use font-size: var(--fs-sm)');
  assert.ok(rule.match(/color:\s*var\(--fg\)/),
    '.notice should use color: var(--fg)');
});

test('app.css .muted uses font-size token and fg-muted color', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../styles/app.css'), 'utf8');
  const mutedMatch = css.match(/\.muted\s*\{[^}]*\}/);
  assert.ok(mutedMatch, 'app.css should contain .muted rule');
  const rule = mutedMatch[0];
  assert.ok(rule.includes('font-size: var(--fs-sm)'),
    '.muted should use font-size: var(--fs-sm)');
  assert.ok(rule.match(/color:\s*var\(--fg-muted\)/),
    '.muted should use color: var(--fg-muted)');
});

test('app.css has btn-again-session width:100% in max-width:600px media query', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../styles/app.css'), 'utf8');
  // Check that the media query exists
  const hasMediaQuery = css.includes('@media (max-width: 600px)');
  assert.ok(hasMediaQuery, 'app.css should have max-width:600px media query');
  
  // Extract the media query block by counting braces (handles nested braces in :has())
  const startIdx = css.indexOf('@media (max-width: 600px)');
  const braceOpenIdx = css.indexOf('{', startIdx);
  assert.ok(braceOpenIdx > startIdx, 'Media query should have opening brace');
  
  let depth = 1;
  let i = braceOpenIdx + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  
  const mediaBlock = css.substring(braceOpenIdx + 1, i - 1);
  
  assert.ok(mediaBlock.includes('.btn-again-session'),
    'Media query block should contain .btn-again-session');
  assert.ok(mediaBlock.includes('width: 100%'),
    'Media query block should contain width: 100%');
});

test('i18n en and ru have results.hint key', () => {
  for (const lang of ['en', 'ru']) {
    const j = JSON.parse(H.read('i18n/' + lang + '.json'));
    assert.ok(j['results.hint'] && j['results.hint'].length > 0,
      `i18n/${lang}.json should have results.hint key`);
  }
});
