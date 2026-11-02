/*
 * ext/ruby.js — DojoExt ruby markup support. Built-in ruby {base|reading}.
 * Global DojoExtRuby (UMD).
 */
(function (root, factory) {
  'use strict';
  var DojoExtRegistry = root.DojoExtRegistry || (typeof require !== 'undefined' ? require('./registry.js') : null);
  var api = factory(DojoExtRegistry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtRuby = api;
})(typeof self !== 'undefined' ? self : this, function (registry) {
  'use strict';

  var S = registry.state, builtinMarkups = registry.builtinMarkups, warn = registry.warn;
  function registerMarkup(name, def) { return registry.registerMarkup(name, def); }
  function keyed(out) {
    if (!Array.isArray(out) || typeof preact === 'undefined' || !preact.cloneElement) return out;
    return out.map(function (c, i) {
      return c && typeof c === 'object' && c.props && (c.key === undefined || c.key === null) ? preact.cloneElement(c, { key: 'm' + i }) : c;
    });
  }

  function useMarkup(state, builtins, warnFn, name) {
    state.active = null;
    if (name === undefined || name === null || name === '') return false;
    if (!Object.prototype.hasOwnProperty.call(state.markups, name) && Object.prototype.hasOwnProperty.call(builtins, name)) {
      state.active = builtins[name];
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(state.markups, name)) {
      warnFn('markup "' + name + '" is not registered; using plain text');
      return false;
    }
    state.active = state.markups[name];
    return true;
  }
  function renderMarkup(state, warnFn, str, opts) {
    if (!state.active || typeof str !== 'string') return str;
    try {
      return keyed(state.active.render(str, typeof preact !== 'undefined' ? preact.h : undefined, opts));
    } catch (e) {
      warnFn('markup render failed', e);
      return str;
    }
  }

  function plainMarkup(state, warnFn, str) {
    if (!state.active || typeof str !== 'string') return str;
    try {
      var out = state.active.plain(str);
      return typeof out === 'string' ? out : str;
    } catch (e) {
      warnFn('markup plain failed', e);
      return str;
    }
  }
  function use(name) { return useMarkup(S, builtinMarkups, warn, name); }
  function text(str, opts) { return renderMarkup(S, warn, str, opts); }
  function plain(str) { return plainMarkup(S, warn, str); }
  function textAll(str) { return text(str, { all: true }); }
  function useRuby(cfg, items) { return registry.useRuby(cfg, items); }

  return { registerMarkup: registerMarkup, use: use, useRuby: useRuby, text: text, textAll: textAll, plain: plain };
});
