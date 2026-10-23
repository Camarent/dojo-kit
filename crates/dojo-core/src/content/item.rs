use crate::check::Normalize;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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
    /// All item types in canonical stats order.
    pub const ALL: [ItemType; 8] = [
        ItemType::Choice,
        ItemType::Gap,
        ItemType::Card,
        ItemType::Multi,
        ItemType::Match,
        ItemType::Order,
        ItemType::Cloze,
        ItemType::Numeric,
    ];

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
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

macro_rules! common_field {
    ($self:expr, $i:ident => $e:expr) => {
        match $self {
            Item::Choice($i) => $e,
            Item::Gap($i) => $e,
            Item::Card($i) => $e,
            Item::Multi($i) => $e,
            Item::Match($i) => $e,
            Item::Order($i) => $e,
            Item::Cloze($i) => $e,
            Item::Numeric($i) => $e,
        }
    };
}

impl Item {
    pub fn id(&self) -> &str { common_field!(self, i => &i.id) }

    pub fn unit(&self) -> &str { common_field!(self, i => &i.unit) }

    pub fn prompt(&self) -> &str { common_field!(self, i => &i.prompt) }

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

    /// The `supersedes` field as written; `None` when absent.
    pub fn supersedes_field(&self) -> Option<&[String]> { common_field!(self, i => i.supersedes.as_deref()) }

    pub fn is_retired(&self) -> bool { common_field!(self, i => i.status) == Some(Status::Retired) }

    pub fn stimulus(&self) -> Option<&str> { common_field!(self, i => i.stimulus.as_deref()) }

    pub fn speak(&self) -> Option<&str> { common_field!(self, i => i.speak.as_deref()) }

    pub fn tags(&self) -> &[String] { common_field!(self, i => &i.tags) }

    pub fn entity(&self) -> Option<&str> { common_field!(self, i => i.entity.as_deref()) }
}
