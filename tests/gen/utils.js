'use strict';

const { MASK64, SPLITMIX64_INC, SPLITMIX64_MUL1, SPLITMIX64_MUL2 } = require('./const.js');

// A number that is written to the vector file with a ".0" suffix (parsed as a float by Rust).
class Fl {
  constructor(n) { this.n = n; }
  toJSON() { return '__FLOAT__' + this.n + '__'; }
}

function toJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/"__FLOAT__(-?\d+)__"/g, '$1.0') + '\n';
}

function assertUnique(cases, groupName) {
  const names = cases.map(c => c.name);
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) {
      console.error(`Duplicate case name '${n}' in ${groupName}`);
      process.exit(1);
    }
    seen.add(n);
  }
}

function noonMsOf(dateKey) {
  const parts = dateKey.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], 12);
}

// Seeded member pick of the scoped queue (mirror of groups::shuffle_entities / srs::pick_drill).
function fnv1aJs(text) {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(text, 'utf8')) h = ((h ^ BigInt(b)) * 0x100000001b3n) & MASK64;
  return h;
}

function pickDrillJs(members, n, courseId, day, entity) {
  const list = members.slice();
  if (list.length > 1) {
    let state = fnv1aJs(courseId + '|' + day + '|' + entity);
    for (let i = list.length - 1; i >= 1; i--) {
      const r = splitmix64Js(state);
      state = r.newState;
      const j = Number(r.value % BigInt(i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list.slice(0, Math.max(n, 1));
}

function splitmix64Js(state) {
  const newState = (state + SPLITMIX64_INC) & MASK64;
  let z = newState;
  z = (z ^ (z >> 30n)) & MASK64;
  z = (z * SPLITMIX64_MUL1) & MASK64;
  z = (z ^ (z >> 27n)) & MASK64;
  z = (z * SPLITMIX64_MUL2) & MASK64;
  const result = (z ^ (z >> 31n)) & MASK64;
  return { newState, value: result };
}

function normalizeJs(text, opts) {
  let result = text;

  // Defaults
  const caseSensitive = opts && opts.caseSensitive !== undefined ? opts.caseSensitive : false;
  const trim = opts && opts.trim !== undefined ? opts.trim : true;
  const collapseSpaces = opts && opts.collapseSpaces !== undefined ? opts.collapseSpaces : true;
  const stripPunctuation = opts && opts.stripPunctuation !== undefined ? opts.stripPunctuation : false;

  // Step 1: lowercase if not case sensitive
  if (!caseSensitive) {
    result = result.toLowerCase();
  }

  // Step 1b: fold mappings (single char -> string, or range "A-Z" -> "a-z")
  if (opts && opts.fold && opts.fold.length) {
    const chars = Array.from(result);
    result = chars.map((c) => {
      for (const [from, to] of opts.fold) {
        const f = Array.from(from);
        if (f.length === 1) {
          if (f[0] === c) return to;
        } else {
          const t = Array.from(to);
          if (f[1] === '-' && c.codePointAt(0) >= f[0].codePointAt(0) && c.codePointAt(0) <= f[2].codePointAt(0)) {
            return String.fromCodePoint(t[0].codePointAt(0) + c.codePointAt(0) - f[0].codePointAt(0));
          }
        }
      }
      return c;
    }).join('');
  }

  // Step 2: strip punctuation
  if (stripPunctuation) {
    result = result.replace(/[^\p{L}\p{N}\s]/gu, '');
  }

  // Step 3: collapse whitespace
  if (collapseSpaces) {
    result = result.replace(/\s+/g, ' ');
  }

  // Step 4: trim
  if (trim) {
    result = result.trim();
  }

  return result;
}

function gapVerdictJs(input, opts) {
  const answers = input.answers || [];
  const retry = input.retry || [];
  const text = input.input;

  const normalizedInput = normalizeJs(text, opts);

  // Check if input matches any answer
  for (const a of answers) {
    if (normalizeJs(a, opts) === normalizedInput) {
      return 'ok';
    }
  }

  // Check if input matches any retry reading
  for (const r of retry) {
    if (normalizeJs(r, opts) === normalizedInput) {
      return 'retry';
    }
  }

  return 'wrong';
}

function drawTierJs(groupsIn, count, stateIn) {
  let state = stateIn;
  const groupList = groupsIn.slice();
  for (let i = groupList.length - 1; i > 0; i--) {
    const { newState, value } = splitmix64Js(state);
    state = newState;
    const j = Number(value % BigInt(i + 1));
    [groupList[i], groupList[j]] = [groupList[j], groupList[i]];
  }
  const sizes = groupList.map(g => g.length);
  let chosen = [];
  let left = count;
  sizes.forEach((sz, i) => {
    if (left > 0 && sz <= left) { chosen.push(i); left -= sz; }
  });
  if (left > 0 && sizes.some(sz => sz > 1)) {
    const memo = new Map();
    const best = (i, s) => {
      if (i >= sizes.length || s <= 0) return 0;
      const key = i * 100000 + s;
      if (memo.has(key)) return memo.get(key);
      let r = best(i + 1, s);
      if (sizes[i] <= s) r = Math.max(r, sizes[i] + best(i + 1, s - sizes[i]));
      memo.set(key, r);
      return r;
    };
    const target = best(0, count);
    if (target > count - left) {
      chosen = [];
      let s = target;
      for (let i = 0; i < sizes.length && s > 0; i++) {
        if (sizes[i] <= s && best(i + 1, s - sizes[i]) === s - sizes[i]) {
          chosen.push(i);
          s -= sizes[i];
        }
      }
      left = count - target;
    }
  }
  const picked = [];
  for (const i of chosen) for (const c of groupList[i]) picked.push(c);
  return { picked, left, state };
}

function sampleJs(input) {
  const candidates = input.candidates || [];
  const sections = input.sections || [];
  let seed = BigInt(input.seed);

  const used = new Set();
  const ids = [];
  const short = [];
  const sectionsOut = [];
  let startIdx = 0;

  for (const section of sections) {
    const sectionStart = startIdx;
    const groups = [];
    const stimToIndex = new Map();
    for (const c of candidates) {
      if (used.has(c.id)) continue;

      if (section.units !== undefined && section.units !== null) {
        if (section.units.length === 0) continue;
        if (!section.units.includes(c.unit)) continue;
      }

      if (section.tags !== undefined && section.tags !== null) {
        if (section.tags.length === 0) continue;
        if (!c.tags.some(t => section.tags.includes(t))) continue;
      }

      if (section.types !== undefined && section.types !== null) {
        if (section.types.length === 0) continue;
        if (!section.types.includes(c.type)) continue;
      }

      const stim = c.stimulus;
      if (stim !== undefined && stim !== null) {
        if (!stimToIndex.has(stim)) {
          stimToIndex.set(stim, groups.length);
          groups.push([]);
        }
        groups[stimToIndex.get(stim)].push(c);
      } else {
        groups.push([c]);
      }
    }

    const tierOf = (g) => g.some(c => c.examOnly === true);
    const tiers = [groups.filter(tierOf), groups.filter(g => !tierOf(g))];
    let remaining = section.count;
    let state = seed;
    for (const tierGroups of tiers) {
      if (tierGroups.length === 0) continue;
      if (tierGroups !== tiers[0] && tiers[0].length > 0 && remaining === 0) continue;
      const r = drawTierJs(tierGroups, remaining, state);
      state = r.state;
      remaining = r.left;
      for (const c of r.picked) { used.add(c.id); ids.push(c.id); }
    }
    seed = state;
    const sectionCount = section.count - remaining;
    sectionsOut.push({ title: section.title, start: sectionStart, count: sectionCount });
    startIdx += sectionCount;

    if (remaining > 0) {
      short.push({ title: section.title, shortBy: remaining });
    }
  }

  return { ids, short, sections: sectionsOut };
}

function scoreJs(input) {
  const results = input.results || [];
  const total = input.total || 0;
  const passMark = input.passMark === undefined ? 0.6 : input.passMark;

  const raw = results.filter(r => r.correct).length;
  const fraction = total === 0 ? 0.0 : raw / total;

  const mode = input.pass && input.pass.mode ? input.pass.mode : (input.scoring ? 'points' : 'percent');

  let pass;
  let parts, totalPoints;

  if (input.scoring) {
    totalPoints = 0;
    parts = input.scoring.map(part => {
      let partRaw = 0;
      let partTotal = 0;
      for (const title of part.sections) {
        const sr = input.sections.find(x => x.title === title);
        partTotal += sr.count;
        partRaw += results.slice(sr.start, sr.start + sr.count).filter(r => r.correct).length;
      }
      const points = partTotal === 0 ? 0 : Math.round(part.points * partRaw / partTotal);
      totalPoints += points;
      const partPass = part.minPoints === undefined || points >= part.minPoints;
      return { title: part.title, raw: partRaw, total: partTotal, points, pass: partPass };
    });
  }

  if (mode === 'percent') {
    pass = total > 0 && fraction >= passMark;
  } else {
    pass = parts.every(p => p.pass) && (input.passPoints === undefined || totalPoints >= input.passPoints);
  }

  const out = { raw, total, fraction, pass };
  if (parts) {
    out.parts = parts;
    out.totalPoints = totalPoints;
  }
  if (mode === 'points' && input.pass && input.pass.scaled === true) {
    out.estimate = true;
  }
  return out;
}

module.exports = {
  Fl, toJson, assertUnique, noonMsOf,
  fnv1aJs, pickDrillJs, splitmix64Js,
  normalizeJs, gapVerdictJs,
  drawTierJs, sampleJs, scoreJs
};
