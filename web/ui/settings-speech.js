/*
 * ui/settings-speech.js — renderSpeechSettings
 * Globals expected: preact, htm, DojoSpeech (optional).
 * create() returns { renderSpeechSettings }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var Speech = root.DojoSpeech || null;

  function create() {
  function speechVoices(win) {
    var ss = win && win.speechSynthesis;
    var list = ss && typeof ss.getVoices === 'function' ? ss.getVoices() : [];
    return Array.prototype.slice.call(list || []);
  }

  function diagLine(p, course) {
    var t = p.t;
    var d = Speech.diag({ speech: course.speech, lang: course.contentLanguage }, p.win);
    return html`<p class="muted" data-testid="speech-diag">${t('speech.diag', { api: t(d.api ? 'speech.diag.yes' : 'speech.diag.no'), n: d.voices, lang: d.lang, m: d.matching })}</p>`;
  }

  function noVoices(p, course) {
    var t = p.t;
    return html`<section class="group" data-testid="speech-settings">
      <h2>${t('settings.speech')}</h2>
      <p class="notice" role="status" data-testid="speech-novoices">${t('settings.speech.novoices')}</p>
      ${diagLine(p, course)}
    </section>`;
  }

  function renderSpeechSettings(p, self) {
    var course = p.course || {};
    if (!Speech || !(course.speech || course.contentLanguage)) return null;
    var t = p.t;
    var settings = (p.store.doc && p.store.doc.settings) || {};
    var voices = speechVoices(p.win);
    if (voices.length === 0) return noVoices(p, course);
    var lang = String(Speech.langOf({ speech: course.speech, lang: course.contentLanguage }) || '').toLowerCase().split(/[-_]/)[0];
    var pool = lang ? voices.filter(function (v) { return String(v.lang || '').toLowerCase().split(/[-_]/)[0] === lang; }) : voices;
    if (pool.length === 0) pool = voices;
    var roles = Object.keys((course.speech && course.speech.voices) || {});
    function voiceRow(key, label, role) {
      var cur = typeof settings[key] === 'string' && settings[key] !== '' ? settings[key] : '';
      var known = !cur || pool.some(function (v) { return v.name === cur; });
      var id = 'speech-' + key.replace(/[^a-z0-9]+/gi, '-');
      return html`<div class="setting-row" key=${key}>
        <label for=${id}>${label}</label>
        <div class="row">
          <select class="field" id=${id} data-testid=${'speech-voice-' + (role || 'default')} value=${cur}
            onChange=${function (e) { self.setSetting(key, e.target.value === '' ? null : e.target.value); }}>
            <option key="auto" value="">${t('settings.speech.auto')}</option>
            ${known ? null : html`<option key="missing" value=${cur}>${t('settings.speech.missing', { name: cur })}</option>`}
            ${pool.map(function (v) { return html`<option key=${'v:' + v.name} value=${v.name}>${v.name + (v.lang ? ' (' + v.lang + ')' : '')}</option>`; })}
          </select>
          <button type="button" class="btn" data-testid=${'speech-test-' + (role || 'default')}
            onClick=${function () { self.testSpeech(role); }}>${t('settings.speech.test')}</button>
        </div>
      </div>`;
    }
    function rangeRow(key, label, min, max) {
      var v = typeof settings[key] === 'number' ? settings[key] : 1;
      var id = 'speech-' + key.replace(/[^a-z0-9]+/gi, '-');
      return html`<div class="setting-row" key=${key}>
        <label for=${id}>${label}: <output data-testid=${'speech-' + key.split(':')[1] + '-value'}>${v}</output></label>
        <input type="range" class="field" id=${id} data-testid=${'speech-' + key.split(':')[1]} min=${min} max=${max} step="0.1" value=${v}
          onChange=${function (e) { var n = parseFloat(e.target.value); if (isFinite(n)) self.setSetting(key, Math.min(max, Math.max(min, n))); }} />
      </div>`;
    }
    return html`<section class="group speech-settings" data-testid="speech-settings">
      <h2>${t('settings.speech')}</h2>
      <p class="muted">${t('settings.speech.hint')}</p>
      ${diagLine(p, course)}
      ${voiceRow('speech:voice', t('settings.speech.voice.default'), null)}
      ${roles.map(function (role) { return voiceRow('speech:voice:' + role, t('settings.speech.voice.role', { role: role }), role); })}
      ${rangeRow('speech:rate', t('settings.speech.rate'), 0.5, 1.5)}
      ${rangeRow('speech:pitch', t('settings.speech.pitch'), 0, 2)}
    </section>`;
  }

    return { renderSpeechSettings: renderSpeechSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsSpeech = api;
})(typeof self !== 'undefined' ? self : this);
