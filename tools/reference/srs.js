/*
 * srs.js — spaced-repetition rules (pure functions, no DOM, no storage).
 * Runs in the browser (window.SRS) and in Node (module.exports).
 *
 * Progress record per item: { s: stage 0..6, due: ms, ok: n, bad: n, last: ms }
 * Stage intervals: 0 → 4h → 1d → 3d → 7d → 14d → mastered (30d).
 */
(function (root) {
  'use strict';

  var HOUR = 3600 * 1000;
  var DAY = 24 * HOUR;
  var INTERVALS = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var MAX_STAGE = 6;
  var MASTERED = 6;
  var PLACEMENT_STAGE = 4;

  function clampStage(s) {
    return Math.max(0, Math.min(MAX_STAGE, s | 0));
  }

  /** True when the item has ever been answered correctly or reached stage >= 1. */
  function everLearned(rec) {
    return !!rec && ((rec.ok | 0) > 0 || (rec.s | 0) > 0);
  }

  /**
   * Applies one graded answer and returns a NEW record.
   * Correct: stage + 1. Wrong: stage - 2, minimum 1 if the item was ever learned, else 0.
   * due = now + interval(new stage).
   */
  function applyAnswer(rec, correct, now) {
    var s = rec ? rec.s | 0 : 0;
    var ns;
    if (correct) {
      ns = clampStage(s + 1);
    } else {
      ns = s - 2;
      ns = Math.max(ns, everLearned(rec) ? 1 : 0);
      ns = clampStage(ns);
    }
    var out = {};
    if (rec && typeof rec === 'object') Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.s = ns;
    out.due = now + INTERVALS[ns];
    out.ok = (rec ? rec.ok | 0 : 0) + (correct ? 1 : 0);
    out.bad = (rec ? rec.bad | 0 : 0) + (correct ? 0 : 1);
    out.last = now;
    return out;
  }

  /**
   * Grades the first answer to an item in any training mode (daily, «Ещё», practice — CONTRACT Round 5a):
   * - no record or due → applyAnswer (normal SRS);
   * - started and not due → correct: stage and due unchanged, ok + 1, last = now (no early promotion);
   *   wrong: applyAnswer (stage − 2, floor 1 when ever learned; bad + 1).
   * Returns a NEW record; extra fields of a not-due record are kept on a correct answer.
   */
  function applyPractice(rec, correct, now) {
    if (!rec || typeof rec !== 'object' || typeof rec.due !== 'number' || rec.due <= now) return applyAnswer(rec, correct, now);
    if (!correct) return applyAnswer(rec, false, now);
    var out = {};
    Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.ok = (rec.ok | 0) + 1;
    out.last = now;
    return out;
  }

  /** True when introducing this item counts toward the daily new limit: only answers in the daily/«Ещё» flow (mode 'srs'). */
  function countsTowardDailyNew(mode, rec) {
    return mode === 'srs' && !rec;
  }

  /**
   * A later correct answer to an item re-queued in the same session.
   * Only an item that fell to stage 0 is promoted (to stage 1); otherwise the
   * record is returned unchanged, so wrong-then-right never beats a first-try answer.
   */
  function applyRelearn(rec, now) {
    if (!rec || (rec.s | 0) > 0) return rec;
    return { s: 1, due: now + INTERVALS[1], ok: rec.ok | 0, bad: rec.bad | 0, last: now };
  }

  /** Record for an item marked "known" in the placement check (stage 4, due spread over ~4–10 days). */
  function placementKnown(rec, now, rand) {
    var r = typeof rand === 'number' ? rand : Math.random();
    var s = Math.max(PLACEMENT_STAGE, rec ? rec.s | 0 : 0);
    var spread = INTERVALS[PLACEMENT_STAGE] * (0.6 + 0.8 * r);
    return { s: s, due: now + Math.round(spread), ok: rec ? rec.ok | 0 : 0, bad: rec ? rec.bad | 0 : 0, last: now };
  }

  /**
   * Applies placement marking to a record.
   * - known = true: move to stage 4 (or highest <= 4), with due spread over a deterministic window.
   * - known = false: return record unchanged.
   * - Idempotent: never lower an existing stage.
   * Uses splitmix64 seeded PRNG for deterministic spreading.
   */
  function applyPlacement(rec, known, now, ladder, seed) {
    if (!known) {
      return rec === null || rec === undefined ? null : Object.assign({}, rec);
    }
    if (!rec || typeof rec !== 'object') {
      rec = { s: 0, ok: 0, bad: 0 };
    }
    var ladderToUse = ladder || INTERVALS;
    var maxStage = Math.max(0, ladderToUse.length - 1);
    var target = Math.min(4, maxStage);
    var currentStage = rec.s | 0;
    
    // Idempotent: if already at or past target, return unchanged
    if (currentStage >= target) {
      return Object.assign({}, rec);
    }
    
    // Seed is a decimal u64 (string, or a safe non-negative integer number); matches Rust `str::parse::<u64>`.
    var seedStr = String(seed);
    if (!/^\d+$/.test(seedStr) || BigInt(seedStr) >= (1n << 64n)) {
      throw new Error('seed must be a decimal u64');
    }
    var state = BigInt(seedStr);
    
    // One iteration of splitmix64 (standard algorithm)
    // Must mask after each operation to stay within 64 bits
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    var z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    var randValue = (z ^ (z >> 31n)) & 0xffffffffffffffffn;
    
    // Convert to [0, 1) to match Rust's (randValue as f64) / (u64::MAX as f64)
    // Use upper 53 bits to avoid precision loss when converting BigInt to Number
    // Shift right by 11 to get upper 53 bits, then divide by 2^53
    var upper53 = randValue >> 11n;
    var max53 = 1n << 53n; // 2^53
    var rand = Number(upper53) / Number(max53);
    var targetInterval = ladderToUse[target] || 0;
    var spread = targetInterval * (0.6 + 0.8 * rand);
    var due = now + Math.round(spread);
    
    var out = Object.assign({ ok: 0, bad: 0 }, rec);
    out.s = target;
    out.due = due;
    out.last = now;
    return out;
  }

  function isDue(rec, now) {
    return !!rec && rec.due <= now;
  }

  function isNew(rec) {
    return !rec;
  }

  /** Kanji characters (CJK unified ideographs + 々) contained in a string. */
  function kanjiChars(str) {
    var out = [];
    if (!str) return out;
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      var code = c.charCodeAt(0);
      if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) out.push(c);
    }
    return out;
  }

  /**
   * Round 11: true when every kanji of the word is an N5 kanji (n5:true). `word` is a vocab entry or a string;
   * `kanji` is the kanji.json list or a char -> entry map. Words without kanji are readable.
   */
  function isN5Readable(word, kanji) {
    var text = typeof word === 'string' ? word : (word && word.kanji) || '';
    var map = kanji;
    if (Array.isArray(kanji)) { map = {}; kanji.forEach(function (k) { map[k.kanji] = k; }); }
    map = map || {};
    return kanjiChars(text).every(function (c) { return !!map[c] && map[c].n5 === true; });
  }

  function lessonKey(n) {
    return typeof n === 'number' ? n : 999;
  }

  /**
   * Order in which NEW items are introduced. Returns an array of ids.
   * 1. N5 kanji in Genki lesson order (kanji without a lesson after lesson 12), each followed by
   *    the N5 words whose kanji are all already introduced; up to 2 kana-only N5 words
   *    (by lesson) are slipped in after each kanji.
   * 2. The rest: remaining N5 words by lesson, then non-N5 kanji by lesson, then non-N5 words.
   */
  function orderNew(kanjiList, vocabList) {
    kanjiList = kanjiList || [];
    vocabList = vocabList || [];
    var stable = function (arr, key) {
      return arr.map(function (x, i) { return { x: x, i: i }; })
        .sort(function (a, b) { return key(a.x) - key(b.x) || a.i - b.i; })
        .map(function (o) { return o.x; });
    };
    var n5Kanji = stable(kanjiList.filter(function (k) { return k.n5; }), function (k) { return lessonKey(k.genki); });
    var otherKanji = stable(kanjiList.filter(function (k) { return !k.n5; }), function (k) { return lessonKey(k.genki); });
    var n5Vocab = stable(vocabList.filter(function (v) { return v.n5; }), function (v) { return lessonKey(v.lesson); });
    var otherVocab = stable(vocabList.filter(function (v) { return !v.n5; }), function (v) { return lessonKey(v.lesson); });

    var vocabWithKanji = [];
    var kanaOnly = [];
    n5Vocab.forEach(function (v) {
      var ks = kanjiChars(v.kanji);
      if (ks.length) vocabWithKanji.push({ v: v, ks: ks });
      else kanaOnly.push(v);
    });

    var out = [];
    var used = Object.create(null);
    var push = function (id) {
      if (!used[id]) { used[id] = true; out.push(id); }
    };
    var introduced = Object.create(null);
    var kanaIdx = 0;

    n5Kanji.forEach(function (k) {
      push(k.id);
      introduced[k.kanji] = true;
      vocabWithKanji.forEach(function (e) {
        if (used[e.v.id]) return;
        if (e.ks.every(function (c) { return introduced[c]; })) push(e.v.id);
      });
      for (var j = 0; j < 2 && kanaIdx < kanaOnly.length; j++) push(kanaOnly[kanaIdx++].id);
    });
    // Rest
    while (kanaIdx < kanaOnly.length) push(kanaOnly[kanaIdx++].id);
    vocabWithKanji.forEach(function (e) { push(e.v.id); });
    otherKanji.forEach(function (k) { push(k.id); });
    otherVocab.forEach(function (v) { push(v.id); });
    return out;
  }

  /**
   * Today's queue.
   * items: progress map {id: rec}; order: result of orderNew; newAllowance: how many new items.
   * Returns { due: [ids sorted by due asc], fresh: [ids] }.
   */
  function buildQueue(items, order, now, newAllowance) {
    items = items || {};
    var due = [];
    var knownIds = Object.create(null);
    order.forEach(function (id) { knownIds[id] = true; });
    Object.keys(items).forEach(function (id) {
      if (knownIds[id] && isDue(items[id], now)) due.push(id);
    });
    due.sort(function (a, b) { return items[a].due - items[b].due; });
    var fresh = [];
    var n = Math.max(0, newAllowance | 0);
    for (var i = 0; i < order.length && fresh.length < n; i++) {
      if (isNew(items[order[i]])) fresh.push(order[i]);
    }
    return { due: due, fresh: fresh };
  }

  /** Weakness score: items answered wrong at least once, worst first. */
  function weakest(items, limit, validIds) {
    items = items || {};
    var list = Object.keys(items).filter(function (id) {
      var r = items[id];
      return r && (r.bad | 0) > 0 && (!validIds || validIds[id]);
    });
    var score = function (r) {
      var ok = r.ok | 0, bad = r.bad | 0;
      return (bad + 1) / (ok + bad + 2) + (r.s < 3 ? 0.1 : 0);
    };
    list.sort(function (a, b) {
      return score(items[b]) - score(items[a]) || (items[b].bad | 0) - (items[a].bad | 0) || (items[b].last || 0) - (items[a].last || 0);
    });
    return list.slice(0, limit == null ? 10 : limit);
  }

  /** Local calendar date key "YYYY-MM-DD". */
  function dayKey(ms) {
    var d = new Date(ms);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /** Consecutive study days ending today (or yesterday, if today has no study yet). days: {dayKey: count}. */
  function streak(days, now) {
    days = days || {};
    var d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
    var n = 0;
    while (days[dayKey(d.getTime())]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /** Whole days from `now` until the local date y-m-d (0 on the day itself, negative after). */
  function daysUntil(y, m, d, now) {
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    var b = new Date(y, m - 1, d); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / DAY);
  }

  /**
   * Words related to a kanji: every vocab entry whose `kanji` field contains it, plus the kanji's own
   * `examples` not already in that list (same written form and reading). Examples count as N5 with no lesson.
   * Order: N5 first, then Genki lesson (none last), then shorter written form, then original order.
   * Returns [{ w, r, ru, id (vocab id or null), n5, lesson }].
   */
  function relatedWords(k, vocabList) {
    var out = [];
    var seen = Object.create(null);
    (vocabList || []).forEach(function (v) {
      if (!v.kanji || v.kanji.indexOf(k.kanji) < 0) return;
      var key = v.kanji + '|' + v.kana;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ w: v.kanji, r: v.kana, ru: v.ru, id: v.id, n5: !!v.n5, lesson: typeof v.lesson === 'number' ? v.lesson : null });
    });
    (k.examples || []).forEach(function (e) {
      if (!e || !e.w) return;
      var key = e.w + '|' + e.r;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ w: e.w, r: e.r, ru: e.ru, id: null, n5: true, lesson: null });
    });
    return out.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      return (b.x.n5 - a.x.n5) || (lessonKey(a.x.lesson) - lessonKey(b.x.lesson)) || (a.x.w.length - b.x.w.length) || a.i - b.i;
    }).map(function (o) { return o.x; });
  }

  /* ---- Round 8: sentence drills as a question format for kanji / vocab items ---- */

  var SENTENCE_P = 1 / 3;

  /** Written form of a sentence drill's [[target]] (furigana markup stripped). */
  function sentenceTarget(d) {
    var m = /\[\[(.+?)\]\]/.exec((d && d.q) || '');
    return m ? m[1].replace(/\{([^{}|]+)\|[^{}|]+\}/g, '$1') : '';
  }

  /**
   * Sentence drills that may stand in for a question about `item`:
   * vocab (v-…) → drills with vocab === item.id;
   * kanji (k-…) → drills whose vocab word is already started (has a record in `items`) and whose
   *   read target / write answer contains the kanji.
   */
  function sentenceCandidates(item, drills, items) {
    if (!item || typeof item.id !== 'string') return [];
    items = items || {};
    return (drills || []).filter(function (d) {
      if (!d || (d.type !== 'read' && d.type !== 'write')) return false;
      if (item.id.indexOf('v-') === 0) return d.vocab === item.id;
      if (item.id.indexOf('k-') !== 0 || !item.kanji || !items[d.vocab]) return false;
      return (d.type === 'read' ? sentenceTarget(d) : String(d.answer || '')).indexOf(item.kanji) >= 0;
    });
  }

  /**
   * The drill to ask instead of the usual question about `item`, or null (normal question).
   * Only for started items (a record exists: never on the intro of a new item); drills in `used` (this session)
   * are skipped; with probability `p` (default 1/3, `rng` default Math.random) one candidate is chosen at random.
   */
  function pickSentence(item, drills, items, used, rng, p) {
    if (!item || !items || !items[item.id]) return null;
    var c = sentenceCandidates(item, drills, items).filter(function (d) { return !used || !used[d.id]; });
    if (!c.length) return null;
    var r = rng || Math.random;
    if (!(r() < (p == null ? SENTENCE_P : p))) return null;
    return c[Math.min(c.length - 1, Math.floor(r() * c.length))];
  }

  /** Up to `n` random ids of not-yet-started items (no progress record) from `list`; n5Only filters to N5. */
  function randomNew(items, list, n, n5Only, rand) {
    var r = rand || Math.random;
    var pool = (list || []).filter(function (it) { return !items[it.id] && (!n5Only || it.n5); }).map(function (it) { return it.id; });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, Math.max(0, n | 0));
  }

  /* ---- grammar (Round 10): the SRS unit is the POINT (record key gp-NNN for g-NNN); drills (gq-…) only rotate ---- */

  /** Point ladder (grammar only): stages 0..8, intervals 0 → 2h → 8h → 1d → 2d → 4d → 7d → 14d → 30d; mastered = 8. */
  var GRAMMAR_INTERVALS = [0, 2 * HOUR, 8 * HOUR, DAY, 2 * DAY, 4 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var GRAMMAR_MAX_STAGE = 8;
  var GRAMMAR_MASTERED = 8;

  /** Progress key of a point: g-017 → gp-017 (accepts a point object too). */
  function pointKey(point) {
    var id = typeof point === 'string' ? point : point && point.id;
    return 'gp-' + String(id || '').replace(/^g-/, '');
  }

  function clampPointStage(s) {
    return Math.max(0, Math.min(GRAMMAR_MAX_STAGE, s | 0));
  }

  /** applyAnswer on the point ladder. Correct: stage + 1. Wrong: stage − 2, floor 1 when ever learned (else 0). */
  function applyPointAnswer(rec, correct, now) {
    var s = rec ? rec.s | 0 : 0;
    var ns = correct ? clampPointStage(s + 1) : clampPointStage(Math.max(s - 2, everLearned(rec) ? 1 : 0));
    var out = {};
    if (rec && typeof rec === 'object') Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.s = ns;
    out.ps = ns;          // Round 10 follow-up: protected copy of the stage (old clients clamp `s` to 6 but keep unknown fields)
    out.due = now + GRAMMAR_INTERVALS[ns];
    out.ok = (rec ? rec.ok | 0 : 0) + (correct ? 1 : 0);
    out.bad = (rec ? rec.bad | 0 : 0) + (correct ? 0 : 1);
    out.last = now;
    return out;
  }

  /** applyPractice (Round 5a) on the point ladder: no record or due → normal grading; not due → correct only ok + 1. */
  function applyPointPractice(rec, correct, now) {
    if (!rec || typeof rec !== 'object' || typeof rec.due !== 'number' || rec.due <= now) return applyPointAnswer(rec, correct, now);
    if (!correct) return applyPointAnswer(rec, false, now);
    var out = {};
    Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.ok = (rec.ok | 0) + 1;
    out.ps = Math.max(rec.s | 0, typeof rec.ps === 'number' ? rec.ps : 0);
    out.last = now;
    return out;
  }

  /** applyRelearn on the point ladder: a later correct answer in the same session lifts only a stage-0 point to stage 1. */
  function applyPointRelearn(rec, now) {
    if (!rec || (rec.s | 0) > 0) return rec;
    return { s: 1, ps: 1, due: now + GRAMMAR_INTERVALS[1], ok: rec.ok | 0, bad: rec.bad | 0, last: now };
  }

  function validGq(r) {
    return !!r && typeof r === 'object' && typeof r.s === 'number' && typeof r.due === 'number';
  }

  /**
   * Legacy migration: the gp record a point would get from its old per-drill gq records, or null when none exists.
   * stage = clamp(round(mean stage of its started drills), 1, 6), due = earliest due, ok/bad = sums, last = latest.
   * Deterministic (same gq records → same record on every device). Never touches `items`.
   */
  function migratePoint(items, point) {
    items = items || {};
    var recs = (point.drills || []).map(function (d) { return items[d.id]; }).filter(validGq);
    if (!recs.length) return null;
    var sum = 0, due = Infinity, ok = 0, bad = 0, last = 0;
    recs.forEach(function (r) {
      sum += r.s | 0;
      due = Math.min(due, r.due);
      ok += r.ok | 0;
      bad += r.bad | 0;
      last = Math.max(last, +r.last || 0);
    });
    return { s: Math.max(1, Math.min(6, Math.round(sum / recs.length))), due: due, ok: ok, bad: bad, last: last };
  }

  /** The point's record: its gp record, else the legacy-migrated one (not stored), else null. */
  function pointRecord(items, point) {
    items = items || {};
    var r = items[pointKey(point)];
    return validGq(r) ? r : migratePoint(items, point);
  }

  /** Grammar points in study order: Genki lesson (none last), then file order. Returns point objects. */
  function grammarOrder(points) {
    return (points || []).map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return lessonKey(a.p.lesson) - lessonKey(b.p.lesson) || a.i - b.i; })
      .map(function (o) { return o.p; });
  }

  /** A point is started when it has a gp record or (legacy) any of its drills has a gq record. */
  function pointStarted(items, point) {
    return !!pointRecord(items, point);
  }

  /**
   * Today's grammar queue (Round 10): { due: [point ids due, oldest first], freshPoints: [point ids to introduce] }.
   * newPointAllowance = how many not-yet-started points may be introduced.
   */
  function grammarToday(items, points, now, newPointAllowance) {
    items = items || {};
    var due = [], dueAt = {};
    (points || []).forEach(function (p) {
      var r = pointRecord(items, p);
      if (r && isDue(r, now)) { due.push(p.id); dueAt[p.id] = r.due; }
    });
    due.sort(function (a, b) { return dueAt[a] - dueAt[b]; });
    var fresh = [];
    var n = Math.max(0, newPointAllowance | 0);
    grammarOrder(points).forEach(function (p) {
      if (fresh.length < n && !pointStarted(items, p)) fresh.push(p.id);
    });
    return { due: due, freshPoints: fresh };
  }

  /** Point state label from a stage: learning 1–2 (and a stage-0 record), familiar 3–4, strong 5–7, mastered 8. */
  function pointState(stage) {
    stage = stage | 0;
    return stage >= GRAMMAR_MASTERED ? 'mastered' : stage >= 5 ? 'strong' : stage >= 3 ? 'familiar' : 'learning';
  }

  /**
   * Mastery of a point: { state: 'new'|'learning'|'familiar'|'strong'|'mastered', stage, rec, started, total }.
   * Based on the gp record (legacy fallback: migrated from gq records). started/total count the point's drills that
   * have a gq record / exist (informational). `minStage` is kept as an alias of `stage` for old callers.
   */
  function pointMastery(items, point) {
    items = items || {};
    var drills = point.drills || [];
    var started = drills.filter(function (d) { return !!items[d.id]; }).length;
    var rec = pointRecord(items, point);
    var stage = rec ? rec.s | 0 : 0;
    return { state: rec ? pointState(stage) : 'new', stage: stage, minStage: stage, rec: rec, started: started, total: drills.length };
  }

  /**
   * Rotation: the next variant (drill) of a point. Pure; `rng` defaults to Math.random.
   * - candidates = drills not in `used` (map id → true); when all are used the cycle restarts (all candidates again);
   * - never the immediately previous drill (`prev.id`) when ≥ 2 drills exist;
   * - prefer a different `type` than `prev.type` when such a candidate exists;
   * - then the least recently seen (gq record `last`; no record = never seen = first), random tie-break.
   * Returns a drill or null (no drills).
   */
  function pickVariant(drills, items, used, prev, rng) {
    drills = drills || [];
    if (!drills.length) return null;
    items = items || {};
    var r = rng || Math.random;
    var c = drills.filter(function (d) { return !(used && used[d.id]); });
    if (!c.length) c = drills.slice();
    if (prev && prev.id != null && drills.length >= 2) {
      var np = c.filter(function (d) { return d.id !== prev.id; });
      if (np.length) c = np;
    }
    if (prev && prev.type != null) {
      var dt = c.filter(function (d) { return d.type !== prev.type; });
      if (dt.length) c = dt;
    }
    var lastOf = function (d) { var x = items[d.id]; return x && typeof x === 'object' ? +x.last || 0 : 0; };
    var min = Math.min.apply(null, c.map(lastOf));
    c = c.filter(function (d) { return lastOf(d) === min; });
    return c[Math.min(c.length - 1, Math.floor(r() * c.length))];
  }

  /** The `used` map after asking `drill`: a fresh map when this completes the cycle (every drill used), else extended. */
  function usedAfter(drills, used, drill) {
    var out = {};
    Object.keys(used || {}).forEach(function (k) { out[k] = true; });
    out[drill.id] = true;
    return (drills || []).every(function (d) { return out[d.id]; }) ? {} : out;
  }

  var api = {
    HOUR: HOUR,
    DAY: DAY,
    INTERVALS: INTERVALS,
    MAX_STAGE: MAX_STAGE,
    MASTERED: MASTERED,
    PLACEMENT_STAGE: PLACEMENT_STAGE,
    everLearned: everLearned,
    applyAnswer: applyAnswer,
    applyRelearn: applyRelearn,
    applyPractice: applyPractice,
    countsTowardDailyNew: countsTowardDailyNew,
    placementKnown: placementKnown,
    applyPlacement: applyPlacement,
    isDue: isDue,
    isNew: isNew,
    kanjiChars: kanjiChars,
    isN5Readable: isN5Readable,
    orderNew: orderNew,
    buildQueue: buildQueue,
    weakest: weakest,
    dayKey: dayKey,
    streak: streak,
    daysUntil: daysUntil,
    relatedWords: relatedWords,
    SENTENCE_P: SENTENCE_P,
    sentenceTarget: sentenceTarget,
    sentenceCandidates: sentenceCandidates,
    pickSentence: pickSentence,
    randomNew: randomNew,
    grammarOrder: grammarOrder,
    pointStarted: pointStarted,
    grammarToday: grammarToday,
    grammarQueue: grammarToday,
    pointMastery: pointMastery,
    GRAMMAR_INTERVALS: GRAMMAR_INTERVALS,
    GRAMMAR_MAX_STAGE: GRAMMAR_MAX_STAGE,
    GRAMMAR_MASTERED: GRAMMAR_MASTERED,
    pointKey: pointKey,
    pointRecord: pointRecord,
    pointState: pointState,
    migratePoint: migratePoint,
    applyPointAnswer: applyPointAnswer,
    applyPointPractice: applyPointPractice,
    applyPointRelearn: applyPointRelearn,
    pickVariant: pickVariant,
    usedAfter: usedAfter
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof self !== 'undefined' ? self : this);
