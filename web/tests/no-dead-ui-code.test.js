'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('placement.js keeps no Check-suffixed copies of the shared session methods', () => {
  const src = read('ui/placement.js');
  assert.ok(!/renderFeedbackCheck|renderDontKnowCheck|audioPropsCheck|answerCheck/.test(src));
});

test('DojoApp export has no _SessionBoundary', () => {
  assert.ok(!/_SessionBoundary\s*:/.test(read('ui/app.js')));
});

test('dead locals stay removed', () => {
  const src = read('ui/app.js');
  assert.ok(!/\bextraNewGroup\b/.test(src));
  assert.ok(!/\breadStr\b/.test(src));
});

test('dead CSS selectors stay removed', () => {
  assert.ok(!read('styles/app.css').includes('.choice-options'));
  assert.ok(!read('styles/types-cloze.css').includes('.cloze-expected'));
});
