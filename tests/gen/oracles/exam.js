'use strict';

const { MASK64, SPLITMIX64_INC, SPLITMIX64_MUL1, SPLITMIX64_MUL2 } = require('../const.js');

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

function hasList(list) {
  return list !== undefined && list !== null;
}

function matchesSection(c, section) {
  if (hasList(section.units) && !section.units.includes(c.unit)) return false;
  if (hasList(section.tags) && !c.tags.some(t => section.tags.includes(t))) return false;
  if (hasList(section.types) && !section.types.includes(c.type)) return false;
  return true;
}

function groupCandidates(candidates, section, used) {
  const groups = [];
  const stimToIndex = new Map();
  for (const c of candidates) {
    if (used.has(c.id)) continue;
    if (!matchesSection(c, section)) continue;
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
  return groups;
}

function drawSection(groups, section, seed) {
  const tierOf = (g) => g.some(c => c.examOnly === true);
  const tiers = [groups.filter(tierOf), groups.filter(g => !tierOf(g))];
  let remaining = section.count;
  let state = seed;
  const picked = [];
  for (const tierGroups of tiers) {
    if (tierGroups.length === 0) continue;
    if (tierGroups !== tiers[0] && tiers[0].length > 0 && remaining === 0) continue;
    const r = drawTierJs(tierGroups, remaining, state);
    state = r.state;
    remaining = r.left;
    for (const c of r.picked) picked.push(c);
  }
  return { picked, state, remaining };
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
    const groups = groupCandidates(candidates, section, used);
    const r = drawSection(groups, section, seed);
    for (const c of r.picked) { used.add(c.id); ids.push(c.id); }
    seed = r.state;
    const sectionCount = section.count - r.remaining;
    sectionsOut.push({ title: section.title, start: sectionStart, count: sectionCount });
    startIdx += sectionCount;
    if (r.remaining > 0) short.push({ title: section.title, shortBy: r.remaining });
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
  splitmix64Js,
  drawTierJs,
  sampleJs,
  scoreJs
};
