use serde::de::DeserializeOwned;

use super::{Course, Item, Intro, Stimulus};

/// A parse failure; `line` is 1-based for JSONL input and 0 otherwise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub message: String,
}

/// Result of parsing a JSONL file: every valid item with its 1-based line, and one error per bad line.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedItems {
    pub items: Vec<(usize, Item)>,
    pub errors: Vec<ParseError>,
}

/// Parsed JSONL records with 1-based line numbers; `errors` holds the lines that failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedJsonl<T> {
    pub stimuli: Vec<(usize, T)>,
    pub errors: Vec<ParseError>,
}

pub type ParsedStimuli = ParsedJsonl<Stimulus>;
/// Parsed `intros.jsonl`.
pub type ParsedIntros = ParsedJsonl<Intro>;

/// Parses `course.json` text; structural checks only.
pub fn parse_course(text: &str) -> Result<Course, Vec<ParseError>> {
    serde_json::from_str(text).map_err(|e| vec![ParseError { line: 0, message: e.to_string() }])
}

// Contract: `from` is below `text.len()` (callers pass `pos < len` or a prior result of this fn).
#[allow(clippy::indexing_slicing)]
fn next_line(text: &str, from: usize) -> Option<usize> {
    text.as_bytes()[from..].iter().position(|&b| b == b'\n').map(|i| from + i + 1).filter(|&i| i < text.len())
}

fn object_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if in_string {
            match (escaped, b) {
                (true, _) => escaped = false,
                (false, b'\\') => escaped = true,
                (false, b'"') => in_string = false,
                _ => {}
            }
        } else {
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
    }
    None
}

/// Shared scanner for JSONL parsing. Takes a parsing function that attempts to deserialize a chunk.
// Contract: `pos < bytes.len()` loop bound; `end` and `start` are offsets found inside `text`.
#[allow(clippy::indexing_slicing)]
fn scan_jsonl<'a, T, F>(text: &'a str, parse_fn: F) -> (Vec<(usize, T)>, Vec<ParseError>)
where
    T: DeserializeOwned,
    F: Fn(&'a str) -> Result<T, serde_json::Error>,
{
    let mut out_items = Vec::new();
    let mut out_errors = Vec::new();
    let bytes = text.as_bytes();
    let mut pos = 0;
    let mut line = 1;
    while pos < bytes.len() {
        match bytes[pos] {
            b'\n' => {
                line += 1;
                pos += 1;
            }
            b' ' | b'\t' | b'\r' => pos += 1,
            b'{' => match object_end(bytes, pos) {
                Some(end) => {
                    let chunk = &text[pos..=end];
                    match parse_fn(chunk) {
                        Ok(item) => out_items.push((line, item)),
                        Err(e) => out_errors.push(ParseError { line, message: e.to_string() }),
                    }
                    line += chunk.matches('\n').count();
                    pos = end + 1;
                }
                None => {
                    out_errors.push(ParseError { line, message: "unterminated JSON object".to_string() });
                    let mut next = next_line(text, pos);
                    let mut next_no = line + 1;
                    while let Some(start) = next {
                        if text[start..].lines().next().is_some_and(|l| l.trim_start().starts_with('{')) {
                            break;
                        }
                        next = next_line(text, start);
                        next_no += 1;
                    }
                    match next {
                        Some(start) => {
                            pos = start;
                            line = next_no;
                        }
                        None => break,
                    }
                }
            },
            _ => {
                out_errors.push(ParseError { line, message: "expected a JSON object".to_string() });
                match next_line(text, pos) {
                    Some(start) => {
                        pos = start;
                        line += 1;
                    }
                    None => break,
                }
            }
        }
    }
    (out_items, out_errors)
}

/// Parses item text: one JSON object per line (preferred) or pretty-printed objects spanning several lines.
/// Items carry the 1-based line where their object starts; blank lines are skipped but still counted.
/// A non-object fragment yields one error for its physical line; an object never closed yields one error
/// at its start line, and scanning resumes at the next line that starts with `{`.
pub fn parse_items(text: &str) -> ParsedItems {
    let (items, errors) = scan_jsonl(text, serde_json::from_str::<Item>);
    ParsedItems { items, errors }
}

/// Parses `stimuli.jsonl` text: one JSON object per line (same lenient parser as content items).
pub fn parse_stimuli(text: &str) -> ParsedStimuli {
    parse_jsonl(text)
}

/// Parses `intros.jsonl` text: one JSON object per line.
pub fn parse_intros(text: &str) -> ParsedIntros {
    parse_jsonl(text)
}

fn parse_jsonl<T: DeserializeOwned>(text: &str) -> ParsedJsonl<T> {
    let (stimuli, errors) = scan_jsonl(text, serde_json::from_str::<T>);
    ParsedJsonl { stimuli, errors }
}
