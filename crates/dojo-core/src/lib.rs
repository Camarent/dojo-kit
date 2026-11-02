#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used, clippy::panic))]
#![cfg_attr(not(test), warn(clippy::indexing_slicing))]
pub mod api;
pub mod check;
pub mod content;
pub mod days;
pub mod diagnostic;
pub mod exam;
pub mod groups;
pub mod lock;
pub mod progress;
pub mod rng;
pub mod schema;
pub mod slug;
pub mod srs;
pub mod stats;
pub mod validate;
pub mod migrate;
pub mod supersedes;
