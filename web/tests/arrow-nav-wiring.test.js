'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('arrow-nav registers a keydown listener on root.document and delegates to onKey', () => {
  const path = require.resolve('../ui/arrow-nav.js');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const listeners = {};
  const fakeRoot = { document: { addEventListener(type, fn) { listeners[type] = fn; } } };
  globalThis.self = fakeRoot;
  delete require.cache[path];
  try {
    const nav = require(path);
    assert.strictEqual(typeof listeners.keydown, 'function');
    assert.strictEqual(fakeRoot.DojoArrowNav, nav);
    // non-button target: handler runs onKey and ignores it without throwing
    listeners.keydown({ key: 'ArrowRight', target: { tagName: 'DIV' } });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'self', saved); else delete globalThis.self;
    delete require.cache[path];
  }
});
