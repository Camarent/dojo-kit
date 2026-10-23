use super::Sink;
use crate::check::{Normalize, normalize};
use crate::content::{ClozePart, Item, ItemType};
use std::collections::BTreeMap;

/// Normalize answer sets for comparison
fn normalize_answer_set(item: &Item, course_norm: Option<&Normalize>) -> Vec<Vec<String>> {
    let norm_opts = item_normalize_opts(item).or(course_norm).cloned().unwrap_or_default();
    
    match item {
        Item::Gap(g) => {
            let mut v: Vec<String> = g.answers.iter().map(|a| normalize(a, &norm_opts)).collect();
            v.sort();
            v.dedup();
            vec![v]
        }
        Item::Cloze(c) => {
            let norm_opts = c.normalize.as_ref().or(course_norm).cloned().unwrap_or_default();
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

/// Get normalization options from item if available
fn item_normalize_opts(item: &Item) -> Option<&Normalize> {
    match item {
        Item::Gap(g) => g.normalize.as_ref().filter(|n| !n.fold.is_empty()),
        Item::Cloze(c) => c.normalize.as_ref().filter(|n| !n.fold.is_empty()),
        _ => None,
    }
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
        let norm_opts = item_normalize_opts(item).or(course_norm).cloned().unwrap_or_default();
        let norm_prompt = normalize(item.prompt(), &norm_opts);
        
        // Skip empty prompts
        if norm_prompt.is_empty() {
            continue;
        }
        
        by_prompt.entry(norm_prompt).or_default().push((*file, *line, *item));
    }
    
    // For each prompt with multiple items, check if they have different answer sets
    for (_prompt, prompt_items) in &by_prompt {
        if prompt_items.len() < 2 {
            continue;
        }
        
        // Group items by their normalized answer sets
        let mut by_answers: BTreeMap<Vec<Vec<String>>, Vec<(&str, usize, &Item)>> = BTreeMap::new();
        
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
