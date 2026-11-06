//! Russian validator module. Stub: no rules yet, only the id.

use dojo_core::validate::ValidatorModule;

/// The `ru` validator module.
pub struct Ru;

impl ValidatorModule for Ru {
    fn id(&self) -> &'static str {
        "ru"
    }
}
