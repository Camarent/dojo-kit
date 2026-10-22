use crate::check::Normalize;
use crate::exam::Section;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A line of speech to be synthesized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeakLine {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    pub text: String,
}

/// A typed speak stimulus with lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Speak {
    pub lines: Vec<SpeakLine>,
}

/// Voice configuration for speech synthesis.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "match")]
    pub match_: Option<String>,
    /// Voice-name preferences (JavaScript regex source, case-insensitive), most preferred first; a matching voice ranks above the rest of the language pool.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer: Option<Vec<String>>,
}

/// Speech configuration for the course.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeechConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voices: Option<BTreeMap<String, VoiceConfig>>,
}

/// A shared stimulus (passage, dialogue, etc.) referenced by items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stimulus {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hide_text: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<Speak>,
}

/// Intro card shown once per entity before its first question (`intros.jsonl`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Intro {
    /// Entity id (`item.entity`, default item id) the card introduces.
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Card body (course markup).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Free-form data for plugins (`DojoExt.registerIntro`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    /// Text read aloud with the card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
}

/// Question types available in v1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Choice,
    Gap,
    Card,
    Multi,
    Match,
    Order,
    Cloze,
    Numeric,
}

impl ItemType {
    /// True for types the learner rates themselves (only `card`); all others grade to a boolean.
    pub fn is_self_rated(self) -> bool {
        self == ItemType::Card
    }

    /// The lowercase wire name of the type.
    pub fn as_str(self) -> &'static str {
        match self {
            ItemType::Choice => "choice",
            ItemType::Gap => "gap",
            ItemType::Card => "card",
            ItemType::Multi => "multi",
            ItemType::Match => "match",
            ItemType::Order => "order",
            ItemType::Cloze => "cloze",
            ItemType::Numeric => "numeric",
        }
    }
}

impl std::hash::Hash for ItemType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::mem::discriminant(self).hash(state);
    }
}

/// Lifecycle state of an item; retired items stay in shipped data and are skipped by queues.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Retired,
}

/// Order for new items: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum NewOrder {
    File,
    Random,
}

/// A unit of a course.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Unit {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs: Option<SrsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<NewOrder>,
    /// Exam-only items. Exams take these first and fill up from shared units; training, daily, practice and placement prefer shared items and use these only when the queue would otherwise be empty.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "examOnly")]
    pub exam_only: Option<bool>,
    /// Declarative detail rendering config from item.meta for this unit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DetailConfig>,
}

/// Spaced-repetition settings; `ladder` holds intervals in milliseconds, indexed by stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SrsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ladder: Option<Vec<i64>>,
    /// Stages lost on a wrong answer (default 1; 0 keeps the stage).
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "dropOnWrong")]
    pub drop_on_wrong: Option<i64>,
    /// `"item"` (default) schedules every item alone; `"entity"` schedules all active items of an entity as one topic.
    /// Not allowed in `srsByType`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<SrsScope>,
    /// Items asked per entity slot when `scope` is `"entity"` (1..=5, default 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drill: Option<u32>,
}

/// Scheduling scope of a unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SrsScope {
    Item,
    Entity,
}

/// Course plugin configuration: build-time JS/CSS to be inlined into the output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Plugins {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scripts: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub styles: Vec<String>,
}

/// Placement test configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacementConfig {
    #[serde(default = "default_per_unit", skip_serializing_if = "is_default")]
    pub per_unit: u32,
    #[serde(default = "default_mode")]
    pub mode: String,
}

impl Default for PlacementConfig {
    fn default() -> Self {
        Self {
            per_unit: 5,
            mode: String::from("check"),
        }
    }
}

fn default_per_unit() -> u32 {
    5
}

fn is_default(v: &u32) -> bool {
    *v == 5
}

fn default_mode() -> String {
    String::from("check")
}

/// New order for groups: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum GroupNewOrder {
    File,
    Random,
}

/// A group of units for daily new item caps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub title: String,
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<GroupNewOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_tags: Vec<String>,
}

/// A progress bar configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bar {
    pub title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
}

/// One timing group that may span several sections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimingGroup {
    pub sections: Vec<String>,
    pub minutes: u32,
}

/// One scoring part: a set of sections contributing to a score bucket.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringPart {
    pub title: String,
    pub sections: Vec<String>,
    pub points: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_points: Option<u32>,
}

/// Pass mode: percent or points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PassMode {
    Percent,
    Points,
}

/// Pass basis: official or author.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PassBasis {
    Official,
    Author,
}

/// Pass rule for exam scoring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PassRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<PassMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basis: Option<PassBasis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scaled: Option<bool>,
}

/// Mock exam settings; `pass_mark` is the passing fraction of correct answers in 0..=1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExamConfig {
    /// Exam id. Required in exams[] (validator `bad_id` when missing); the legacy single exam (course.exam) is always id "default".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minutes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass_mark: Option<f64>,
    pub sections: Vec<Section>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timing: Option<Vec<TimingGroup>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scoring: Vec<ScoringPart>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass_points: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass: Option<PassRule>,
}

/// `course.ruby`: which kanji need no reading. The skip set = Han characters of `skip` plus the Han characters of the string at item path `skipKey` (default `meta.kanji`) of every item tagged `skipTag`. A `{base|reading}` whose Han characters are all in the set renders as bare `base`; other ruby keeps its reading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RubyConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dict_keys: Option<Vec<String>>,
}

/// Contents of `course.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Course {
    pub id: String,
    pub title: String,
    pub ui_language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_language: Option<String>,
    #[schemars(length(min = 1))]
    pub units: Vec<Unit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<ItemType>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs: Option<SrsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs_by_type: Option<BTreeMap<String, SrsConfig>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exam: Option<ExamConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub exams: Vec<ExamConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Plugins>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub markup: Option<String>,
    /// Script names (`non-latin`, `han`, `hiragana`, `katakana`, `cyrillic`, `greek`, `arabic`, `hebrew`, `hangul`, `devanagari`, `thai`): typed answers in these scripts are blocked while the input holds Latin letters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_script: Option<Vec<String>>,
    /// Small caption above the question: key = item tag or item type (first matching tag, then type), value = caption text. Absent = the built-in caption for the type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub captions: Option<BTreeMap<String, String>>,
    /// Ruby (`{base|reading}`) display options: readings over kanji in the skip set are not shown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ruby: Option<RubyConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speech: Option<SpeechConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<PlacementConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<NewOrder>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scripts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_override: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intro_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "dontKnow")]
    pub dont_know: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<Group>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bars: Vec<Bar>,
    /// Display labels for tags (e.g. `{"n5": "N5"}`); a tag without a label is shown uppercased.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_labels: Option<BTreeMap<String, TagLabel>>,
    /// Declarative detail rendering config from item.meta (per-course default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DetailConfig>,
    /// Kanji/Han breakdown config: dotted paths into item for key, meaning, and readings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<BreakdownConfig>,
}

/// Kanji/Han breakdown configuration for kanjiIndex/kanjiBreakdown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BreakdownConfig {
    /// Dot-separated path into item.meta for the kanji character (e.g., "meta.kanji").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Dot-separated path into item.meta for the meaning (e.g., "meta.ru").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meaning: Option<String>,
    /// Array of dot-separated paths into item.meta for readings (e.g., ["meta.on", "meta.kun"]).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub readings: Vec<String>,
}

/// A tag's display metadata: a plain label string, or an object with an optional label and `kind` (`public` or `internal`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum TagLabel {
    Text(String),
    Detail(TagLabelDetail),
}

/// Object form of a tag label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TagLabelDetail {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// `public` (default) or `internal` (hidden from the catalog tag chips).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// A single detail field configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetailField {
    /// Dot-separated path into item.meta (e.g., "meta.meaning" or "meta.readings.kanji").
    pub key: String,
    /// Display label for the field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// i18n key for the label (used when `label` is absent).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
    /// Field type: "text" (default), "list", "objects", "table", or "pairs".
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub r#type: Option<String>,
    /// Nested fields for objects type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<DetailField>>,
    /// Two entry keys (left, right) for the "pairs" type; defaults to `a` and `b`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keys: Option<Vec<String>>,
}

/// Detail configuration for declarative rendering from item.meta.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetailConfig {
    /// List of detail fields to render.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<DetailField>,
    /// Dotted path into item for the header glyph.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glyph: Option<String>,
}

/// Multiple-choice item; `answer` is the index into `options`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ChoiceItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub options: Vec<String>,
    pub answer: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Typed-answer item; any entry of `answers` is accepted after normalization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GapItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub answers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub retry: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Self-rated flash card; the front is `prompt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CardItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub back: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Multiple-answer item; `correct` lists the indices into `options` that must all be selected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MultiItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub options: Vec<String>,
    pub correct: Vec<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// One left/right pair of a `match` item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Pair {
    pub left: String,
    pub right: String,
}

/// Matching item; `distractors` are extra wrong right-hand choices.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MatchItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub pairs: Vec<Pair>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub distractors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Ordering item; `steps` are listed in the correct order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OrderItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub steps: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// A cloze part: literal text, or a blank listing its accepted alternatives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum ClozePart {
    Text(String),
    Blank(Vec<String>),
}

/// Fill-in-the-blanks item built from `parts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ClozeItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub parts: Vec<ClozePart>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Numeric-answer item; `tolerance` is absolute, `unit_label` (wire `unitLabel`) is display only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NumericItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    pub answer: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tolerance: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// One line of a content JSONL file, tagged by `"type"`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Choice(ChoiceItem),
    Gap(GapItem),
    Card(CardItem),
    Multi(MultiItem),
    Match(MatchItem),
    Order(OrderItem),
    Cloze(ClozeItem),
    Numeric(NumericItem),
}

impl Item {
    pub fn id(&self) -> &str {
        match self {
            Item::Choice(i) => &i.id,
            Item::Gap(i) => &i.id,
            Item::Card(i) => &i.id,
            Item::Multi(i) => &i.id,
            Item::Match(i) => &i.id,
            Item::Order(i) => &i.id,
            Item::Cloze(i) => &i.id,
            Item::Numeric(i) => &i.id,
        }
    }

    pub fn unit(&self) -> &str {
        match self {
            Item::Choice(i) => &i.unit,
            Item::Gap(i) => &i.unit,
            Item::Card(i) => &i.unit,
            Item::Multi(i) => &i.unit,
            Item::Match(i) => &i.unit,
            Item::Order(i) => &i.unit,
            Item::Cloze(i) => &i.unit,
            Item::Numeric(i) => &i.unit,
        }
    }

    pub fn item_type(&self) -> ItemType {
        match self {
            Item::Choice(_) => ItemType::Choice,
            Item::Gap(_) => ItemType::Gap,
            Item::Card(_) => ItemType::Card,
            Item::Multi(_) => ItemType::Multi,
            Item::Match(_) => ItemType::Match,
            Item::Order(_) => ItemType::Order,
            Item::Cloze(_) => ItemType::Cloze,
            Item::Numeric(_) => ItemType::Numeric,
        }
    }

    pub fn is_retired(&self) -> bool {
        let status = match self {
            Item::Choice(i) => i.status,
            Item::Gap(i) => i.status,
            Item::Card(i) => i.status,
            Item::Multi(i) => i.status,
            Item::Match(i) => i.status,
            Item::Order(i) => i.status,
            Item::Cloze(i) => i.status,
            Item::Numeric(i) => i.status,
        };
        status == Some(Status::Retired)
    }

    pub fn stimulus(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.stimulus.as_deref(),
            Item::Gap(i) => i.stimulus.as_deref(),
            Item::Card(i) => i.stimulus.as_deref(),
            Item::Multi(i) => i.stimulus.as_deref(),
            Item::Match(i) => i.stimulus.as_deref(),
            Item::Order(i) => i.stimulus.as_deref(),
            Item::Cloze(i) => i.stimulus.as_deref(),
            Item::Numeric(i) => i.stimulus.as_deref(),
        }
    }

    pub fn speak(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.speak.as_deref(),
            Item::Gap(i) => i.speak.as_deref(),
            Item::Card(i) => i.speak.as_deref(),
            Item::Multi(i) => i.speak.as_deref(),
            Item::Match(i) => i.speak.as_deref(),
            Item::Order(i) => i.speak.as_deref(),
            Item::Cloze(i) => i.speak.as_deref(),
            Item::Numeric(i) => i.speak.as_deref(),
        }
    }

    pub fn tags(&self) -> Option<&Vec<String>> {
        match self {
            Item::Choice(i) => Some(&i.tags),
            Item::Gap(i) => Some(&i.tags),
            Item::Card(i) => Some(&i.tags),
            Item::Multi(i) => Some(&i.tags),
            Item::Match(i) => Some(&i.tags),
            Item::Order(i) => Some(&i.tags),
            Item::Cloze(i) => Some(&i.tags),
            Item::Numeric(i) => Some(&i.tags),
        }
    }

    pub fn entity(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.entity.as_deref(),
            Item::Gap(i) => i.entity.as_deref(),
            Item::Card(i) => i.entity.as_deref(),
            Item::Multi(i) => i.entity.as_deref(),
            Item::Match(i) => i.entity.as_deref(),
            Item::Order(i) => i.entity.as_deref(),
            Item::Cloze(i) => i.entity.as_deref(),
            Item::Numeric(i) => i.entity.as_deref(),
        }
    }
}

/// A parse failure; `line` is 1-based for JSONL input and 0 otherwise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub message: String,
}

/// Result of parsing a JSONL file: every valid item with its 1-based line, and one error per bad line.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedItems {
    pub items: Vec<(usize, Item)>,
    pub errors: Vec<ParseError>,
}

/// Parses `course.json` text; structural checks only.
pub fn parse_course(text: &str) -> Result<Course, Vec<ParseError>> {
    serde_json::from_str(text).map_err(|e| vec![ParseError { line: 0, message: e.to_string() }])
}

/// Parses item text: one JSON object per line (preferred) or pretty-printed objects spanning several lines.
/// Items carry the 1-based line where their object starts; blank lines are skipped but still counted.
/// A non-object fragment yields one error for its physical line; an object never closed yields one error
/// at its start line, and scanning resumes at the next line that starts with `{`.
pub fn parse_items(text: &str) -> ParsedItems {
    let mut out = ParsedItems { items: Vec::new(), errors: Vec::new() };
    let bytes = text.as_bytes();
    let mut pos = 0;
    let mut line = 1;
    while pos < bytes.len() {
        match bytes[pos] {
            b'\n' => {
                line += 1;
                pos += 1;
            }
            b' ' | b'\t' | b'\r' => pos += 1,
            b'{' => match object_end(bytes, pos) {
                Some(end) => {
                    let chunk = &text[pos..=end];
                    match serde_json::from_str::<Item>(chunk) {
                        Ok(item) => out.items.push((line, item)),
                        Err(e) => out.errors.push(ParseError { line, message: e.to_string() }),
                    }
                    line += chunk.matches('\n').count();
                    pos = end + 1;
                }
                None => {
                    out.errors.push(ParseError { line, message: "unterminated JSON object".to_string() });
                    let mut next = next_line(text, pos);
                    let mut next_no = line + 1;
                    while let Some(start) = next {
                        if text[start..].lines().next().is_some_and(|l| l.trim_start().starts_with('{')) {
                            break;
                        }
                        next = next_line(text, start);
                        next_no += 1;
                    }
                    match next {
                        Some(start) => {
                            pos = start;
                            line = next_no;
                        }
                        None => break,
                    }
                }
            },
            _ => {
                out.errors.push(ParseError { line, message: "expected a JSON object".to_string() });
                match next_line(text, pos) {
                    Some(start) => {
                        pos = start;
                        line += 1;
                    }
                    None => break,
                }
            }
        }
    }
    out
}

fn next_line(text: &str, from: usize) -> Option<usize> {
    text.as_bytes()[from..].iter().position(|&b| b == b'\n').map(|i| from + i + 1).filter(|&i| i < text.len())
}

fn object_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if in_string {
            match (escaped, b) {
                (true, _) => escaped = false,
                (false, b'\\') => escaped = true,
                (false, b'"') => in_string = false,
                _ => {}
            }
        } else {
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
    }
    None
}

pub type ParsedStimuli = ParsedJsonl<Stimulus>;
/// Parsed `intros.jsonl`.
pub type ParsedIntros = ParsedJsonl<Intro>;

/// Parsed JSONL records with 1-based line numbers; `errors` holds the lines that failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedJsonl<T> {
    pub stimuli: Vec<(usize, T)>,
    pub errors: Vec<ParseError>,
}

/// Parses `stimuli.jsonl` text: one JSON object per line (same lenient parser as content items).
pub fn parse_stimuli(text: &str) -> ParsedStimuli {
    parse_jsonl(text)
}

/// Parses `intros.jsonl` text: one JSON object per line.
pub fn parse_intros(text: &str) -> ParsedIntros {
    parse_jsonl(text)
}

fn parse_jsonl<T: serde::de::DeserializeOwned>(text: &str) -> ParsedJsonl<T> {
    let mut out = ParsedJsonl { stimuli: Vec::new(), errors: Vec::new() };
    let bytes = text.as_bytes();
    let mut pos = 0;
    let mut line = 1;
    while pos < bytes.len() {
        match bytes[pos] {
            b'\n' => {
                line += 1;
                pos += 1;
            }
            b' ' | b'\t' | b'\r' => pos += 1,
            b'{' => match object_end(bytes, pos) {
                Some(end) => {
                    let chunk = &text[pos..=end];
                    match serde_json::from_str::<T>(chunk) {
                        Ok(stimulus) => out.stimuli.push((line, stimulus)),
                        Err(e) => out.errors.push(ParseError { line, message: e.to_string() }),
                    }
                    line += chunk.matches('\n').count();
                    pos = end + 1;
                }
                None => {
                    out.errors.push(ParseError { line, message: "unterminated JSON object".to_string() });
                    let mut next = next_line(text, pos);
                    let mut next_no = line + 1;
                    while let Some(start) = next {
                        if text[start..].lines().next().is_some_and(|l| l.trim_start().starts_with('{')) {
                            break;
                        }
                        next = next_line(text, start);
                        next_no += 1;
                    }
                    match next {
                        Some(start) => {
                            pos = start;
                            line = next_no;
                        }
                        None => break,
                    }
                }
            },
            _ => {
                out.errors.push(ParseError { line, message: "expected a JSON object".to_string() });
                match next_line(text, pos) {
                    Some(start) => {
                        pos = start;
                        line += 1;
                    }
                    None => break,
                }
            }
        }
    }
    out
}
