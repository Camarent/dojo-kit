/*
 * ui/home.js — Home component (GroupCard lives in ui/group-card.js)
 * Globals expected: preact, htm, DojoStorage, DojoSession, DojoTypes, DojoExt, DojoCommon.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  // Load dependencies
  var DojoExt = root.DojoExt || {};
  var DojoSession = root.DojoSession || (typeof require !== 'undefined' ? require('./session.js') : null) || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var DojoGroupCard = root.DojoGroupCard || (typeof require !== 'undefined' ? require('./group-card.js') : null) || {};
  var GroupCard = DojoGroupCard.GroupCard;

  // Alias from DojoCommon
  var renderText = DojoCommon.renderText;
  var cls = DojoCommon.cls;
  var ProgressBar = DojoCommon.ProgressBar;
  var ProgressMeter = DojoCommon.ProgressMeter;
  var Notice = DojoCommon.Notice;
  var StatusChip = DojoCommon.StatusChip;

  // Use tagInfo from DojoSession if available, otherwise define it
  var tagInfo = DojoSession.tagInfo || function(course, tag) {
    var e = course && course.tagLabels && Object.prototype.hasOwnProperty.call(course.tagLabels, tag) ? course.tagLabels[tag] : null;
    var label = typeof e === 'string' ? e : e && typeof e.label === 'string' ? e.label : '';
    return { label: label || String(tag).toUpperCase(), internal: !!(e && typeof e === 'object' && e.kind === 'internal') };
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtClock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }

  function fmtExamDate(lang, key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return '';
    try {
      return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
    } catch (e) { return key; }
  }

  function orderedGroupIds(course, groups) {
    var ids = (course.groups || []).map(function (g) { return g.id; }).filter(function (id) { return groups[id] !== undefined; });
    Object.keys(groups).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  // ---------- Home ----------

  function Home(p) {
    var t = p.t;
    var d = p.home;
    var c = d.counts;
    var course = p.course;
    var canReview = c.due + c.newToday > 0;
    var exams = p.exams || [];
    var hasPlacement = course.placement !== undefined;
    var placementDone = !!d.placementDone;
    var resume = p.resume;
    var groups = c.groups;
    var bars = c.bars;
    var hasGroups = groups && Object.keys(groups).length > 0;
    var hasBars = !!(bars && bars.length > 0);
    var sumDue = c.summary ? c.summary.due : c.due;
    var sumNew = c.summary ? c.summary.newToday : c.newToday;
    var weakList = p.engine && p.engine.weakList && p.engine.weakList(8) || [];

    return html`<main class="screen" data-testid="home">
      <header class="head">
        <h1>${course.title}</h1>
        <${StatusChip} t=${t} status=${p.status} />
      </header>
      <${Notice} text=${p.notice} />
      ${p.examDaysLeft !== null ? renderCountdown(p, t) : null}
      ${resume ? renderResumeSection(p, t, resume) : null}
      ${renderStatsSection(t, d, sumDue, sumNew)}
      ${c.summary && hasGroups ? html`<p class="muted stats-note" data-testid="stats-note">${t('home.stat.newHint')}</p>` : null}
      ${c.summary ? html`<p class="muted session-count" data-testid="session-count">${t('home.session.count', { n: c.summary.queue })}</p>` : null}
      ${renderActionsSection({ p: p, t: t, c: c, hasPlacement: hasPlacement, placementDone: placementDone, canReview: canReview, weakList: weakList, hasGroups: hasGroups })}
      ${hasGroups ? renderGroupsSection(p, t, course, groups) : null}
      ${exams.length ? renderExamsSection(t, exams, p) : null}
      ${hasBars ? renderBarsSection(t, bars) : null}
      ${!hasGroups ? renderUnitsSection(p, t, course, c, hasBars) : null}
      ${hasGroups ? renderOtherSection(p, t, course, groups, c) : null}
    </main>`;
  }

  function renderCountdown(p, t) {
    var date = fmtExamDate(p.lang, p.examDate);
    return html`<p class=${cls('exam-countdown', p.examDaysLeft <= 7 && 'soon')} data-testid="exam-countdown">${t('home.exam.countdown', { n: p.examDaysLeft }) + (date ? ' · ' + date : '')}</p>`;
  }

  // Helper: resume section
  function renderResumeSection(p, t, resume) {
    return html`<section class="resume-box" data-testid="resume-box">
      <p data-testid="resume-text">${t('home.resume.exam', { n: resume.answered, total: resume.total, ms: fmtClock(resume.remainingMs) })}</p>
      <div class="row">
        <button type="button" class="btn primary" data-testid="btn-resume" onClick=${function () { p.onResume(); }}>${t('home.resume.start')}</button>
        <button type="button" class="btn" data-testid="btn-startover" onClick=${function () { p.onStartOver(); }}>${t('home.resume.startover')}</button>
        <button type="button" class="btn" data-testid="btn-discard" onClick=${function () { p.onDiscard(); }}>${t('home.resume.discard')}</button>
      </div>
    </section>`;
  }

  // Helper: stats section
  function renderStatsSection(t, d, sumDue, sumNew) {
    return html`<section class="stats" aria-label=${t('home.stats')}>
      <div class="stat" data-testid="stat-streak"><b>${d.streak}</b><span>${t('n.days', { n: d.streak })}</span></div>
      <div class="stat" data-testid="stat-due"><b>${sumDue}</b><span>${t('n.due', { n: sumDue })}</span></div>
      <div class="stat" data-testid="stat-new" title=${t('home.stat.newHint')}><b>${sumNew}</b><span>${t('n.new', { n: sumNew })}</span></div>
    </section>`;
  }

  // Helper: actions section
  function stimShared() { return (root.DojoStimulus || (typeof require !== 'undefined' ? require('./stimulus.js') : null)).create(); }
  function weakDupes(list) { return stimShared().dupeSet(list.map(function (w) { return w.prompt; })); }
  function weakLabel(w, dupes) {
    return stimShared().itemLabel({ prompt: w.prompt || '', answer: w.answer }, w.stimText, dupes) || '';
  }

  function renderActionsSection(o) {
    var p = o.p, t = o.t, c = o.c, weakList = o.weakList;
    var hasWeak = weakList.length > 0;
    var dupes = weakDupes(weakList);
    var hasPlacement = o.hasPlacement, placementDone = o.placementDone, canReview = o.canReview, hasGroups = o.hasGroups;
    var placementOpen = hasPlacement && !placementDone;
    var reviewPrimary = c.due > 0 && !placementOpen;
    var practicePrimary = !reviewPrimary && !placementOpen;
    return html`<section class="actions">
      ${c.fresh > c.newToday && !hasGroups ? html`<div class="row wrap more-new" data-testid="more-new">
        <button type="button" class="btn" data-testid="btn-more-5" onClick=${function () { p.onMoreNew(5); }}>${t('home.moreNew', { n: 5 })}</button>
        <button type="button" class="btn" data-testid="btn-more-10" onClick=${function () { p.onMoreNew(10); }}>${t('home.moreNew', { n: 10 })}</button>
        <button type="button" class="btn" data-testid="btn-more-20" onClick=${function () { p.onMoreNew(20); }}>${t('home.moreNew', { n: 20 })}</button>
      </div>` : null}
      ${hasPlacement && !placementDone ? html`<button type="button" class="btn primary big" data-testid="btn-placement"
        onClick=${function () { p.onPlacement(); }}>${t('home.placement')}</button>` : null}
      <button type="button" class=${'btn big' + (reviewPrimary ? ' primary' : '')} disabled=${!canReview} data-testid="btn-review"
        onClick=${function () { p.onStart('daily', {}); }}>${t('home.review')}</button>
      ${canReview ? null : html`<p class="muted" data-testid="review-hint">${t('home.review.empty')}</p>`}
      <div class="row wrap">
        <button type="button" class=${'btn' + (practicePrimary ? ' primary' : '')} data-testid="btn-practice" onClick=${function () { p.go('practice'); }}>${t('home.practice')}</button>
        ${hasWeak ? html`<button type="button" class="btn" data-testid="btn-weak" aria-label=${t('home.weak') + ' ' + t('home.weak.count', { n: weakList.length })}
          onClick=${function () { p.onStart('weak', {}); }}>${t('home.weak')}</button>` : null}
      </div>
      <div class="row pair" data-testid="secondary-actions">
        <button type="button" class="btn" data-testid="btn-settings" onClick=${function () { p.go('settings'); }}>${t('home.settings')}</button>
        <button type="button" class="btn" data-testid="btn-catalog" onClick=${function () { p.go('catalog'); }}>${t('home.catalog')}</button>
      </div>
      ${hasWeak ? html`<div class="weak-chips-block">
        <h3 class="weak-title" id="weak-title" data-testid="weak-title">${t('home.weakspots')}</h3>
        <ul class="chips weak-chips" data-testid="weak-chips" aria-labelledby="weak-title">
          ${weakList.map(function (item) {
            var plain = DojoExt.plain(weakLabel(item, dupes));
            var truncated = plain.length > 24 ? plain.slice(0, 24) + '\u2026' : plain;
            return html`<li><span class="chip" title=${plain}><span class="chip-text">${truncated}</span></span></li>`;
          })}
        </ul>
      </div>` : null}
    </section>`;
  }

  // Helper: groups section
  function renderGroupsSection(p, t, course, groups) {
    return html`<section aria-labelledby="groups-title">
      <h2 id="groups-title">${t('home.groups')}</h2>
      <ul class="groups" data-testid="groups">
        ${orderedGroupIds(course, groups).map(function (gid) {
          var g = course.groups.filter(function (gr) { return gr.id === gid; })[0] || { id: gid, title: gid };
          var gc = groups[gid];
          var overrides = p.engine.groupSettings ? p.engine.groupSettings(gid) : {};
          var merged = Object.assign({}, g, gc, overrides);
          return h(GroupCard, {
            t: t, group: merged, tagLabels: course.tagLabels,
            onStart: p.onStart, onGroupSetting: p.onGroupSetting, onMoreNew: p.onMoreNew
          });
        })}
      </ul>
    </section>`;
  }

  // Helper: exams section
  function renderExamsSection(t, exams, p) {
    return html`<section class="exams" aria-labelledby="exams-title">
      <h2 id="exams-title">${t('home.exams')}</h2>
      ${exams.map(function (exam) {
        return html`<div class="exam-box" key=${exam.id} data-testid=${exams.length > 1 ? 'exam-' + exam.id : 'exam-box'}>
          <div>
            <b>${exam.title || t('home.exam')}</b>
            <p class="muted">${[exam.minutes ? t('home.exam.minutes', { n: exam.minutes }) : '', exam.sections.join(', ')].filter(Boolean).join(' · ')}</p>
            ${exam.note ? html`<p class="muted">${exam.note}</p>` : null}
          </div>
          <div class="row wrap">
            ${exam.timed ? html`<button type="button" class="btn" data-testid=${'btn-training-' + exam.id}
              onClick=${function () { p.onStart('exam', { examId: exam.id, training: true }); }}>${t('home.exam.training')}</button>` : null}
            <button type="button" class="btn" data-testid=${exams.length > 1 ? 'btn-exam-' + exam.id : 'btn-exam'}
              onClick=${function () { p.onStart('exam', exams.length > 1 ? { examId: exam.id } : {}); }}>${t('home.exam.start')}</button>
          </div>
        </div>`;
      })}
    </section>`;
  }

  // Helper: bars section
  function renderBarsSection(t, bars) {
    return html`<section aria-labelledby="bars-title">
      <h2 id="bars-title">${t('home.bars')}</h2>
      <ul class="bars" data-testid="bars">
        ${bars.map(function (bar) {
          return html`<li key=${bar.title} class="bar-item" data-testid=${'bar-' + bar.title}>
            <${ProgressMeter} t=${t} title=${bar.title} learned=${bar.learned} started=${bar.started} total=${bar.total} />
          </li>`;
        })}
      </ul>
    </section>`;
  }

  // Helper: units section
  function renderUnitsSection(p, t, course, c, hasBars) {
    return html`<section aria-labelledby="units-title">
      <h2 id="units-title">${t('home.units')}</h2>
      ${c.active === 0 ? html`<p class="muted" data-testid="empty-course">${t('home.empty')}</p>` : html`<ul class="units" data-testid="units">
        ${c.totals && c.totals.total > 0 && !hasBars ? html`<li class="total-progress" data-testid="total-progress">
          <${ProgressBar} counts=${c.totals} ariaLabel=${t('progress.aria', c.totals)} />
        </li>` : null}
        ${(course.units || []).map(function (u) {
          var r = c.byUnit[u.id] || { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 };
          return html`<li key=${u.id} data-testid=${'unit-' + u.id}>
            <span class="unit-title">${renderText(u.title)}</span>
            ${r.total > 0 ? html`<${ProgressBar} counts=${r} ariaLabel=${t('progress.aria', r)} />` : null}
            <span class="unit-nums"><span title=${t('unit.total')}>${r.total}</span>
              <span class=${r.due ? 'due' : ''} title=${t('unit.due')}>${r.due}</span>
              <span title=${t('unit.new')}>${r.fresh}</span></span>
          </li>`;
        })}
      </ul>
      <p class="muted legend">${t('unit.legend')}</p>`}
    </section>`;
  }

  // Helper: other section (ungrouped units)
  function renderOtherSection(p, t, course, groups, c) {
    return html`<section aria-labelledby="other-title">
      <h2 id="other-title">${t('home.ungrouped')}</h2>
      ${(function () {
        var inGroup = {};
        (course.groups || []).forEach(function (g) {
          (g.units || []).forEach(function (u) { inGroup[u] = true; });
        });
        var ungroupedUnits = (course.units || []).filter(function (u) { return !inGroup[u.id]; });
        if (ungroupedUnits.length === 0) return null;
        var row = function (u) {
          var r = c.byUnit[u.id] || { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 };
          return html`<li key=${u.id} class="bar-item" data-testid=${'unit-' + u.id}>
            <${ProgressMeter} t=${t} short=${true} title=${u.title} learned=${r.learned} started=${r.learning} total=${r.total} due=${r.due} dueTestid=${'unit-' + u.id + '-due'} />
          </li>`;
        };
        var study = ungroupedUnits.filter(function (u) { return u.newPerDay !== 0; });
        var examUnits = ungroupedUnits.filter(function (u) { return u.newPerDay === 0; });
        return html`${study.length ? html`<ul class="bars" data-testid="other-units">${study.map(row)}</ul>` : null}
          ${examUnits.length ? html`<details class="exam-units" data-testid="exam-units">
            <summary>${t('home.examUnits')}</summary>
            <ul class="bars">${examUnits.map(row)}</ul>
          </details>` : null}`;
      })()}
    </section>`;
  }

  // Export helpers as globals for other modules to use
  root.fmtExamDate = fmtExamDate;
  root.orderedGroupIds = orderedGroupIds;

  // Export
  var api = { GroupCard: GroupCard, Home: Home };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoHome = api;
})(typeof self !== 'undefined' ? self : this);
