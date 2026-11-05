//! Kanji-ruby checks for course `ruby` config: `ruby_on_skip_kanji` and `ruby_missing`.
//! The skip rules run only when `markup` is `ruby` and a skip source (`skip` or `skipTag`) is set.

use super::Sink;
use crate::content::{Course, Item, RubyConfig};
use std::collections::HashSet;

const RUBY_MARKUP: &str = "ruby";
const DEFAULT_SKIP_KEY: &str = "meta.kanji";

fn is_han(c: char) -> bool {
    matches!(c as u32, 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0x20000..=0x2A6DF)
}

/// Splits `text` into the base of every `{base|reading}` span and the Han characters outside all spans.
fn scan_ruby(text: &str) -> (Vec<&str>, Vec<char>) {
    let mut bases = Vec::new();
    let mut bare = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        bare.extend(rest[..open].chars().filter(|c| is_han(*c)));
        let after = &rest[open + 1..];
        let Some(close) = after.find('}') else {
            bare.extend(after.chars().filter(|c| is_han(*c)));
            return (bases, bare);
        };
        match after[..close].split_once('|') {
            Some((base, _)) => bases.push(base),
            None => bare.extend(after[..close].chars().filter(|c| is_han(*c))),
        }
        rest = &after[close + 1..];
    }
    bare.extend(rest.chars().filter(|c| is_han(*c)));
    (bases, bare)
}

/// Value of `skipKey` on an item; only paths under `meta` (for example `meta.kanji`) resolve.
fn meta_str<'a>(item: &'a Item, key: &str) -> Option<&'a str> {
    let mut path = key.split('.');
    if path.next()? != "meta" {
        return None;
    }
    let mut value = item.meta()?;
    for seg in path {
        value = value.get(seg)?;
    }
    value.as_str()
}

/// The skip set: Han of `ruby.skip` plus Han of the `skipKey` string of every item tagged `skipTag`.
/// `None` unless `markup` is `ruby`, `ruby.checkQuestions` is true and a skip source is set.
pub(super) fn skip_set<'a>(course: Option<&Course>, items: impl Iterator<Item = &'a Item>) -> Option<HashSet<char>> {
    let ruby = course?.ruby.as_ref()?;
    if ruby.check_questions != Some(true) || course?.markup.as_deref() != Some(RUBY_MARKUP) || (ruby.skip.is_none() && ruby.skip_tag.is_none()) {
        return None;
    }
    let mut set: HashSet<char> = ruby.skip.as_deref().unwrap_or("").chars().filter(|c| is_han(*c)).collect();
    if let Some(tag) = ruby.skip_tag.as_deref() {
        let key = ruby.skip_key.as_deref().unwrap_or(DEFAULT_SKIP_KEY);
        for item in items.filter(|i| i.tags().iter().any(|t| t == tag)) {
            if let Some(text) = meta_str(item, key) {
                set.extend(text.chars().filter(|c| is_han(*c)));
            }
        }
    }
    Some(set)
}

fn is_drill(item: &Item, ruby: &RubyConfig) -> bool {
    let unit_hit = ruby.drill_units.as_ref().is_some_and(|us| us.iter().any(|u| u == item.unit()));
    let tag_hit = ruby.drill_tags.as_ref().is_some_and(|ts| item.tags().iter().any(|t| ts.contains(t)));
    unit_hit || tag_hit
}

fn options(item: &Item) -> &[String] {
    match item {
        Item::Choice(i) => &i.options,
        Item::Multi(i) => &i.options,
        _ => &[],
    }
}

/// A base whose Han characters are all in the skip set renders bare, so its ruby is redundant.
fn hidden_base(base: &str, skip: &HashSet<char>) -> bool {
    let han: Vec<char> = base.chars().filter(|c| is_han(*c)).collect();
    !han.is_empty() && han.iter().all(|c| skip.contains(c))
}

/// Checks one active item against the course `ruby` config; no-op without a `ruby` section.
/// `ruby_skip` is the set from [`skip_set`]; `None` turns off the skip rules.
pub(super) fn check_ruby(item: &Item, course: Option<&Course>, ruby_skip: Option<&HashSet<char>>, sink: &mut Sink, file: &str, line: usize) {
    let Some(ruby) = course.and_then(|c| c.ruby.as_ref()) else { return };
    let id = item.id();

    if is_drill(item, ruby) {
        let (_, bare) = scan_ruby(item.prompt());
        if !bare.is_empty() {
            sink.warning("ruby_missing", file, line, format!("drill item '{id}' has a kanji without a {{base|reading}} ruby"));
        }
        return;
    }

    let Some(skip) = ruby_skip else { return };
    let mut hidden = false;
    let mut missing = false;
    for text in std::iter::once(item.prompt()).chain(options(item).iter().map(String::as_str)) {
        let (bases, bare) = scan_ruby(text);
        hidden |= bases.iter().any(|b| hidden_base(b, skip));
        missing |= bare.iter().any(|c| !skip.contains(c));
    }
    if hidden {
        sink.warning("ruby_on_skip_kanji", file, line, format!("item '{id}' has ruby on kanji that the ruby skip set already hides"));
    }
    if missing {
        sink.warning("ruby_missing", file, line, format!("item '{id}' has a kanji outside the ruby skip set without a {{base|reading}} ruby"));
    }
}
