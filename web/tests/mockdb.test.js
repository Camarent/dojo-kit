'use strict';
require('node:assert');
const test = require('node:test');

function createFakeWindow() {
  var storage = {};
  var listeners = {};
  var fakeWin = {
    localStorage: {
      getItem: function (key) { return storage[key] !== undefined ? storage[key] : null; },
      setItem: function (key, value) { storage[key] = value; },
      removeItem: function (key) { delete storage[key]; }
    },
    addEventListener: function (type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    removeEventListener: function (type, listener) {
      if (!listeners[type]) return;
      var idx = listeners[type].indexOf(listener);
      if (idx >= 0) listeners[type].splice(idx, 1);
    },
    dispatchEvent: function (event) {
      var type = event.type;
      if (!listeners[type]) return;
      listeners[type].slice().forEach(function (l) { l(event); });
    },
    StorageEvent: function (type, init) {
      this.type = type;
      this.key = init.key;
      this.newValue = init.newValue;
    }
  };
  return fakeWin;
}

test('initial snapshot: no stored doc', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var called = false;
      var unsub = doc.onSnapshot(function (snapshot) {
        t.assert.strictEqual(called, false);
        called = true;
        t.assert.strictEqual(snapshot.exists, false);
        t.assert.strictEqual(snapshot.metadata.hasPendingWrites, false);
        unsub();
        resolve();
      });
    }).catch(reject);
  });
});

test('initial snapshot: with stored doc', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    win.localStorage.setItem('mockdb:data/test', JSON.stringify({ foo: 'bar' }));
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var called = false;
      var unsub = doc.onSnapshot(function (snapshot) {
        t.assert.strictEqual(called, false);
        called = true;
        t.assert.strictEqual(snapshot.exists, true);
        t.assert.deepStrictEqual(snapshot.data(), { foo: 'bar' });
        unsub();
        resolve();
      });
    }).catch(reject);
  });
});


// mockdb delays every call by a fixed 300 ms setTimeout. Tests run it on mock timers:
// each step flushes pending promise callbacks, then advances the clock one delay.
function settle() { return new Promise(function (r) { setImmediate(r); }); }
async function advance(t, steps) {
  for (var i = 0; i < steps; i++) {
    await settle();
    t.mock.timers.tick(300);
  }
  await settle();
}
async function openDb(t, win) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  require('../dev/mockdb.js')(win);
  var p = win.claude.use('db');
  await advance(t, 1);
  return p;
}

test('own set produces hasPendingWrites true', async function (t) {
  var win = createFakeWindow();
  var db = await openDb(t, win);
  var doc = db.doc('data/test');
  var callCount = 0;
  var unsub = doc.onSnapshot(function (snapshot) {
    callCount++;
    if (callCount === 1) {
      t.assert.strictEqual(snapshot.exists, false);
      doc.set({ test: 'data' });
    } else if (callCount === 2) {
      t.assert.strictEqual(snapshot.metadata.hasPendingWrites, true);
      t.assert.deepStrictEqual(snapshot.data(), { test: 'data' });
    }
  });
  await advance(t, 4);
  t.assert.strictEqual(callCount, 2);
  unsub();
  await advance(t, 2);
});

test('remote write via hook', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var called = false;
      var unsub = doc.onSnapshot(function (snapshot) {
        if (!called) {
          called = true;
          win.__mockdbRemoteWrite('data/test', { remote: 'data' });
        } else {
          t.assert.strictEqual(snapshot.metadata.hasPendingWrites, false);
          t.assert.deepStrictEqual(snapshot.data(), { remote: 'data' });
          unsub();
          resolve();
        }
      });
    }).catch(reject);
  });
});

test('unsubscribe stops calls', async function (t) {
  var win = createFakeWindow();
  var db = await openDb(t, win);
  var doc = db.doc('data/test');
  var callCount = 0;
  var unsub = doc.onSnapshot(function () {
    callCount++;
    if (callCount === 1) {
      unsub();
      doc.set({ should: 'not trigger' });
      win.__mockdbRemoteWrite('data/test', { should: 'also not trigger' });
    }
  });
  await advance(t, 6);
  t.assert.strictEqual(callCount, 1);
});

test('two subscribers on same path both notified', async function (t) {
  var win = createFakeWindow();
  var db = await openDb(t, win);
  var doc = db.doc('data/test');
  var otherDoc = db.doc('data/other');
  var count1 = 0;
  var count2 = 0;
  var countOther = 0;
  var unsub1 = doc.onSnapshot(function () { count1++; });
  var unsub2 = doc.onSnapshot(function () { count2++; });
  var unsub3 = otherDoc.onSnapshot(function () { countOther++; });
  await advance(t, 2);
  win.__mockdbRemoteWrite('data/test', { multi: 'test' });
  await advance(t, 4);
  t.assert.strictEqual(count1, 2);
  t.assert.strictEqual(count2, 2);
  t.assert.strictEqual(countOther, 1);
  unsub1();
  unsub2();
  unsub3();
});

test('get after remote write returns new data', async function (t) {
  var win = createFakeWindow();
  var db = await openDb(t, win);
  var doc = db.doc('data/test');
  win.__mockdbRemoteWrite('data/test', { get: 'test' });
  await advance(t, 2);
  var p = doc.get();
  await advance(t, 2);
  var snapshot = await p;
  t.assert.strictEqual(snapshot.exists, true);
  t.assert.deepStrictEqual(snapshot.data(), { get: 'test' });
});
