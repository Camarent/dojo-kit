#!/usr/bin/env node
'use strict';

const fs = require('fs');

/**
 * Reads and parses a JSON file.
 *
 * If the file is missing and a default was passed, returns the default.
 * A missing file without a default throws the fs error.
 */
function readJson(file, ...rest) {
  if (!fs.existsSync(file) && rest.length > 0) return rest[0];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Reads a JSONL file into an array of parsed rows.
 *
 * A missing file yields []. Blank lines are skipped.
 * A bad line throws an error naming the file and the 1-based line number.
 */
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`${file}:${i + 1}: invalid JSON (${err.message})`);
    }
  });
  return rows;
}

module.exports = { readJson, readJsonl };
