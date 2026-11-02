#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');

const UI = path.join(__dirname, '..', 'web', 'ui');
const SRC = fs.readFileSync(path.join(UI, 'app-screens.js'), 'utf8');

// Evaluate app-screens.js as a CommonJS module with a stub preact global.
function loadScreens(src) {
  const sandbox = { preact: { h: (type, props, ...kids) => ({ type, props, kids }) }, module: { exports: {} } };
  sandbox.self = undefined;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'app-screens.js' });
  return sandbox.module.exports;
}

function stubDeps() {
  const comp = function Stub() {};
  return {
    SessionBoundary: comp, PlacementSession: comp, SessionScreen: comp, PracticeSetup: comp,
    Results: comp, SettingsScreen: comp, CatalogScreen: comp, Home: comp,
    daysLeft: () => 0,
  };
}

// The fallback contract: an unknown screen name resolves to SCREENS.home.
function assertFallbackToHome(SCREENS) {
  assert.strictEqual(typeof SCREENS.home, 'function', 'SCREENS.home must be a function');
  assert.strictEqual(SCREENS['nope'] || SCREENS.home, SCREENS.home);
}

test('create() returns a home screen function that the unknown-screen fallback resolves to', () => {
  const api = loadScreens(SRC);
  assert.strictEqual(typeof api.create, 'function');
  const SCREENS = api.create(stubDeps());
  assertFallbackToHome(SCREENS);
});

test('mutant without the home entry fails the fallback assertion', () => {
  const mutant = SRC.replace(/,\s*home:\s*homeScreen\b/, '');
  assert.notStrictEqual(mutant, SRC, 'mutation must change the source');
  const SCREENS = loadScreens(mutant).create(stubDeps());
  assert.throws(() => assertFallbackToHome(SCREENS), /SCREENS\.home must be a function|Expected values/);
});
