'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseCSS, ruleFor } = require('./css-helpers.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const css = read('styles/answer-block.css');
const tokensCss = read('styles/tokens.css');

// Pixel value of a --space-N token declared in tokens.css.
function spaceTokenPx(name) {
  const m = tokensCss.match(new RegExp(`${name}:\\s*(\\d+)px`));
  assert.ok(m, `tokens.css should define ${name} in px`);
  return parseInt(m[1], 10);
}

// Margin or gap declaration on the submit wrapper, as { prop, token }; token is the var(--space-N) name.
function submitSpacing(declarations) {
  const m = declarations.match(/(?:^|;)\s*(margin-top|margin|gap|row-gap)\s*:\s*var\((--space-\d+)\)/);
  return m ? { prop: m[1], token: m[2] } : null;
}

test('.ab-submit declares a margin or gap using a var(--space-N) token of at least 8px', () => {
  const rule = ruleFor(css, '.ab-submit');
  assert.ok(rule, 'answer-block.css should contain a top-level .ab-submit rule');
  const sp = submitSpacing(rule.declarations);
  assert.ok(sp, '.ab-submit should declare margin-top / margin / gap as var(--space-N)');
  assert.ok(spaceTokenPx(sp.token) >= spaceTokenPx('--space-2'),
    `${sp.token} should be at least --space-2 (8px)`);
});

test('.ab-submit spacing is not removed by any @media block', () => {
  const inMedia = parseCSS(css, { media: true }).filter((r) => r.media !== null);
  for (const r of inMedia) {
    if (!/(^|,)\s*\.(ab-submit|answer-block)\b/.test(r.selector)) continue;
    assert.ok(!/(margin-top|margin|gap|row-gap)\s*:\s*(0|none|normal)\b/.test(r.declarations),
      `@media ${r.media} must not remove spacing on ${r.selector}`);
  }
});

test('phone-width @media block (max-width) keeps the submit margin', () => {
  const phone = parseCSS(css, { media: true }).filter((r) => r.media !== null && /max-width/.test(r.media));
  for (const r of phone) {
    assert.ok(!/margin-top\s*:\s*0\b/.test(r.declarations), `${r.selector} in ${r.media} must keep margin-top`);
  }
});
