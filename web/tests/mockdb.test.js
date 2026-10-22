'use strict';
const assert = require('node:assert');
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

test('own set produces hasPendingWrites true', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var callCount = 0;
      var firstSnapshot = null;
      var unsub = doc.onSnapshot(function (snapshot) {
        callCount++;
        if (callCount === 1) {
          firstSnapshot = snapshot;
          t.assert.strictEqual(snapshot.exists, false);
          doc.set({ test: 'data' });
        } else if (callCount === 2) {
          t.assert.strictEqual(snapshot.metadata.hasPendingWrites, true);
          t.assert.deepStrictEqual(snapshot.data(), { test: 'data' });
          unsub();
          setTimeout(resolve, 400);
        }
      });
    }).catch(reject);
  });
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

test('unsubscribe stops calls', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var callCount = 0;
      var unsub = doc.onSnapshot(function (snapshot) {
        callCount++;
        if (callCount === 1) {
          unsub();
          doc.set({ should: 'not trigger' });
          win.__mockdbRemoteWrite('data/test', { should: 'also not trigger' });
          setTimeout(function () {
            t.assert.strictEqual(callCount, 1);
            resolve();
          }, 400);
        }
      });
    }).catch(reject);
  });
});

test('two subscribers on same path both notified', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      var otherDoc = db.doc('data/other');
      var count1 = 0;
      var count2 = 0;
      var countOther = 0;
      var unsub1 = doc.onSnapshot(function (snapshot) { count1++; });
      var unsub2 = doc.onSnapshot(function (snapshot) { count2++; });
      var unsub3 = otherDoc.onSnapshot(function () { countOther++; });
      setTimeout(function () {
        win.__mockdbRemoteWrite('data/test', { multi: 'test' });
        setTimeout(function () {
          t.assert.strictEqual(count1, 2);
          t.assert.strictEqual(count2, 2);
          t.assert.strictEqual(countOther, 1);
          unsub1();
          unsub2();
          unsub3();
          resolve();
        }, 400);
      }, 350);
    }).catch(reject);
  });
});

test('get after remote write returns new data', function (t) {
  return new Promise(function (resolve, reject) {
    var win = createFakeWindow();
    require('../dev/mockdb.js')(win);
    win.claude.use('db').then(function (db) {
      var doc = db.doc('data/test');
      win.__mockdbRemoteWrite('data/test', { get: 'test' });
      setTimeout(function () {
        doc.get().then(function (snapshot) {
          t.assert.strictEqual(snapshot.exists, true);
          t.assert.deepStrictEqual(snapshot.data(), { get: 'test' });
          resolve();
        }).catch(reject);
      }, 350);
    }).catch(reject);
  });
});
