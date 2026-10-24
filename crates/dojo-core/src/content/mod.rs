mod course;
mod input_mode;
mod item;
mod item_kind;
mod media;
mod parse;
mod speech;

pub use course::{
    Bar, BreakdownConfig, Course, DetailConfig, DetailField, ExamConfig, Group, GroupNewOrder,
    PassBasis, PassMode, PassRule, PlacementConfig, Plugins, RubyConfig, ScoringPart, SrsConfig,
    SrsScope, Section, TagLabel, TagLabelDetail, TimingGroup, Unit,
};
pub use input_mode::InputMode;
pub use item::{
    CardItem, ChoiceItem, ClozeItem, ClozePart, GapItem, Item, MatchItem, MultiItem,
    NumericItem, OrderItem, Pair,
};
pub use item_kind::{ItemType, NewOrder, Status};
pub use media::{AudioConfig, AudioClip, AudioEncoding, AudioManifest, AudioPack, SrsMode, TimerConfig};
pub use parse::{
    parse_course, parse_intros, parse_items, parse_stimuli, ParsedIntros, ParsedItems,
    ParsedJsonl, ParsedStimuli, ParseError,
};
pub use speech::{Intro, Speak, SpeakLine, SpeechConfig, Stimulus, VoiceConfig};

#[cfg(test)]
mod all_tests {
    use super::item_kind::ItemType;

    #[test]
    fn all_is_canonical_order() {
        let names: Vec<&str> = ItemType::ALL.iter().map(|t| t.as_str()).collect();
        assert_eq!(names, ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"]);
    }
}
