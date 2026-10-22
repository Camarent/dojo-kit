/*
 * ui/i18n.js — i18n helper functions. Extracted from ui/app.js.
 */
(function (root) {
  'use strict';

  function primaryTag(lang) { return String(lang || 'en').split('-')[0]; }

  function pluralForm(lang, n) {
    if (primaryTag(lang) === 'ru') {
      var m10 = n % 10;
      var m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 'one';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
      return 'many';
    }
    return n === 1 ? 'one' : 'other';
  }

  function makeT(i18n, lang) {
    var langs = [lang];
    if (primaryTag(lang) !== lang) langs.push(primaryTag(lang));
    if (lang !== 'en' && primaryTag(lang) !== 'en') langs.push('en');
    function find(key, n) {
      for (var i = 0; i < langs.length; i++) {
        var dict = (i18n && i18n[langs[i]]) || {};
        if (typeof n === 'number') {
          var forms = [pluralForm(langs[i], n), 'other', 'many'];
          for (var j = 0; j < forms.length; j++) {
            if (dict[key + '.' + forms[j]] !== undefined) return dict[key + '.' + forms[j]];
          }
        }
        if (dict[key] !== undefined) return dict[key];
      }
      return key;
    }
    return function t(key, vars) {
      var text = find(key, vars && typeof vars.n === 'number' ? vars.n : undefined);
      return text.replace(/\{(\w+)\}/g, function (m, name) {
        return vars && vars[name] !== undefined ? String(vars[name]) : m;
      });
    };
  }

  function pickLang(i18n, lang) {
    if (i18n && i18n[lang]) return lang;
    if (i18n && i18n[primaryTag(lang)]) return primaryTag(lang);
    var keys = Object.keys(i18n || {}).filter(function (k) { return k !== 'en'; });
    return keys.length ? keys[0] : 'en';
  }

  var api = { primaryTag: primaryTag, makeT: makeT, pluralForm: pluralForm, pickLang: pickLang, _loaded: true };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoI18n = api;
})(typeof self !== 'undefined' ? self : this);
