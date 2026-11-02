'use strict';
const test = require('node:test');
const assert = require('node:assert');

const h = (tag, props, ...kids) => ({ tag, props, kids });
global.preact = { h };

const { create } = require('../ui/app-screens.js');

const stubDeps = {
  SessionBoundary: 'SessionBoundary',
  PlacementSession: 'PlacementSession',
  SessionScreen: 'SessionScreen',
  PracticeSetup: 'PracticeSetup',
  Results: 'Results',
  SettingsScreen: 'SettingsScreen',
  CatalogScreen: 'CatalogScreen',
  Home: 'Home',
  daysLeft: () => null,
};

test('create returns the six SCREENS keys in order', () => {
  const screens = create(stubDeps);
  assert.deepStrictEqual(Object.keys(screens), ['practice', 'session', 'results', 'settings', 'catalog', 'home']);
});

test('every SCREENS entry is a function', () => {
  const screens = create(stubDeps);
  for (const key of Object.keys(screens)) {
    assert.strictEqual(typeof screens[key], 'function', key);
  }
});
