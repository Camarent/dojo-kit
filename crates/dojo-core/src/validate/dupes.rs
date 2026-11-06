use super::{Sink, items::fold_norm};
use crate::check::{Normalize, normalize};
use crate::content::{ClozePart, Item, ItemType};
use std::collections::{BTreeMap, BTreeSet};

/// An item with its source file and line.
type Located<'a> = (&'a str, usize, &'a Item);

/// Normalize answer sets for comparison
fn normalize_answer_set(item: &Item, course_norm: Option<&Normalize>) -> Vec<Vec<String>> {
    let norm_opts = effective_norm(item, course_norm);

    match item {
        Item::Gap(g) => {
            let mut v: Vec<String> = g.answers.iter().map(|a| normalize(a, &norm_opts)).collect();
            v.sort();
            v.dedup();
            vec![v]
        }
        Item::Cloze(c) => {
            c.parts
                .iter()
                .filter_map(|p| match p {
                    ClozePart::Blank(alts) => {
                        let mut v: Vec<String> = alts.iter().map(|a| normalize(a, &norm_opts)).collect();
                        v.sort();
                        v.dedup();
                        Some(v)
                    }
                    _ => None,
                })
                .collect()
        }
        Item::Choice(c) => {
            // The answer is the correct option; a bad index is reported by the item check, not here.
            let v: Vec<String> = c.options.get(c.answer).map(|o| normalize(o, &norm_opts)).into_iter().collect();
            vec![v]
        }
        Item::Numeric(n) => {
            // For numeric, we convert the answer to a normalized string representation
            vec![vec![format!("{:.6}", n.answer)]]
        }
        _ => Vec::new(),
    }
}

/// Effective normalization for an item: the same precedence as the leak check (`fold_norm`), then the item's own options.
fn effective_norm(item: &Item, course_norm: Option<&Normalize>) -> Normalize {
    let item_norm = match item {
        Item::Gap(g) => g.normalize.as_ref(),
        Item::Cloze(c) => c.normalize.as_ref(),
        _ => None,
    };
    fold_norm(item_norm, course_norm).cloned().or_else(|| item_norm.cloned()).unwrap_or_default()
}

/// Check for items with same prompt but different answers
pub(super) fn check_same_prompt_diff_answers(items: &[(&str, usize, &Item)], sink: &mut Sink, course_norm: Option<&Normalize>) {
    // Group items by type and normalized prompt, but only for gap, cloze, numeric, and choice types
    // and only for non-stimulus items
    let mut by_prompt: BTreeMap<String, Vec<(&str, usize, &Item)>> = BTreeMap::new();
    
    for (file, line, item) in items {
        // Skip stimulus and retired items
        if item.stimulus().is_some() || item.is_retired() {
            continue;
        }
        
        // Only check gap, cloze, numeric, and choice
        let item_type = item.item_type();
        if !matches!(item_type, ItemType::Gap | ItemType::Cloze | ItemType::Numeric | ItemType::Choice) {
            continue;
        }
        
        // Normalize the prompt
        let norm_opts = effective_norm(item, course_norm);
        let norm_prompt = normalize(item.prompt(), &norm_opts);
        
        // Skip empty prompts
        if norm_prompt.is_empty() {
            continue;
        }
        
        // Different types are different skills (e.g. meaning choice vs reading gap on one headword)
        by_prompt.entry(format!("{item_type:?}\u{0}{norm_prompt}")).or_default().push((*file, *line, *item));
    }
    
    // For each prompt with multiple items, check if they have different answer sets
    for prompt_items in by_prompt.values() {
        if prompt_items.len() < 2 {
            continue;
        }
        
        // Group items by their normalized answer sets
        let mut by_answers: BTreeMap<Vec<Vec<String>>, Vec<Located>> = BTreeMap::new();
        
        for (file, line, item) in prompt_items {
            let answers = normalize_answer_set(item, course_norm);
            by_answers.entry(answers).or_default().push((*file, *line, *item));
        }
        
        if by_answers.len() > 1 {
            let Some(&(file, line, _)) = prompt_items.first() else { continue };
            let ids: Vec<String> = prompt_items.iter().map(|(_, _, it)| format!("'{}'", it.id())).collect();
            sink.warning(
                "same_prompt_different_answers",
                file,
                line,
                format!("items {} share the prompt but have different answers; reword one prompt (AGENTS.md 8a)", ids.join(", ")),
            );
        }
    }
}

/// Prompt reduced for duplicate matching: lowercase, `{base|reading}` ruby kept as base, parenthesised hints removed, whitespace collapsed, trailing punctuation trimmed.
fn dup_prompt_key(prompt: &str) -> String {
    prompt_parts(prompt).0
}

/// Kana-only parenthesised hints (readings, a reading hint after a kanji headword) and ruby readings of a prompt.
fn prompt_readings(prompt: &str) -> (Vec<String>, Vec<String>) {
    let parts = prompt_parts(prompt);
    (parts.1, parts.2)
}

/// True when the prompts carry kana hints that name different cards: a hint that is neither the other prompt's hint nor a ruby reading of either prompt.
fn kana_hints_differ(a: &str, b: &str) -> bool {
    let (ah, ar) = prompt_readings(a);
    let (bh, br) = prompt_readings(b);
    let only = |own: &[String], other: &[String]| own.iter().any(|h| !other.contains(h) && !ar.contains(h) && !br.contains(h));
    only(&ah, &bh) || only(&bh, &ah)
}

/// (key, kana hints, ruby readings) of a prompt.
fn prompt_parts(prompt: &str) -> (String, Vec<String>, Vec<String>) {
    let mut out = String::new();
    let mut depth = 0usize;
    let mut in_ruby_reading = false;
    let mut in_ruby = false;
    let mut hint = String::new();
    let mut hints: Vec<String> = Vec::new();
    let mut readings: Vec<String> = Vec::new();
    for (idx, c) in prompt.char_indices() {
        match c {
            '(' | '\u{ff08}' => {
                if depth == 0 {
                    hint.clear();
                }
                depth += 1;
            }
            ')' | '\u{ff09}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 && !hint.is_empty() && hint.chars().all(|k| ('\u{3040}'..='\u{30ff}').contains(&k)) {
                    hints.push(hint.clone());
                }
            }
            _ if depth > 0 => hint.push(c),
            // An unclosed `{` is plain text, so it cannot hide the rest of the prompt.
            '{' if prompt[idx..].contains('}') => {
                in_ruby = true;
                readings.push(String::new());
            }
            '|' if in_ruby => in_ruby_reading = true,
            '}' if in_ruby => {
                in_ruby = false;
                in_ruby_reading = false;
            }
            _ if in_ruby_reading => {
                if let Some(r) = readings.last_mut() {
                    r.push(c);
                }
            }
            _ => out.extend(c.to_lowercase()),
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let key = collapsed.trim_end_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace() || "\u{3002}\u{3001}\u{ff01}\u{ff1f}\u{2026}".contains(c)).to_string();
    (key, hints, readings)
}

/// One candidate for the dup_word check: file, line, item, flat answer set.
type DupCandidate<'a> = (&'a str, usize, &'a Item, BTreeSet<String>);

/// Check for live items in the same unit and type whose prompts match (after normalization) and whose one answer set contains the other (likely one word entered twice)
pub(super) fn check_dup_word(items: &[(&str, usize, &Item)], sink: &mut Sink, course_norm: Option<&Normalize>) {
    let superseded: BTreeSet<&str> = items.iter().filter_map(|(_, _, it)| it.supersedes_field()).flatten().map(String::as_str).collect();
    // Grouped by unit, type and prompt key, so only items with the same prompt are compared pairwise.
    let mut by_group: BTreeMap<(String, &str, String), Vec<DupCandidate>> = BTreeMap::new();

    for (file, line, item) in items {
        if item.stimulus().is_some() || item.is_retired() || superseded.contains(item.id()) {
            continue;
        }
        let item_type = item.item_type();
        if !matches!(item_type, ItemType::Gap | ItemType::Cloze | ItemType::Numeric | ItemType::Choice) {
            continue;
        }
        let answers: BTreeSet<String> = normalize_answer_set(item, course_norm).into_iter().flatten().collect();
        if answers.is_empty() {
            continue;
        }
        let key = dup_prompt_key(item.prompt());
        if key.is_empty() {
            continue;
        }
        by_group.entry((item.unit().to_string(), item_type.as_str(), key)).or_default().push((*file, *line, *item, answers));
    }

    for group in by_group.values() {
        for (i, a) in group.iter().enumerate() {
            for b in group.iter().skip(i + 1) {
                if !(a.3.is_subset(&b.3) || b.3.is_subset(&a.3)) || kana_hints_differ(a.2.prompt(), b.2.prompt()) {
                    continue;
                }
                sink.warning(
                    "dup_word",
                    a.0,
                    a.1,
                    format!("items '{}', '{}' have the same prompt and nested answers; the same word may be entered twice", a.2.id(), b.2.id()),
                );
            }
        }
    }
}
