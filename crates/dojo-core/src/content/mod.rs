mod course;
mod item;
mod parse;
mod speech;

pub use course::{
    Bar, BreakdownConfig, Course, DetailConfig, DetailField, ExamConfig, Group, GroupNewOrder,
    PassBasis, PassMode, PassRule, PlacementConfig, Plugins, RubyConfig, ScoringPart, SrsConfig,
    SrsScope, Section, TagLabel, TagLabelDetail, TimingGroup, Unit,
};
pub use item::{
    CardItem, ChoiceItem, ClozeItem, ClozePart, GapItem, Item, ItemType, MatchItem, MultiItem,
    NewOrder, NumericItem, OrderItem, Pair, Status,
};
pub use parse::{
    parse_course, parse_intros, parse_items, parse_stimuli, ParsedIntros, ParsedItems,
    ParsedJsonl, ParsedStimuli, ParseError,
};
pub use speech::{Intro, Speak, SpeakLine, SpeechConfig, Stimulus, VoiceConfig};

#[cfg(test)]
mod all_tests {
    use super::item::ItemType;

    #[test]
    fn all_is_canonical_order() {
        let names: Vec<&str> = ItemType::ALL.iter().map(|t| t.as_str()).collect();
        assert_eq!(names, ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"]);
    }
}
