//! Japanese validator module. Stub: no rules yet, only the id.

use dojo_core::validate::ValidatorModule;

/// The `ja` validator module.
pub struct Ja;

impl ValidatorModule for Ja {
    fn id(&self) -> &'static str {
        "ja"
    }
}
