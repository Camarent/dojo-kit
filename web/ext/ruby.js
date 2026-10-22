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

  var S = registry.state;
  var builtinMarkups = registry.builtinMarkups;
  var warn = registry.warn;

  function registerMarkup(name, def) { return registry.registerMarkup(name, def); }

  function use(name) {
    S.active = null;
    if (name === undefined || name === null || name === '') return false;
    if (!Object.prototype.hasOwnProperty.call(S.markups, name) && Object.prototype.hasOwnProperty.call(builtinMarkups, name)) {
      S.active = builtinMarkups[name];
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(S.markups, name)) {
      warn('markup "' + name + '" is not registered; using plain text');
      return false;
    }
    S.active = S.markups[name];
    return true;
  }

  function keyed(out) {
    if (!Array.isArray(out) || typeof preact === 'undefined' || !preact.cloneElement) return out;
    return out.map(function (c, i) {
      return c && typeof c === 'object' && c.props && (c.key === undefined || c.key === null) ? preact.cloneElement(c, { key: 'm' + i }) : c;
    });
  }

  function text(str, opts) {
    if (!S.active || typeof str !== 'string') return str;
    try {
      return keyed(S.active.render(str, typeof preact !== 'undefined' ? preact.h : undefined, opts));
    } catch (e) {
      warn('markup render failed', e);
      return str;
    }
  }

  function plain(str) {
    if (!S.active || typeof str !== 'string') return str;
    try {
      var out = S.active.plain(str);
      return typeof out === 'string' ? out : str;
    } catch (e) {
      warn('markup plain failed', e);
      return str;
    }
  }

  function textAll(str) {
    return text(str, { all: true });
  }

  function useRuby(cfg, items) { return registry.useRuby(cfg, items); }

  return {
    registerMarkup: registerMarkup,
    use: use,
    useRuby: useRuby,
    text: text,
    textAll: textAll,
    plain: plain
  };
});
