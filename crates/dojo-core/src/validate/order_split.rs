//! `order_split_word`: an order step in a Japanese course must be a chunk, not a bare ending or case particle.

use super::Sink;
use crate::content::{Course, Item};

/// Verb/adjective endings and sentence-final particles that are never a chunk on their own.
/// A separate です/でした/でしょう/だ after a noun is an accepted split and is not listed.
const ENDINGS: &[&str] = &[
    "ます", "ません", "ませ", "ん", "まし", "ました", "ましょう", "ませんか", "た", "ない", "なかった", "たい", "て", "か", "よ", "ね",
];

/// Case particles that must stay attached to their noun.
const PARTICLES: &[&str] = &["も", "を", "は", "が", "に", "へ", "と"];

fn is_fragment(text: &str) -> bool {
    ENDINGS.contains(&text) || PARTICLES.contains(&text)
}

/// Warn for every order step (index >= 1) that is a bare ending or case particle. Only for `contentLanguage` `ja`.
pub(super) fn check_order_split(item: &Item, course: Option<&Course>, sink: &mut Sink, file: &str, line: usize) {
    let Item::Order(o) = item else { return };
    if course.and_then(|c| c.content_language.as_deref()) != Some("ja") {
        return;
    }
    for (k, step) in o.steps.iter().enumerate().skip(1) {
        if is_fragment(step.trim()) {
            sink.warning(
                "order_split_word",
                file,
                line,
                format!("item '{}' step {} '{}' is a word fragment; join it with its word", o.id, k + 1, step),
            );
        }
    }
}
