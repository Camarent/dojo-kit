//! Japanese word tables for `order_split_word`.

/// Verb/adjective endings and sentence-final particles that are never a chunk on their own.
/// A separate です/でした/でしょう/だ after a noun is an accepted split and is not listed.
pub(super) const ENDINGS: &[&str] = &[
    "ます", "ません", "ませ", "ん", "まし", "ました", "ましょう", "ませんか", "た", "ない", "なかった", "たい", "て", "か", "よ", "ね",
];

/// Case particles that must stay attached to their noun.
pub(super) const PARTICLES: &[&str] = &["も", "を", "は", "が", "に", "へ", "と"];

pub(super) fn is_fragment(text: &str) -> bool {
    ENDINGS.contains(&text) || PARTICLES.contains(&text)
}
