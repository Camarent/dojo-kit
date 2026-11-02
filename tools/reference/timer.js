'use strict';

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const fin = Number.isFinite;

const normScale = (x) => (fin(x) ? clamp(x, 0.5, 2.0) : 1);
const normStreak = (x) => (fin(x) && x >= 0 ? Math.floor(x) : 0);

// {scale, streak, outcome, answerMs, limitMs} -> {scale, streak}
function timerNext(input) {
  const scale = normScale(input.scale);
  const streak = normStreak(input.streak);
  if (input.outcome !== 'correct') return { scale: round4(Math.min(2.0, scale * 1.2)), streak: 0 };
  const { answerMs, limitMs } = input;
  const fast = fin(answerMs) && fin(limitMs) && answerMs <= 0.8 * limitMs;
  if (!fast) return { scale: round4(scale), streak: 0 };
  const n = streak + 1;
  if (n >= 3) return { scale: round4(Math.max(0.5, scale * 0.9)), streak: 0 };
  return { scale: round4(scale), streak: n };
}

// {baseMs, scale} -> ms, clamped to 1500..60000
function timerLimit({ baseMs, scale }) {
  const base = fin(baseMs) ? baseMs : 8000;
  return clamp(Math.round(base * normScale(scale)), 1500, 60000);
}

module.exports = { timerNext, timerLimit, round4 };
