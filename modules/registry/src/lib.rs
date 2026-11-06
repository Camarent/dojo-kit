//! Registry of built-in module crates. Maps a module id to its implementation.

use dojo_core::validate::ValidatorModule;

const IDS: &[&str] = &["ja", "ru"];

/// Ids of the validator modules this registry can build.
pub fn ids() -> &'static [&'static str] {
    IDS
}

/// The validator module for `id`, or `None` when no crate provides it.
pub fn validator(id: &str) -> Option<Box<dyn ValidatorModule>> {
    match id {
        "ja" => Some(Box::new(dojo_module_ja::Ja)),
        "ru" => Some(Box::new(dojo_module_ru::Ru)),
        _ => None,
    }
}
