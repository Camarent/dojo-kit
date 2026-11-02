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
