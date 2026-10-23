'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function lum(hex) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
const ratio = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
const tok = (block, name) => new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(block)[1];

test('disabled buttons keep full opacity so muted text reaches 4.5:1 in light and dark', () => {
  const css = read('styles/app.css');
  const rule = /\.btn:disabled \{([^}]*)\}/.exec(css)[1];
  assert.ok(!/opacity/.test(rule));
  assert.ok(/color:\s*var\(--fg-muted\)/.test(rule));
  const tokens = read('styles/tokens.css');
  const light = tokens.slice(tokens.indexOf(':root[data-theme="light"]'));
  const dark = tokens.slice(tokens.indexOf('prefers-color-scheme: dark'));
  for (const block of [light, dark]) {
    for (const bg of ['bg', 'surface']) assert.ok(ratio(tok(block, 'fg-muted'), tok(block, bg)) >= 4.5);
  }
});

test('question timer progressbar gets a translated accessible name', () => {
  assert.match(read('ui/question-timer.js'), /aria-label=\$\{p\.t \? p\.t\('session\.timer'\)/);
  assert.match(read('ui/session-screen.js'), /stopped: !!s\.result, t: p\.t/);
  for (const lang of ['en', 'ru']) assert.ok(JSON.parse(read('i18n/' + lang + '.json'))['session.timer']);
});
