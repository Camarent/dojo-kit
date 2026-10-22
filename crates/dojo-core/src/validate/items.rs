use super::{MAX_PROMPT_CHARS, MIN_LEAK_CHARS, Sink, validate_fold};
use crate::check::{Normalize, normalize};
use crate::content::{ClozePart, Item, ItemType};
use std::collections::{BTreeMap, HashSet};

fn contains_leak(norm_prompt: &str, norm_answer: &str) -> bool {
    norm_answer.chars().count() >= MIN_LEAK_CHARS && norm_prompt.contains(norm_answer)
}

pub(super) fn item_body(item: &Item) -> String {
    let norm = Normalize::default();
    let join = |parts: Vec<&str>| parts.into_iter().map(|p| normalize(p, &norm)).collect::<Vec<_>>().join("\u{1f}");
    match item {
        Item::Choice(_) | Item::Gap(_) | Item::Card(_) => String::new(),
        Item::Multi(m) => join(m.options.iter().map(String::as_str).collect()),
        Item::Match(m) => join(m.pairs.iter().flat_map(|p| [p.left.as_str(), p.right.as_str()]).chain(m.distractors.iter().map(String::as_str)).collect()),
        Item::Order(o) => join(o.steps.iter().map(String::as_str).collect()),
        Item::Cloze(c) => join(
            c.parts
                .iter()
                .flat_map(|p| match p {
                    ClozePart::Text(t) => vec![t.as_str()],
                    ClozePart::Blank(alts) => std::iter::once("\u{1e}").chain(alts.iter().map(String::as_str)).collect(),
                })
                .collect(),
        ),
        Item::Numeric(n) => n.answer.to_string(),
    }
}

pub(super) fn check_item_body(item: &Item, file: &str, line: usize, sink: &mut Sink) {
    let id = item.id();
    if item.prompt().trim().is_empty() {
        sink.error("empty_prompt", file, line, format!("item '{id}' has an empty prompt"));
    }
    match item {
        Item::Choice(c) => check_choice(c, id, file, line, sink),
        Item::Gap(g) => check_gap(g, id, file, line, sink),
        Item::Card(c) => check_card(c, id, file, line, sink),
        Item::Multi(m) => check_multi(m, id, file, line, sink),
        Item::Match(m) => check_match(m, id, file, line, sink),
        Item::Order(o) => check_order(o, id, file, line, sink),
        Item::Cloze(c) => check_cloze(c, id, file, line, sink),
        Item::Numeric(n) => check_numeric(n, id, file, line, sink),
    }
    if item.prompt().chars().count() > MAX_PROMPT_CHARS {
        sink.warning("prompt_too_long", file, line, format!("item '{id}' prompt is longer than {MAX_PROMPT_CHARS} characters"));
    }
}

fn check_choice(c: &crate::content::ChoiceItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    let default = Normalize::default();
    if c.options.len() < 2 {
        sink.error("choice_few_options", file, line, format!("item '{id}' has fewer than 2 options"));
    }
    if c.answer >= c.options.len() {
        sink.error(
            "choice_answer_out_of_range",
            file,
            line,
            format!("item '{id}' answer {} is outside {} options", c.answer, c.options.len()),
        );
    }
    let mut seen = HashSet::new();
    let mut reported = false;
    for o in &c.options {
        if !seen.insert(normalize(o, &default)) && !reported {
            reported = true;
            sink.error("choice_duplicate_options", file, line, format!("item '{id}' has duplicate options ('{o}')"));
        }
    }
}

fn check_gap(g: &crate::content::GapItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if let Some(ref norm) = g.normalize {
        validate_fold(&norm.fold, file, line, sink);
    }
    let opts = g.normalize.clone().unwrap_or_default();
    if g.answers.is_empty() {
        sink.error("gap_no_answers", file, line, format!("item '{id}' has no answers"));
    }
    if g.answers.iter().any(|a| normalize(a, &opts).is_empty()) {
        sink.error("gap_empty_answer", file, line, format!("item '{id}' has an empty answer"));
    }
    // Validate retry field
    if !g.retry.is_empty() {
        // Check if any retry reading equals an answer (after normalization)
        for r in &g.retry {
            let norm_r = normalize(r, &opts);
            if norm_r.is_empty() {
                sink.error("gap_empty_answer", file, line, format!("item '{id}' has an empty retry reading"));
            }
            for a in &g.answers {
                if normalize(a, &opts) == norm_r {
                    sink.error("bad_retry", file, line, format!("item '{id}' retry reading '{}' equals an answer", r));
                }
            }
        }
    }
}

fn check_card(c: &crate::content::CardItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if c.back.trim().is_empty() {
        sink.error("card_empty_back", file, line, format!("item '{id}' has an empty back"));
    }
}

fn check_multi(m: &crate::content::MultiItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    let default = Normalize::default();
    if m.options.len() < 3 {
        sink.error("multi_few_options", file, line, format!("item '{id}' has fewer than 3 options"));
    }
    let mut seen_options = HashSet::new();
    if let Some(o) = m.options.iter().find(|o| !seen_options.insert(normalize(o, &default))) {
        sink.error("multi_duplicate_options", file, line, format!("item '{id}' has duplicate options ('{o}')"));
    }
    if m.correct.is_empty() {
        sink.error("multi_bad_correct", file, line, format!("item '{id}' has no correct answers"));
    } else {
        let mut seen = HashSet::new();
        let mut has_dup = false;
        let mut has_oob = false;
        for &c in &m.correct {
            if c >= m.options.len() {
                has_oob = true;
            }
            if !seen.insert(c) {
                has_dup = true;
            }
        }
        if has_dup {
            sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list has duplicates"));
        }
        if has_oob {
            sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list has out-of-range indices"));
        }
        if m.correct.len() >= m.options.len() {
            sink.error("multi_bad_correct", file, line, format!("item '{id}' correct list must be fewer than options"));
        }
    }
}

fn check_match(m: &crate::content::MatchItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if m.pairs.len() < 2 || m.pairs.len() > 8 {
        sink.error("match_pair_count", file, line, format!("item '{id}' has {} pairs, expected 2..=8", m.pairs.len()));
    } else if m.pairs.len() > 6 {
        sink.warning("match_many_pairs", file, line, format!("item '{id}' has {} pairs (> 6)", m.pairs.len()));
    }
    let norm = Normalize::default();
    let mut seen_left = HashSet::new();
    let mut seen_right = HashSet::new();
    let mut dup_left = false;
    let mut dup_right = false;
    for p in &m.pairs {
        if !seen_left.insert(normalize(&p.left, &norm)) {
            dup_left = true;
        }
        if !seen_right.insert(normalize(&p.right, &norm)) {
            dup_right = true;
        }
    }
    for d in &m.distractors {
        if !seen_right.insert(normalize(d, &norm)) {
            dup_right = true;
        }
    }
    if dup_left {
        sink.error("match_duplicate_left", file, line, format!("item '{id}' has duplicate lefts"));
    }
    if dup_right {
        sink.error("match_duplicate_right", file, line, format!("item '{id}' has duplicate rights or distractors"));
    }
}

fn check_order(o: &crate::content::OrderItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if o.steps.len() < 2 || o.steps.len() > 10 {
        sink.error("order_step_count", file, line, format!("item '{id}' has {} steps, expected 2..=10", o.steps.len()));
    } else if o.steps.len() > 7 {
        sink.warning("order_many_steps", file, line, format!("item '{id}' has {} steps (> 7)", o.steps.len()));
    }
    let norm = Normalize::default();
    let mut seen = HashSet::new();
    let mut has_dup = false;
    for s in &o.steps {
        if !seen.insert(normalize(s, &norm)) {
            has_dup = true;
        }
    }
    if has_dup {
        sink.error("order_duplicate_step", file, line, format!("item '{id}' has duplicate steps"));
    }
}

fn check_cloze(c: &crate::content::ClozeItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if let Some(ref norm) = c.normalize {
        validate_fold(&norm.fold, file, line, sink);
    }
    let norm = c.normalize.clone().unwrap_or_default();
    let blank_count = c.parts.iter().filter(|p| matches!(p, ClozePart::Blank(_))).count();
    if blank_count == 0 {
        sink.error("cloze_no_blank", file, line, format!("item '{id}' has no blanks"));
    } else if blank_count > 10 {
        sink.error("cloze_too_many_blanks", file, line, format!("item '{id}' has {} blanks, expected <= 10", blank_count));
    } else if blank_count > 5 {
        sink.warning("cloze_many_blanks", file, line, format!("item '{id}' has {} blanks (> 5)", blank_count));
    }
    let mut has_empty_alt = false;
    let mut has_content = false;
    for p in &c.parts {
        match p {
            ClozePart::Text(t) => {
                if !normalize(t, &norm).is_empty() {
                    has_content = true;
                }
            }
            ClozePart::Blank(alts) => {
                if alts.is_empty() {
                    has_empty_alt = true;
                }
                for a in alts {
                    if normalize(a, &norm).is_empty() {
                        has_empty_alt = true;
                    } else {
                        has_content = true;
                    }
                }
            }
        }
    }
    if has_empty_alt {
        sink.error("cloze_empty_alternative", file, line, format!("item '{id}' has an empty alternative"));
    }
    if !has_content {
        sink.error("cloze_empty_parts", file, line, format!("item '{id}' has no non-empty parts"));
    }
}

fn check_numeric(n: &crate::content::NumericItem, id: &str, file: &str, line: usize, sink: &mut Sink) {
    if !n.answer.is_finite() {
        sink.error("numeric_bad_answer", file, line, format!("item '{id}' answer is not finite"));
    }
    if let Some(tol) = n.tolerance {
        if !tol.is_finite() || tol < 0.0 {
            sink.error("numeric_bad_tolerance", file, line, format!("item '{id}' tolerance is negative or not finite"));
        }
    }
}

pub(super) fn fold_norm<'a>(item_norm: Option<&'a Normalize>, course_norm: Option<&'a Normalize>) -> Option<&'a Normalize> {
    item_norm.filter(|n| !n.fold.is_empty()).or(course_norm.filter(|n| !n.fold.is_empty()))
}

pub(super) fn check_leak(item: &Item, file: &str, line: usize, sink: &mut Sink, course_norm: Option<&Normalize>, stimulus_hide_text: &HashSet<String>) {
    // Skip leak check if the item has a stimulus with hideText: true
    if let Some(stim_id) = item.stimulus() {
        if stimulus_hide_text.contains(stim_id) {
            return;
        }
    }
    let leaked = match item {
        Item::Gap(g) => {
            let opts = fold_norm(g.normalize.as_ref(), course_norm).cloned().or_else(|| g.normalize.clone()).unwrap_or_default();
            let prompt = normalize(&g.prompt, &opts);
            g.answers.iter().find(|a| contains_leak(&prompt, &normalize(a, &opts))).cloned()
        }
        Item::Choice(c) => {
            let opts = fold_norm(None, course_norm).cloned().unwrap_or_default();
            let prompt = normalize(&c.prompt, &opts);
            c.options.get(c.answer).filter(|a| contains_leak(&prompt, &normalize(a, &opts))).cloned()
        }
        Item::Card(_) | Item::Multi(_) | Item::Match(_) | Item::Order(_) | Item::Cloze(_) | Item::Numeric(_) => None,
    };
    if let Some(answer) = leaked {
        sink.warning("answer_in_prompt", file, line, format!("item '{}' prompt contains its answer '{answer}'", item.id()));
    }
}


fn sorted_tags(item: &Item) -> Vec<String> {
    let mut t = item.tags().to_vec();
    t.sort();
    t
}

// Contract: the only caller passes groups with at least 2 items; `message.len() >= 2` when it ends with ", ".
#[allow(clippy::indexing_slicing)]
fn stimulus_split_message(stim_id: &str, stim_items: &[&Item]) -> Option<String> {
    let first_item = stim_items[0];
    let first_unit = first_item.unit();
    let first_type = first_item.item_type();
    let first_tags = sorted_tags(first_item);

    let mut has_card = first_type == ItemType::Card;
    let mut has_unit_diff = false;
    let mut has_type_diff = false;
    let mut has_tags_diff = false;

    for item in stim_items.iter().skip(1) {
        let itype = item.item_type();
        if itype == ItemType::Card {
            has_card = true;
        }
        if item.unit() != first_unit {
            has_unit_diff = true;
        }
        if itype != first_type {
            has_type_diff = true;
        }
        if sorted_tags(item) != first_tags {
            has_tags_diff = true;
        }
    }

    if !(has_card || has_unit_diff || has_type_diff || has_tags_diff) {
        return None;
    }
    let mut message = format!("stimulus '{stim_id}' items have inconsistent properties: ");
    if has_card {
        message.push_str("includes card type, ");
    }
    if has_unit_diff {
        message.push_str("units differ, ");
    }
    if has_type_diff {
        message.push_str("types differ, ");
    }
    if has_tags_diff {
        message.push_str("tags differ, ");
    }
    if message.ends_with(", ") {
        message = message[..message.len() - 2].to_string();
    }
    Some(message)
}

/// Checks that items sharing a stimulus have consistent properties.
pub(super) fn check_stimulus_groups(items: &[(&str, usize, &Item)], sink: &mut Sink) {
    let mut by_stimulus: BTreeMap<&str, Vec<&Item>> = BTreeMap::new();
    for (_, _, item) in items {
        if let Some(stim_id) = item.stimulus() {
            by_stimulus.entry(stim_id).or_default().push(item);
        }
    }

    for (stim_id, stim_items) in &by_stimulus {
        if stim_items.len() < 2 {
            continue;
        }
        if let Some(message) = stimulus_split_message(stim_id, stim_items) {
            if let Some((file, line, _)) = items.iter().find(|(_, _, item)| item.stimulus() == Some(*stim_id)) {
                sink.warning("stimulus_group_split", file, *line, message);
            }
        }
    }
}
