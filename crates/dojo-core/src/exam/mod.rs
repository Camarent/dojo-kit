
use crate::content::{PassMode, PassRule};
pub use crate::content::Section;
pub use crate::rng::splitmix64;

/// Default pass mark (60%).
pub const DEFAULT_PASS_MARK: f64 = 0.6;

/// Resolves the pass mode from the pass rule and whether scoring parts are present.
pub fn resolve_mode(pass: Option<&PassRule>, has_scoring: bool) -> PassMode {
    pass.and_then(|p| p.mode).unwrap_or(if has_scoring { PassMode::Points } else { PassMode::Percent })
}

mod sample;
mod score;

pub use sample::{sample, Candidate, Sample, SectionRange, Shortage};
pub use score::{compute_parts, score, score_with_parts, PartResult, PartsInput, Score};
