/*
 * ui/stimulus.js — Stimulus, kanjiRows and small format helpers
 * Globals expected: preact, htm, DojoCommon, DojoExt, optional DojoSession.
 * create() returns { itemLabel(item, stimulus, dupes), dupeSet(prompts), Stimulus, kanjiRows, tagInfo, captionFor, fmtClock, percent, uniqueSorted, toggle, localDay }.
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

  function hasPlayableSource(st) {
    if (!st) return false;
    if (speechLines(st).length > 0) return true;
    return Array.isArray(st.audio) && st.audio.length > 0 && !!root.DojoAudio && root.DojoAudio.ready();
  }

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

  function stimulusTextVisible(st) {
    return !st.hideText;
  }

  function stimulusClip(st, audio) {
    return audio && Array.isArray(st.audio) && st.audio.length && root.DojoAudio && root.DojoAudio.ready() ? { sid: st.id, ids: st.audio } : null;
  }

  function stimulusPlayback(c) {
    return html`<${Playback} audio=${c.audio} lines=${c.lines} clip=${c.clip} testid="play-stimulus" pid=${'s:' + c.st.id} dict=${c.p.dict} />`;
  }

  function stimulusBody(c) {
    if (c.speakable && c.showText) {
      return html`<div class="qline">
        <p class="qbody stimulus-text" data-testid="stimulus-text">${renderText(c.st.text)}</p>
        ${stimulusPlayback(c)}
      </div>`;
    }
    if (c.showText && !c.speakable) return html`<p class="stimulus-text" data-testid="stimulus-text">${renderText(c.st.text)}</p>`;
    if (c.speakable && !c.showText) return html`<div class="qline centred">${stimulusPlayback(c)}</div>`;
    return null;
  }

  function Stimulus(p) {
    var st = p.stimulus;
    if (!st) return null;
    var audio = p.audio;
    var lines = audio ? speechLines(st) : [];
    var clip = stimulusClip(st, audio);
    var speakable = lines.length > 0 || !!clip;
    var noSource = !!audio && !!st.hideText && !hasPlayableSource(st);
    var showText = stimulusTextVisible(st);
    var c = { p: p, st: st, audio: audio, lines: lines, clip: clip, speakable: speakable, showText: showText };
    return html`<section class="stimulus" data-testid="stimulus">
      ${st.title ? html`<h2 class="stimulus-title" data-testid="stimulus-title">${renderText(st.title)}</h2>` : null}
      ${stimulusBody(c)}
      ${noSource ? html`<p class="notice" role="status" data-testid="stimulus-nosource-notice">${audio.t('stimulus.nosource')}</p>` : null}
    </section>`;
  }

  function readingText(list) {
    return Array.isArray(list) && list.length > 0 ? list.join(' / ') : null;
  }

  function kanjiRow(k) {
    var onRead = readingText(k.on);
    var kunRead = readingText(k.kun);
    return html`<li class="kanji-row-grid" data-testid="kanji-row">
      <span class="glyph-ch" data-testid="kanji-ch">${k.kanji}</span>
      <span class="kanji-mean" data-testid="kanji-mean">${k.meaning}</span>
      ${onRead || kunRead ? html`<span class="kanji-read muted" data-testid="kanji-read">
        ${onRead ? html`<span data-testid="kanji-on">${onRead}</span>` : null}
        ${onRead && kunRead ? ' / ' : ''}
        ${kunRead ? html`<span data-testid="kanji-kun">${kunRead}</span>` : null}
      </span>` : null}
    </li>`;
  }

  // Rows from DojoExt.registerFeedbackRows (a course plugin, else a module fallback such as ja kanji rows).
  function feedbackRowsFor(p, s, examMode) {
    var item = s.cur && s.cur.item;
    if (!item || !s.result || !DojoExt.feedbackRows) return null;
    return DojoExt.feedbackRows(item, { examMode: !!examMode, items: p.content ? p.content.items : undefined, course: p.course });
  }

  function kanjiRows(p, s, examMode) {
    var breakdown = feedbackRowsFor(p, s, examMode);
    if (!breakdown || !breakdown.length) return null;
    var t = p.t;
    return html`<ul class="kanji-rows" data-testid="kanji-rows">
      <li class="muted" data-testid="kanji-label">${t('session.kanji')}</li>
      ${breakdown.map(kanjiRow)}
    </ul>`;
  }

  function stimText(st) { return st && typeof st === 'object' ? st.text : st; }

  function dupeSet(prompts) {
    var seen = Object.create(null), dupes = Object.create(null);
    prompts.forEach(function (p) { if (seen[p]) dupes[p] = true; seen[p] = true; });
    return dupes;
  }

  function itemLabel(item, stimulus, dupes) {
    var prompt = item.prompt;
    if (!dupes || !Object.prototype.hasOwnProperty.call(dupes, prompt) || !dupes[prompt]) return prompt;
    var text = stimText(stimulus);
    if (text) return text;
    if (typeof item.answer === 'number' || (typeof item.answer === 'string' && item.answer)) return String(item.answer);
    return prompt;
  }

  function create() {
    return { itemLabel: itemLabel, dupeSet: dupeSet, Stimulus: Stimulus, kanjiRows: kanjiRows, tagInfo: tagInfo, captionFor: captionFor, fmtClock: fmtClock, percent: percent, uniqueSorted: uniqueSorted, toggle: toggle, localDay: localDay };
  }

  var api = { create: create, hasPlayableSource: hasPlayableSource };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoStimulus = api;
})(typeof self !== 'undefined' ? self : this);
