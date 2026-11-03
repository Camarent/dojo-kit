'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.template.html'), 'utf8');

test('index template starts with <!doctype html> (no quirks mode)', () => {
  assert.ok(/^<!doctype html>/i.test(tpl));
});

test('index template declares the mobile viewport meta', () => {
  assert.ok(tpl.includes('<meta name="viewport" content="width=device-width,initial-scale=1">'));
});

test('index template links the repo in a footer outside the Preact root', () => {
  assert.ok(tpl.includes('<footer class="dojo-credit"><a href="https://github.com/Camarent/dojo-kit" rel="noopener">Built with dojo-kit</a></footer>'));
  assert.ok(tpl.indexOf('dojo-credit') > tpl.indexOf('<div id="dojo-root"></div>'));
});
