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

/// Items grouped by (unit, type, normalized answer sets); each entry is (file, line, item, prompt).
type AnswerGroups<'a> = BTreeMap<(String, &'a str, Vec<Vec<String>>), Vec<(&'a str, usize, &'a Item, String)>>;

/// Check for items in the same unit and type with the same normalized answers but different prompts (likely one word entered twice)
pub(super) fn check_same_answer_diff_prompts(items: &[(&str, usize, &Item)], sink: &mut Sink, course_norm: Option<&Normalize>) {
    // Group by (unit, type, normalized answer sets); only gap, cloze, and numeric, and only non-stimulus items
    let mut by_answers: AnswerGroups = BTreeMap::new();

    for (file, line, item) in items {
        if item.stimulus().is_some() {
            continue;
        }
        let item_type = item.item_type();
        if !matches!(item_type, ItemType::Gap | ItemType::Cloze | ItemType::Numeric) {
            continue;
        }
        let answers = normalize_answer_set(item, course_norm);
        if answers.iter().all(Vec::is_empty) {
            continue;
        }
        let norm_prompt = normalize(item.prompt(), &effective_norm(item, course_norm));
        if norm_prompt.is_empty() {
            continue;
        }
        by_answers.entry((item.unit().to_string(), item_type.as_str(), answers)).or_default().push((*file, *line, *item, norm_prompt));
    }

    for group in by_answers.values() {
        let distinct: BTreeSet<&str> = group.iter().map(|(_, _, _, p)| p.as_str()).collect();
        if distinct.len() < 2 {
            continue;
        }
        let Some(&(file, line, _, _)) = group.first() else { continue };
        let ids: Vec<String> = group.iter().map(|(_, _, it, _)| format!("'{}'", it.id())).collect();
        sink.warning(
            "dup_word",
            file,
            line,
            format!("items {} have the same answers but different prompts; the same word may be entered twice", ids.join(", ")),
        );
    }
}
