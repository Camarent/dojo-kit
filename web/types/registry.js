/*
 * types/registry.js — question-type registry. Defines DojoTypes = { register(name, def), get(name), names() }.
 * def = { Question(props), canSubmit(state), initialState(view) } plus optional
 *   onKey(e, props) -> { input, picked } | null   keyboard shortcut while unanswered
 *   submitOf(state) -> { input, picked }          typed answer as submitted (used by Next when canSubmit(state))
 *   verdict(result, t) -> string                  feedback headline (default: correct/wrong)
 *   hideExpected: true                            do not show the "expected" line on a wrong result
 *   selfRated: true                               self-rated type (no typed answer); no "I don't know" button
 *   Extra(props)                                  extra feedback block, props = { result, t }
 *   ownsPrompt(item, view)                        returns true if the type handles the prompt itself
 * Question props: { item, view, result, picked, exam, t, state, setState(patch), onSubmit(input, picked), onReveal(), inputRef }.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoTypes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var defs = {};
  var order = [];

  function register(name, def) {
    if (typeof name !== 'string' || name === '') throw new Error('DojoTypes.register: name required');
    if (!def || typeof def.Question !== 'function' || typeof def.canSubmit !== 'function' || typeof def.initialState !== 'function') {
      throw new Error('DojoTypes.register: def needs Question, canSubmit, initialState');
    }
    if (!Object.prototype.hasOwnProperty.call(defs, name)) order.push(name);
    defs[name] = def;
    return def;
  }

  function get(name) {
    return Object.prototype.hasOwnProperty.call(defs, name) ? defs[name] : null;
  }

  function names() { return order.slice(); }

  function isImeOrModified(e) {
    if (e.isComposing === true || e.keyCode === 229) return true;
    return !!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
  }

  function isEditable(e, opts) {
    var t = e.target;
    var tag = t && t.tagName;
    if (t && t.isContentEditable) return true;
    return !opts.allowInput && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
  }

  function keyBlocked(e, opts) {
    opts = opts || {};
    return !!e.defaultPrevented || isImeOrModified(e) || isEditable(e, opts);
  }

  // Shared by the question UIs: class-name join, and course text through DojoExt.text when loaded.
  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function renderText(str) {
    var ext = typeof DojoExt !== 'undefined' ? DojoExt : null;
    return ext && ext.text ? ext.text(str) : str;
  }

  return { register: register, get: get, names: names, keyBlocked: keyBlocked, cls: cls, renderText: renderText };
});
