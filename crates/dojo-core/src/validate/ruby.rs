//! Kanji-ruby checks for course `ruby` config: `ruby_on_skip_kanji` and `ruby_missing`.

use super::Sink;
use crate::content::{Course, Item, RubyConfig};
use std::collections::HashSet;

fn is_han(c: char) -> bool {
    matches!(c as u32, 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0x20000..=0x2A6DF)
}

/// Splits `text` into the base of every `{base|reading}` span and whether a Han character sits outside all spans.
fn scan_ruby(text: &str) -> (Vec<&str>, bool) {
    let mut bases = Vec::new();
    let mut bare = false;
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        bare |= rest[..open].chars().any(is_han);
        let after = &rest[open + 1..];
        let Some(close) = after.find('}') else { break };
        match after[..close].split_once('|') {
            Some((base, _)) => bases.push(base),
            None => bare |= after[..close].chars().any(is_han),
        }
        rest = &after[close + 1..];
    }
    bare |= rest.chars().any(is_han);
    (bases, bare)
}

fn is_drill(item: &Item, ruby: &RubyConfig) -> bool {
    let unit_hit = ruby.drill_units.as_ref().is_some_and(|us| us.iter().any(|u| u == item.unit()));
    let tag_hit = ruby.drill_tags.as_ref().is_some_and(|ts| item.tags().iter().any(|t| ts.contains(t)));
    unit_hit || tag_hit
}

/// Checks one active item against the course `ruby` config; no-op without a `ruby` section.
pub(super) fn check_ruby(item: &Item, course: Option<&Course>, sink: &mut Sink, file: &str, line: usize) {
    let Some(ruby) = course.and_then(|c| c.ruby.as_ref()) else { return };
    let (bases, bare) = scan_ruby(item.prompt());
    let id = item.id();

    let skip: HashSet<char> = ruby.skip.as_deref().unwrap_or("").chars().filter(|c| is_han(*c)).collect();
    let hidden = bases.iter().any(|b| {
        let han: Vec<char> = b.chars().filter(|c| is_han(*c)).collect();
        !han.is_empty() && han.iter().all(|c| skip.contains(c))
    });
    if hidden {
        sink.warning("ruby_on_skip_kanji", file, line, format!("item '{id}' has ruby on kanji that the ruby skip set already hides"));
    }

    if bare && is_drill(item, ruby) {
        sink.warning("ruby_missing", file, line, format!("drill item '{id}' has a kanji without a {{base|reading}} ruby"));
    }
}
