(function (root) {
  'use strict';

  function install(win) {
    var delay = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 300); }); };
    var read = function (path) { try { return JSON.parse(win.localStorage.getItem('mockdb:' + path)); } catch { return null; } };
    var buildSnapshot = function (path, hasPendingWrites) {
      var d = read(path);
      return { id: path, exists: !!d, data: function () { return d; }, metadata: { fromCache: false, hasPendingWrites: hasPendingWrites } };
    };
    var ctx = { win: win, delay: delay, buildSnapshot: buildSnapshot, listeners: {}, listenerIds: 0 };

    win.__mockdbRemoteWrite = function (path, obj) {
      var value = JSON.stringify(obj);
      win.localStorage.setItem('mockdb:' + path, value);
      var event = new win.StorageEvent('storage', { key: 'mockdb:' + path, newValue: value });
      win.dispatchEvent(event);
    };

    var db = { doc: function (path) {
      if (path.split('/').length % 2) throw new TypeError('odd segments: ' + path);
      return docRef(path, ctx);
    } };

    var user = { id: function () { return Promise.resolve('dev-user'); } };
    win.claude = { use: function (n) { return delay(n === 'db' ? db : n === 'user' ? user : null); } };
  }

  function docRef(path, ctx) {
    return {
      path: path,
      get: function () { return ctx.delay(ctx.buildSnapshot(path, false)); },
      set: function (body) { return setDoc(path, body, ctx); },
      onSnapshot: function (next) { return subscribe(path, next, ctx); }
    };
  }

  function setDoc(path, body, ctx) {
    var win = ctx.win;
    win.localStorage.setItem('mockdb:' + path, JSON.stringify(body));
    win.__mockWrites = (win.__mockWrites || 0) + 1;
    notifyListeners(path, ctx);
    return ctx.delay();
  }

  function notifyListeners(path, ctx) {
    var listenersForPath = ctx.listeners[path];
    if (!listenersForPath) return;
    Object.keys(listenersForPath).forEach(function (id) {
      var entry = listenersForPath[id];
      if (entry.active) {
        ctx.delay().then(function () {
          if (entry.active) {
            entry.next(ctx.buildSnapshot(path, true));
          }
        });
      }
    });
  }

  function subscribe(path, next, ctx) {
    var win = ctx.win;
    var id = 'id_' + (++ctx.listenerIds);
    var entry = { active: true, next: next };
    if (!ctx.listeners[path]) ctx.listeners[path] = {};
    ctx.listeners[path][id] = entry;

    var storageListener = function (evt) {
      if (evt.key === 'mockdb:' + path && entry.active) {
        ctx.delay().then(function () {
          if (entry.active) {
            entry.next(ctx.buildSnapshot(path, false));
          }
        });
      }
    };
    win.addEventListener('storage', storageListener);

    ctx.delay().then(function () {
      if (entry.active) {
        entry.next(ctx.buildSnapshot(path, false));
      }
    });

    return function () {
      entry.active = false;
      win.removeEventListener('storage', storageListener);
      delete ctx.listeners[path][id];
    };
  }

  if (typeof module !== 'undefined') module.exports = install;
  else install(root);
})(typeof self !== 'undefined' ? self : this);
