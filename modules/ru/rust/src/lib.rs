//! Russian validator module: prompt trigger words and disambiguation words.

use dojo_core::content::ItemType;
use dojo_core::validate::ValidatorModule;

/// The `ru` validator module.
pub struct Ru;

const PROMPT_TRIGGERS: &[(&str, &[ItemType])] = &[
    ("напишите", &[ItemType::Choice, ItemType::Order, ItemType::Match, ItemType::Card]),
    ("выберите", &[ItemType::Gap]),
];

const DISAMBIGUATION_WORDS: &[&str] = &["любой", "или"];

impl ValidatorModule for Ru {
    fn id(&self) -> &'static str {
        "ru"
    }

    fn prompt_triggers(&self) -> &'static [(&'static str, &'static [ItemType])] {
        PROMPT_TRIGGERS
    }

    fn disambiguation_words(&self) -> &'static [&'static str] {
        DISAMBIGUATION_WORDS
    }
}
