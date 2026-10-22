# ja-readings plugin

A DojoExt plugin that renders Japanese furigana markup `{漢字|よみ}` with configurable display modes.

## Setup

Plugin paths in `course.json` must stay inside the course folder (no `..`, no absolute paths; CONTRACT.md section 4). Copy `ja-readings.js` and `ja-readings.css` into your course folder, then in `course.json`:
```json
{
  "plugins": {
    "scripts": ["ja-readings.js"],
    "styles": ["ja-readings.css"]
  },
  "markup": "ja-readings"
}
```
Without `"markup": "ja-readings"` the plugin does nothing.

## Settings

- **kana** (default): Shows reading in hiragana/katakana
- **romaji**: Shows reading transliterated to modified Hepburn romaji
- **none**: Shows base text only, no ruby annotations

The setting appears in Settings > "Plugin settings" and changes take effect immediately without reload.

## Romaji limitations

- A trailing small tsu (`あっ`, `ッ`) is dropped (no following consonant to double).
- `ー` repeats the previous vowel; after `ん` or a bare consonant it adds nothing.
- Iteration marks (`々`, `ゝ`, `ヽ`) and other unknown characters pass through unchanged.
- Particles are not special-cased (`は` stays `ha`).
