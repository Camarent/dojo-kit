'use strict';
// tools/sim/index.js — session and grading simulator over the dojo core wasm bundle.
// Grading, scheduling and queue building run in the core; this file only holds the in-memory progress doc and the clock.

// Seeded [0, 1) generator (mulberry32); used when the policy gives no rng.
function mulberry(seed) {
  let a = Number(seed) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A text that no accepted answer of a gap item equals (a wrong typed answer).
function wrongText(answers) {
  let text = '-';
  while (answers.includes(text)) text += '-';
  return text;
}

// createSim({course, items, intros?, stimuli?, now, seed, wasm}) -> sim. wasm: a loaded dojo handle from web/dojo-wasm.js load().
// intros and stimuli are accepted for API parity; the core build does not read them, so they change nothing here.
function createSim(opts) {
  const { course, items, now, seed, wasm } = opts || {};
  if (!course || !Array.isArray(items) || !wasm) throw new TypeError('createSim needs course, items and wasm');
  const byId = new Map(items.map((it) => [it.id, it]));
  const clock = {
    now: Number(now) || 0,
    advance(ms) {
      clock.now += ms;
      return clock.now;
    },
  };
  const records = {};
  // Core pacing: buildSession returns an empty queue below daysLeft 4, so 4 is the default (the app's SESSION_DAYS_LEFT).
  const lastBuild = { daysLeft: 4 };
  let current = null;

  // Core grade of one answer. Choice items take a boolean (the learner picks the right or a wrong option, from item.answer).
  // Gap items take a boolean (the item's first answer or a wrong text) or the typed answer text.
  function gradeInput(item, input) {
    const isBool = typeof input === 'boolean';
    if (!isBool && typeof input !== 'string') throw new TypeError('answer input must be a boolean (right/wrong) or an answer text');
    if (Array.isArray(item.options) && item.options.length > 1 && Number.isInteger(item.answer)) {
      if (!isBool) throw new TypeError(`item ${item.id} is a choice: answer with a boolean`);
      const selected = input ? item.answer : (item.answer + 1) % item.options.length;
      return wasm.call('checkChoice', { answer: item.answer, selected });
    }
    if (Array.isArray(item.answers) && item.answers.length > 0) {
      const text = isBool ? (input ? item.answers[0] : wrongText(item.answers)) : input;
      return wasm.call('checkGap', { answers: item.answers, input: text });
    }
    throw new TypeError(`item ${item.id} has neither choice options nor gap answers`);
  }

  function buildSession(o = {}) {
    if (o.daysLeft !== undefined) lastBuild.daysLeft = o.daysLeft;
    const built = wasm.call('buildSession', {
      units: course, items, records, now: clock.now, daysLeft: lastBuild.daysLeft,
      courseId: course.id || '', seed: String(seed), introducedToday: o.introducedToday || 0,
    });
    current = { queue: built.queue.slice(), plan: built.plan, answers: [], repeats: {} };
    return { queue: built.queue, plan: built.plan };
  }

  // Core finish numbers of the current session: answered, right, weakLeft, nextDue, denominator.
  function finishSummary() {
    const units = {};
    items.forEach((it) => { (units[it.unit] = units[it.unit] || []).push(it.id); });
    return wasm.call('sessionFinish', {
      answers: current.answers, units: Object.keys(units).map((u) => units[u]), records, now: clock.now,
      planned: current.plan.total, repeatsAdded: Math.max(0, current.queue.length - current.plan.total),
    });
  }

  // Returns {correct, record, requeued, finish}; finish is the core summary after this answer.
  function answer(itemId, input) {
    if (!current) throw new Error('no session: call buildSession first');
    const item = byId.get(itemId);
    if (!item) throw new Error(`unknown item ${itemId}`);
    const correct = gradeInput(item, input) === true;
    current.answers.push({ id: itemId, right: correct });
    const rec = records[itemId] === undefined ? null : records[itemId];
    const next = wasm.call('applyPractice', { rec, correct, now: clock.now });
    if (next) records[itemId] = next;
    let requeued = null;
    if (!correct) {
      const unit = item.unit;
      const pool = [...new Set(current.queue.filter((id) => byId.get(id) && byId.get(id).unit === unit))];
      requeued = wasm.call('sessionRequeue', {
        unit, pool, answered: itemId, alreadyRepeated: current.repeats[unit] || 0, repeatMax: 1,
        seed: String(Number(seed) + current.queue.length),
      });
      if (requeued !== null) {
        current.queue.push(requeued);
        current.repeats[unit] = (current.repeats[unit] || 0) + 1;
      }
    }
    return { correct, record: records[itemId], requeued, finish: finishSummary() };
  }

  // Rebuild the session from the current records (same clock and settings).
  function rebuild() {
    return buildSession({});
  }

  // One session (one day) per call. policy {accuracy, weakUnits, rng(seed)}: right with probability accuracy;
  // items of weakUnits are always wrong. rng(seed) returns a [0, 1) generator; default mulberry(seed).
  // Returns {queue, plan, finish}; the caller moves the clock between days.
  function runSession(policy = {}) {
    const accuracy = policy.accuracy === undefined ? 1 : policy.accuracy;
    const weak = new Set(policy.weakUnits || []);
    const next = policy.rng ? policy.rng(String(seed)) : mulberry(seed);
    const built = buildSession({});
    for (let i = 0; i < current.queue.length; i++) {
      const id = current.queue[i];
      answer(id, next() < (weak.has(byId.get(id).unit) ? 0 : accuracy));
    }
    return { queue: built.queue, plan: built.plan, finish: finishSummary() };
  }

  return { clock, buildSession, answer, rebuild, records: () => records, runSession };
}

module.exports = { createSim };
