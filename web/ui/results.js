/*
 * ui/results.js — Results component
 * Globals expected: preact, htm, DojoCommon.
 * create(deps) takes { percent, fmtClock } and returns { Results }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var renderText = DojoCommon.renderText;
  var cls = DojoCommon.cls;
  var Notice = DojoCommon.Notice;

  function label(t, value) {
    return value === 'known' ? t('session.known') : value === 'again' ? t('session.again') : value === '-' ? t('session.dontKnow') : value;
  }

  function examVerdict(t, sum) {
    return html`<p class=${cls('banner', sum.pass ? 'good' : 'bad')} data-testid="exam-verdict">${sum.estimate ? (sum.pass ? t('results.pass_estimate') : t('results.fail_estimate')) : (sum.pass ? t('results.pass') : t('results.fail'))}</p>`;
  }

  function examParts(t, sum) {
    return html`<section data-testid="exam-parts">
      <h2>${t('results.parts')}</h2>
      <ul class="parts">
        ${sum.parts.map(function (part, i) {
          return html`<li key=${i} data-testid=${'part-' + i}>
            <b>${part.title}</b>: <span>${part.raw} / ${part.total}</span> · <span>${t('results.points', { n: part.points })}</span> · <span class=${part.pass ? 'good' : 'bad'}>${part.pass ? t('results.pass') : t('results.fail')}</span>
          </li>`;
        })}
      </ul>
      <p data-testid="exam-total-points"><b>${t('results.total_points', { n: sum.totalPoints })}</b>${sum.passPoints !== undefined ? ' · ' + t('results.pass_points', { n: sum.passPoints }) : ''}</p>
    </section>`;
  }

  function note(id, text) {
    return html`<p class="notice" data-testid=${id}>${text}</p>`;
  }

  function create(deps) {
    var percent = deps.percent;
    var fmtClock = deps.fmtClock;
    var itemLabel = deps.itemLabel || function (it) { return it.prompt; };

    function stats(t, sum, raw, total, pct) {
      return html`<section class="stats">
        <div class="stat" data-testid="score"><b>${raw} / ${total}</b><span>${t('results.score')}</span></div>
        <div class="stat" data-testid="percent"><b>${pct}%</b><span>${t('results.percent')}</span></div>
        <div class="stat" data-testid="time"><b>${fmtClock(sum.durationMs)}</b><span>${t('results.time')}</span></div>
      </section>`;
    }

    function labelOf(p, item) {
      var st = item.stimulus && p.stimuli ? p.stimuli.filter(function (s) { return s.id === item.stimulus; })[0] : null;
      return itemLabel(item, st, p.dupes);
    }

    // Playback props for the per-item play button (never an exam: no once-only lock).
    function audioProps(p, t) {
      var local = p.local;
      var Speech = root.DojoSpeech;
      if (!Speech || !DojoCommon.speechCfg) return null;
      var cfg = DojoCommon.speechCfg(p.course, p.store);
      return { t: t, win: p.win, cfg: cfg, exam: false, uiLang: p.lang, played: local.played, released: {},
        status: local.failed ? 'failed' : Speech.status(cfg, p.win), onFail: function () { local.failed = true; if (local.rerender) local.rerender(); } };
    }

    function playControl(p, t, item, r) {
      var st = item && item.stimulus && p.stimuli ? p.stimuli.filter(function (s) { return s.id === item.stimulus; })[0] : null;
      var audio = st && st.hideText ? audioProps(p, t) : null;
      if (!audio) return null;
      var A = root.DojoAudio;
      var ids = st.audio && st.audio.length ? st.audio.filter(function (id) { return !(p.engine && p.engine.isClipFlagged && p.engine.isClipFlagged(id)); }) : [];
      var clip = ids.length && A && A.ready && A.ready() ? { sid: st.id, ids: ids } : null;
      var lines = DojoCommon.speechLines ? DojoCommon.speechLines(st) : [];
      if (!clip && !lines.length) return null;
      return html`<p class="qline" data-testid=${'play-missed-wrap-' + r.id}><span class="muted">${t('results.play')}</span> <${DojoCommon.Playback} audio=${audio} lines=${lines} clip=${clip} testid=${'play-missed-' + r.id} pid=${'m:' + r.id} /></p>`;
    }

    function givenLine(t, r) {
      if ((r.given === '' || r.given === undefined) && r.timedOut) return html`<span class="muted" data-testid="timed-out-label">${t('results.timed_out')}</span>`;
      return renderText(label(t, r.given));
    }

    function missedItem(p, t, r) {
      var item = p.byId[r.id];
      return html`<li key=${r.id} data-testid=${'missed-' + r.id}>
        <p class="qtext">${item ? renderText(labelOf(p, item)) : r.id}</p>
        <p class="pre"><span class="muted">${t('results.given')}:</span> ${givenLine(t, r)}</p>
        <p class="pre"><span class="muted">${t('session.expected')}</span> ${renderText(r.expected)}</p>
        ${playControl(p, t, item, r)}
      </li>`;
    }

    function skippedItem(p, t, id) {
      var item = p.byId[id];
      return html`<li key=${id} data-testid=${'skipped-' + id} class="skipped">
        <p class="qtext">${item ? renderText(labelOf(p, item)) : id}</p>
        <p class="muted" data-testid="skipped-label">${t('results.skipped')}</p>
      </li>`;
    }

    function missedList(p0, t, sum, missed) {
      var ids = missed.map(function (r) { return r.id; }).concat(sum.skipped || []);
      var p = Object.assign({}, p0, { dupes: deps.dupeSet ? deps.dupeSet(ids.map(function (id) { return p0.byId[id] ? p0.byId[id].prompt : id; })) : {} });
      return html`<ul class="missed" data-testid="missed">
        ${missed.map(function (r) { return missedItem(p, t, r); })}
        ${sum.skipped && sum.skipped.length > 0 ? sum.skipped.map(function (id) { return skippedItem(p, t, id); }) : null}
      </ul>`;
    }

    function missedSection(p, t, sum, missed) {
      return html`<section>
        <h2>${t('results.missed')}</h2>
        ${missed.length === 0 && (!sum.skipped || sum.skipped.length === 0) ? html`<p class="muted" data-testid="no-missed">${t('results.none')}</p>` : missedList(p, t, sum, missed)}
      </section>`;
    }

    function statsHint(t, sum, exam) {
      var total = exam ? sum.total : sum.answered;
      var raw = exam ? sum.raw : sum.correct;
      return raw === 0 && total > 0 ? note('results-hint', t('results.hint')) : null;
    }

    function scoreStats(t, sum, exam) {
      var total = exam ? sum.total : sum.answered;
      var pct = exam ? percent(sum.fraction) : percent(total ? sum.correct / total : 0);
      return stats(t, sum, exam ? sum.raw : sum.correct, total, pct);
    }

    function actions(p, t, isPlacement) {
      return html`<div class="row results-actions">
        ${!isPlacement ? html`<button type="button" class="btn big primary btn-again-session" data-testid="btn-again-session" onClick=${p.onAgain}>${t('results.again')}</button>` : null}
        <button type="button" class="btn big" data-testid="btn-home" onClick=${function () { p.go('home'); }}>${t('results.home')}</button>
      </div>`;
    }

    // Plain call: stateless tree. Mounted by preact (new Results): local state persists and onFail re-renders.
    function view(p0, local) {
      var p = Object.assign({}, p0, { local: local || { failed: false, played: {} } });
      var t = p.t;
      var sum = p.summary;
      var exam = sum.mode === 'exam';
      var isPlacement = sum.mode === 'placement';
      var missed = sum.review.filter(function (r) { return !r.correct; });
      var first = !isPlacement;
      return html`<main class="screen" data-testid="results">
        <header class="head"><h1>${t('results.title')}</h1></header>
        ${isPlacement ? html`<p class="banner good" data-testid="placement-result">${t('results.placement')}</p>` : null}
        ${exam ? examVerdict(t, sum) : null}
        ${exam && sum.estimate ? note('exam-estimate', t('results.estimate_note')) : null}
        ${exam && sum.training ? note('exam-training', t('results.training')) : null}
        ${first ? scoreStats(t, sum, exam) : null}
        ${first ? statsHint(t, sum, exam) : null}
        ${exam && sum.parts && sum.parts.length ? examParts(t, sum) : null}
        ${exam && sum.note ? note('exam-note', sum.note) : null}
        ${exam && sum.short && sum.short.length ? html`<p class="notice">${t('session.short')}</p>` : null}
        ${first ? missedSection(p, t, sum, missed) : null}
        <${Notice} text=${p.notice} />
        ${actions(p, t, isPlacement)}
      </main>`;
    }

    // preact calls a function component with its instance as `this`; a plain call has none.
    function Results(props) {
      var self = this;
      if (!self || typeof self.forceUpdate !== 'function') return view(props);
      if (!self.local) self.local = { failed: false, played: {}, rerender: function () { self.forceUpdate(); } };
      return view(props, self.local);
    }

    return { Results: Results };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoResults = api;
})(typeof self !== 'undefined' ? self : this);
