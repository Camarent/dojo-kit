'use strict';

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

module.exports = {
  normalizeJs,
  gapVerdictJs
};
