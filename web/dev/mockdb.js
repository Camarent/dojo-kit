(function (root) {
  'use strict';

  function install(win) {
    var delay = function (v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 300); }); };
    var read = function (path) { try { return JSON.parse(win.localStorage.getItem('mockdb:' + path)); } catch (e) { return null; } };
    var buildSnapshot = function (path, hasPendingWrites) {
      var d = read(path);
      return { id: path, exists: !!d, data: function () { return d; }, metadata: { fromCache: false, hasPendingWrites: hasPendingWrites } };
    };

    var listeners = {};
    var listenerIds = 0;

    win.__mockdbRemoteWrite = function (path, obj) {
      var value = JSON.stringify(obj);
      win.localStorage.setItem('mockdb:' + path, value);
      var event = new win.StorageEvent('storage', { key: 'mockdb:' + path, newValue: value });
      win.dispatchEvent(event);
    };

    var db = { doc: function (path) {
      if (path.split('/').length % 2) throw new TypeError('odd segments: ' + path);
      return {
        path: path,
        get: function () { return delay(buildSnapshot(path, false)); },
        set: function (body) {
          win.localStorage.setItem('mockdb:' + path, JSON.stringify(body));
          win.__mockWrites = (win.__mockWrites || 0) + 1;
          var listenersForPath = listeners[path];
          if (listenersForPath) {
            Object.keys(listenersForPath).forEach(function (id) {
              var entry = listenersForPath[id];
              if (entry.active) {
                delay().then(function () {
                  if (entry.active) {
                    entry.next(buildSnapshot(path, true));
                  }
                });
              }
            });
          }
          return delay();
        },
        onSnapshot: function (next) {
          var id = 'id_' + (++listenerIds);
          var entry = { active: true, next: next };
          if (!listeners[path]) listeners[path] = {};
          listeners[path][id] = entry;

          var storageListener = function (evt) {
            if (evt.key === 'mockdb:' + path && entry.active) {
              delay().then(function () {
                if (entry.active) {
                  entry.next(buildSnapshot(path, false));
                }
              });
            }
          };
          win.addEventListener('storage', storageListener);

          delay().then(function () {
            if (entry.active) {
              entry.next(buildSnapshot(path, false));
            }
          });

          return function () {
            entry.active = false;
            win.removeEventListener('storage', storageListener);
            delete listeners[path][id];
          };
        }
      };
    } };

    var user = { id: function () { return Promise.resolve('dev-user'); } };
    win.claude = { use: function (n) { return delay(n === 'db' ? db : n === 'user' ? user : null); } };
  }

  if (typeof module !== 'undefined') module.exports = install;
  else install(root);
})(typeof self !== 'undefined' ? self : this);
