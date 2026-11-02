#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');

const UI = path.join(__dirname, '..', 'web', 'ui');

test('app-screens exposes a home screen used as the unknown-screen fallback', () => {
  const src = fs.readFileSync(path.join(UI, 'app-screens.js'), 'utf8');
  assert.match(src, /return \{[^}]*\bhome:\s*homeScreen\b/, 'SCREENS must map home to homeScreen');
});

test('app.js reaches the home screen only through SCREENS', () => {
  const src = fs.readFileSync(path.join(UI, 'app.js'), 'utf8');
  assert.doesNotMatch(src, /\bhomeScreen\b/, 'homeScreen lives in app-screens.js, not app.js');
  assert.match(src, /SCREENS\[s\.screen\] \|\| SCREENS\.home/, 'unknown screens fall back to SCREENS.home');
});
