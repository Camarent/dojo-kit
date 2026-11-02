'use strict';

const { timerNext, timerLimit } = require('../../../tools/reference/timer.js');

const next = (name, input) => ({ name, input, expect: timerNext(input), source: 'reference' });
const lim = (name, input) => ({ name, input, expect: timerLimit(input), source: 'reference' });
const st = (scale, streak, outcome, answerMs = 0, limitMs = 8000) => ({ scale, streak, outcome, answerMs, limitMs });

function makeTimerCases() {
  const nextCases = [
    next('wrong from 1', st(1, 0, 'wrong')),
    next('wrong resets streak', st(1, 2, 'wrong')),
    next('timeout from 1', st(1, 1, 'timeout')),
    next('wrong caps at 2.0', st(1.9, 0, 'wrong')),
    next('wrong at max', st(2, 0, 'wrong')),
    next('wrong from min', st(0.5, 2, 'wrong')),
    next('fast correct streak 0 to 1', st(1, 0, 'correct', 100)),
    next('fast correct streak 1 to 2', st(1, 1, 'correct', 100)),
    next('fast correct third shrinks', st(1.2, 2, 'correct', 100)),
    next('fast correct boundary 0.8', st(1, 0, 'correct', 6400)),
    next('slightly slow correct resets', st(1, 2, 'correct', 6401)),
    next('slow correct resets streak', st(1.3, 1, 'correct', 8000)),
    next('shrink floors at 0.5', st(0.5, 2, 'correct', 10)),
    next('shrink near floor', st(0.52, 2, 'correct', 10)),
    next('rounding to 4 places', st(1.1111, 2, 'correct', 10)),
    next('example step 1: 1 wrong', st(1, 0, 'wrong')),
    next('example step 2: fast 1', st(1.2, 0, 'correct', 1000)),
    next('example step 3: fast 2', st(1.2, 1, 'correct', 1000)),
    next('example step 4: fast 3', st(1.2, 2, 'correct', 1000, 9600)),
    next('zero answerMs fast', st(1, 0, 'correct', 0)),
    next('scale 5 slow correct clamps to 2', st(5, 0, 'correct', 9000)),
    next('scale 0.1 wrong -> 0.6', st(0.1, 0, 'wrong')),
    next('scale string -> 1', st('x', 0, 'wrong')),
    next('scale missing slow correct -> 1', { streak: 0, outcome: 'correct', answerMs: 9000, limitMs: 8000 }),
    next('streak 7 fast resets and shrinks', st(1, 7, 'correct', 10)),
    next('streak -1 fast -> 1', st(1, -1, 'correct', 10)),
    next('streak 2.5 fast resets', st(1, 2.5, 'correct', 10)),
    next('streak string -> 0', st(1, '2', 'correct', 10)),
    next('outcome bogus handled as wrong', st(1, 2, 'bogus')),
    next('answerMs missing is slow', { scale: 1, streak: 2, outcome: 'correct', limitMs: 8000 }),
    next('limitMs missing is slow', { scale: 1, streak: 2, outcome: 'correct', answerMs: 1 }),
    next('streak 1.5 floors to 1 then 2', st(1, 1.5, 'correct', 10)),
    next('plain path rounds to 4 places', st(1.23456, 0, 'correct', 9000)),
    next('answerMs string is slow', st(1, 2, 'correct', '10'))
  ];
  const limitCases = [
    lim('default base scale 1', { baseMs: 8000, scale: 1 }),
    lim('example 8000 x 1.2', { baseMs: 8000, scale: 1.2 }),
    lim('example 9600 shrunk', { baseMs: 8000, scale: 1.08 }),
    lim('min scale', { baseMs: 8000, scale: 0.5 }),
    lim('max scale', { baseMs: 8000, scale: 2 }),
    lim('clamp low 1500', { baseMs: 2000, scale: 0.5 }),
    lim('clamp low exact 1500', { baseMs: 3000, scale: 0.5 }),
    lim('clamp high 60000', { baseMs: 30000, scale: 2 }),
    lim('just below high', { baseMs: 29999, scale: 2 }),
    lim('rounds', { baseMs: 8001, scale: 1.0001 }),
    lim('half rounds up', { baseMs: 5001, scale: 0.5 }),
    lim('base 30000 scale 1', { baseMs: 30000, scale: 1 }),
    lim('base 2000 scale 1', { baseMs: 2000, scale: 1 }),
    lim('base 2000 scale 2', { baseMs: 2000, scale: 2 }),
    lim('base 10000 scale 0.7', { baseMs: 10000, scale: 0.7 }),
    lim('baseMs string -> 8000', { baseMs: 'x', scale: 1 }),
    lim('baseMs missing -> 8000', { scale: 1.5 }),
    lim('scale 9 clamps to 2', { baseMs: 8000, scale: 9 }),
    lim('baseMs 1000 not clamped upstream', { baseMs: 1000, scale: 2 }),
    lim('baseMs 50000 scale 1 not clamped', { baseMs: 50000, scale: 1 }),
    lim('scale missing -> 1', { baseMs: 8000 })
  ];
  return { groups: [{ fn: 'timerNext', cases: nextCases }, { fn: 'timerLimit', cases: limitCases }] };
}

module.exports = { makeTimerCases };
