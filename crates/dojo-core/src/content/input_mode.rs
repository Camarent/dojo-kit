use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Soft-keyboard hint for a gap input; display only, never graded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum InputMode {
    Numeric,
    Decimal,
    Text,
}
