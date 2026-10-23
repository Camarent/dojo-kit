/*
 * ui/stimulus.js — Stimulus, kanjiRows and small format helpers
 * Globals expected: preact, htm, DojoCommon, DojoExt, optional DojoSession.
 * create() returns { Stimulus, kanjiRows, tagInfo, captionFor, fmtClock, percent, uniqueSorted, toggle, localDay }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var renderText = DojoCommon.renderText;
  var speechLines = DojoCommon.speechLines;
  var Playback = DojoCommon.Playback;

  function create() {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function localDay(ms) {
      var d = new Date(ms);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function fmtClock(ms) {
      var s = Math.max(0, Math.round(ms / 1000));
      return Math.floor(s / 60) + ':' + pad2(s % 60);
    }

    function percent(fraction) { return Math.round((fraction || 0) * 100); }

    function uniqueSorted(list) {
      var seen = {};
      list.forEach(function (x) { seen[x] = true; });
      return Object.keys(seen).sort();
    }

    function toggle(list, value) {
      return list.indexOf(value) >= 0 ? list.filter(function (x) { return x !== value; }) : list.concat([value]);
    }

    function tagInfo(course, tag) { return DojoSession.tagInfo(course, tag); }

    function captionFor(course, item, t) {
      var caps = course && course.captions && typeof course.captions === 'object' ? course.captions : null;
      var has = function (k) { return caps && Object.prototype.hasOwnProperty.call(caps, k) && typeof caps[k] === 'string' && caps[k]; };
      var tags = item.tags || [];
      for (var i = 0; i < tags.length; i++) if (has(tags[i])) return caps[tags[i]];
      if (has(item.type)) return caps[item.type];
      var key = 'session.caption.' + item.type;
      var out = t(key);
      return out === key ? '' : out;
    }

    function stimulusTextVisible(st, audio, hasClip, speakable) {
      if (!st.hideText) return true;
      if (!speakable) return false;
      return hasClip ? audio.status === 'unavailable' : audio.status !== 'ok';
    }

    function Stimulus(p) {
      var st = p.stimulus;
      if (!st) return null;
      var audio = p.audio;
      var lines = audio ? speechLines(st) : [];
      var clip = audio && Array.isArray(st.audio) && st.audio.length && root.DojoAudio && root.DojoAudio.ready() ? { sid: st.id, ids: st.audio } : null;
      var speakable = lines.length > 0 || !!clip;
      var showText = stimulusTextVisible(st, audio, !!clip, speakable);
      return html`<section class="stimulus" data-testid="stimulus">
        ${st.title ? html`<h2 class="stimulus-title" data-testid="stimulus-title">${renderText(st.title)}</h2>` : null}
        ${speakable && showText ? html`
          <div class="qline">
            <p class="qbody stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>
            <${Playback} audio=${audio} lines=${lines} clip=${clip} testid="play-stimulus" pid=${'s:' + st.id} dict=${p.dict} />
          </div>
        ` : null}
        ${showText && !speakable ? html`<p class="stimulus-text" data-testid="stimulus-text">${renderText(st.text)}</p>` : null}
        ${speakable && !showText ? html`<${Playback} audio=${audio} lines=${lines} clip=${clip} testid="play-stimulus" pid=${'s:' + st.id} dict=${p.dict} />` : null}
      </section>`;
    }

    function kanjiRows(p, s, examMode) {
      var item = s.cur && s.cur.item;
      if (!item || !s.result || examMode || !DojoExt.kanjiBreakdown || !p.content || !p.content.items) return null;
      var cfgOrLang = p.course.breakdown;
      if (cfgOrLang === undefined) return null;
      var breakdown = DojoExt.kanjiBreakdown(item, p.content.items, cfgOrLang);
      if (!breakdown || !breakdown.length) return null;
      var t = p.t;
      return html`<ul class="kanji-rows" data-testid="kanji-rows">
        <li class="muted" data-testid="kanji-label">${t('session.kanji')}</li>
        ${breakdown.map(function (k) {
          var onRead = (Array.isArray(k.on) && k.on.length > 0) ? k.on.join(' / ') : null;
          var kunRead = (Array.isArray(k.kun) && k.kun.length > 0) ? k.kun.join(' / ') : null;
          return html`<li class="kanji-row-grid" data-testid="kanji-row">
            <span class="kanji-ch" data-testid="kanji-ch">${k.kanji}</span>
            <span class="kanji-mean" data-testid="kanji-mean">${k.meaning}</span>
            ${onRead || kunRead ? html`<span class="kanji-read muted" data-testid="kanji-read">
              ${onRead ? html`<span data-testid="kanji-on">${onRead}</span>` : null}
              ${onRead && kunRead ? ' / ' : ''}
              ${kunRead ? html`<span data-testid="kanji-kun">${kunRead}</span>` : null}
            </span>` : null}
          </li>`;
        })}
      </ul>`;
    }

    return { Stimulus: Stimulus, kanjiRows: kanjiRows, tagInfo: tagInfo, captionFor: captionFor, fmtClock: fmtClock, percent: percent, uniqueSorted: uniqueSorted, toggle: toggle, localDay: localDay };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoStimulus = api;
})(typeof self !== 'undefined' ? self : this);
