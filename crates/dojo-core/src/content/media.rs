use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Scheduler mode of a course or unit `srs` block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SrsMode {
    Ladder,
    ErrorWeighted,
}

/// Course-level audio configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioConfig {
    /// Path to the audio manifest file relative to the course directory.
    pub manifest: String,
    /// Optional base URL or relative prefix for audio files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
}

/// Timer configuration for adaptive time limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimerConfig {
    /// Base time limit in milliseconds (2000..30000, default 8000).
    #[serde(default = "default_base_ms")]
    pub base_ms: u32,
    /// Whether to use adaptive timing (default true).
    #[serde(default = "default_adaptive")]
    pub adaptive: bool,
    /// Number of replays allowed (0..3, default 1).
    #[serde(default = "default_replays")]
    pub replays: u32,
}

impl Default for TimerConfig {
    fn default() -> Self {
        Self {
            base_ms: default_base_ms(),
            adaptive: default_adaptive(),
            replays: default_replays(),
        }
    }
}

fn default_base_ms() -> u32 {
    8000
}

fn default_adaptive() -> bool {
    true
}

fn default_replays() -> u32 {
    1
}

/// Encoding type for audio pack files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum AudioEncoding {
    Raw,
    Base64,
}

/// A pack entry in the audio manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AudioPack {
    /// Filename of the pack.
    pub file: String,
    /// Size of the pack file in bytes.
    pub bytes: u64,
    /// Optional SHA-256 hash (informative only, not validated by dojo-kit).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// Encoding of the pack file.
    #[serde(default = "default_encoding")]
    pub enc: AudioEncoding,
}

impl Default for AudioPack {
    fn default() -> Self {
        Self {
            file: String::new(),
            bytes: 0,
            sha256: None,
            enc: default_encoding(),
        }
    }
}

fn default_encoding() -> AudioEncoding {
    AudioEncoding::Raw
}

/// A clip entry in the audio manifest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    /// Index into the packs array.
    pub pack: usize,
    /// Byte offset within the decoded pack bytes.
    pub off: u64,
    /// Byte length of the clip in the decoded pack.
    pub len: u64,
    /// Duration in milliseconds.
    pub ms: u64,
    /// MIME type of the audio.
    pub mime: String,
    /// Optional credit/attribution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit: Option<String>,
    /// What is said in the clip, in the course's target language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Translations of `text` keyed by UI language code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tr: Option<BTreeMap<String, String>>,
    /// True when every entry of `tr` is machine-made.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub mt: bool,
}

/// The audio manifest structure.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AudioManifest {
    /// Manifest version (currently only 1).
    pub v: u32,
    /// List of audio pack files.
    pub packs: Vec<AudioPack>,
    /// Map of clip IDs to clip metadata.
    pub clips: BTreeMap<String, AudioClip>,
}
