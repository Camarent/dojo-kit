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
    // Group items by normalized prompt, but only for gap, cloze, and numeric types
    // and only for non-stimulus items
    let mut by_prompt: BTreeMap<String, Vec<(&str, usize, &Item)>> = BTreeMap::new();
    
    for (file, line, item) in items {
        // Skip stimulus items
        if item.stimulus().is_some() {
            continue;
        }
        
        // Only check gap, cloze, and numeric
        let item_type = item.item_type();
        if !matches!(item_type, ItemType::Gap | ItemType::Cloze | ItemType::Numeric) {
            continue;
        }
        
        // Normalize the prompt
        let norm_opts = effective_norm(item, course_norm);
        let norm_prompt = normalize(item.prompt(), &norm_opts);
        
        // Skip empty prompts
        if norm_prompt.is_empty() {
            continue;
        }
        
        by_prompt.entry(norm_prompt).or_default().push((*file, *line, *item));
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
    let mut out = String::new();
    let mut depth = 0usize;
    let mut in_ruby_reading = false;
    let mut in_ruby = false;
    for c in prompt.chars() {
        match c {
            '(' | '\u{ff08}' => depth += 1,
            ')' | '\u{ff09}' => depth = depth.saturating_sub(1),
            _ if depth > 0 => {}
            '{' => in_ruby = true,
            '|' if in_ruby => in_ruby_reading = true,
            '}' if in_ruby => {
                in_ruby = false;
                in_ruby_reading = false;
            }
            _ if in_ruby_reading => {}
            _ => out.extend(c.to_lowercase()),
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.trim_end_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace() || "\u{3002}\u{3001}\u{ff01}\u{ff1f}\u{2026}".contains(c)).to_string()
}

/// One candidate for the dup_word check: file, line, item, prompt key, flat answer set.
type DupCandidate<'a> = (&'a str, usize, &'a Item, String, BTreeSet<String>);

/// Check for live items in the same unit and type whose prompts match (after normalization) and whose answer sets intersect (likely one word entered twice)
pub(super) fn check_same_answer_diff_prompts(items: &[(&str, usize, &Item)], sink: &mut Sink, course_norm: Option<&Normalize>) {
    let superseded: BTreeSet<&str> = items.iter().filter_map(|(_, _, it)| it.supersedes_field()).flatten().map(String::as_str).collect();
    let mut by_group: BTreeMap<(String, &str), Vec<DupCandidate>> = BTreeMap::new();

    for (file, line, item) in items {
        if item.stimulus().is_some() || item.is_retired() || superseded.contains(item.id()) {
            continue;
        }
        let item_type = item.item_type();
        if !matches!(item_type, ItemType::Gap | ItemType::Cloze | ItemType::Numeric) {
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
        by_group.entry((item.unit().to_string(), item_type.as_str())).or_default().push((*file, *line, *item, key, answers));
    }

    for group in by_group.values() {
        for (i, a) in group.iter().enumerate() {
            for b in group.iter().skip(i + 1) {
                if a.3 != b.3 || a.4.is_disjoint(&b.4) {
                    continue;
                }
                sink.warning(
                    "dup_word",
                    a.0,
                    a.1,
                    format!("items '{}', '{}' have the same prompt and overlapping answers; the same word may be entered twice", a.2.id(), b.2.id()),
                );
            }
        }
    }
}
