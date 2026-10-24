/*
 * boot.js — loads wasm and content, then starts the app in #dojo-root. Any failure shows a read-only error screen.
 */
(function (root) {
  'use strict';

  function safeLocalStorage() {
    try {
      var ls = root.localStorage;
      var probe = 'dojo.probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  function boot() {
    var rootEl = root.document.getElementById('dojo-root');
    var content = null;
    return Promise.all([
      DojoWasm.load(root.__DOJO_WASM__),
      root.fetch('data/content.json').then(function (res) {
        if (!res.ok) throw new Error('data/content.json: HTTP ' + res.status);
        return res.json();
      })
    ]).then(function (parts) {
      content = parts[1];
      var ac = content.course && content.course.audio;
      if (ac && root.DojoAudio) root.DojoAudio.configure({ override: root.DOJO_AUDIO_BASE, base: ac.base, win: root });
      return DojoApp.start({
        root: rootEl,
        dojo: parts[0],
        content: content,
        i18n: root.__DOJO_I18N__,
        lang: content.course.uiLanguage,
        claude: root.claude || null,
        localStorage: safeLocalStorage(),
        win: root
      });
    }).catch(function (err) {
      if (typeof DojoApp !== 'undefined') DojoApp.fail(rootEl, err);
    });
  }

  boot();
})(typeof self !== 'undefined' ? self : this);
