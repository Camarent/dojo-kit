/**
 * DojoExt plugin: Japanese readings
 * Renders {base|ruby} markup according to user setting:
 * - kana: <ruby>base<rt>ruby</rt></ruby>
 * - romaji: <ruby>base<rt>romaji</rt></ruby> (Hepburn conversion)
 * - none: base text only
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory;
  } else {
    factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DojoExt = root.DojoExt || (root.DojoExt = {});

  // Furigana markup regex: {base|ruby}
  var RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

  // Romaji conversion table (modified Hepburn)
  var ROMAJI_TABLE = {
    // Hiragana
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'wi', 'ゑ': 'we', 'を': 'wo',
    'ん': 'n',
    // Small tsu (doubles next consonant)
    'っ': '',
    // Katakana
    'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
    'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
    'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
    'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
    'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
    'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
    'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
    'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
    'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
    'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
    'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
    'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
    'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
    'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
    'ワ': 'wa', 'ヰ': 'wi', 'ヱ': 'we', 'ヲ': 'wo',
    'ン': 'n',
    // Small tsu in katakana
    'ッ': '',
    // Small kana for digraphs
    'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo',
    // Long vowel mark (katakana)
    'ー': '',
    // Digraphs (small ya/yu/yo after consonants) - these must come BEFORE the standalone small characters
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
    'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
    'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
    'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
    'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
    'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
    'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
    'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
    'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
    'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
    'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
    'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
    'ヂャ': 'ja', 'ヂュ': 'ju', 'ヂョ': 'jo',
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
    'ヴ': 'vu',
    // Foreign-sound digraphs (katakana with small vowels)
    'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo',
    'ティ': 'ti', 'トゥ': 'tu', 'ディ': 'di', 'ドゥ': 'du',
    'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo',
    'チェ': 'che', 'シェ': 'she', 'ジェ': 'je',
    'ヴァ': 'va', 'ヴィ': 'vi', 'ヴェ': 've', 'ヴォ': 'vo',
    'イェ': 'ye', 'ツァ': 'tsa', 'ツィ': 'tsi', 'ツェ': 'tse', 'ツォ': 'tso'
  };
  // Hiragana counterparts of the foreign-sound digraphs (ふぁ, てぃ, ...)
  (function () {
    var SMALL = 'ァィゥェォ';
    Object.keys(ROMAJI_TABLE).forEach(function (k) {
      if (k.length !== 2 || SMALL.indexOf(k[1]) < 0) return;
      ROMAJI_TABLE[String.fromCharCode(k.charCodeAt(0) - 0x60, k.charCodeAt(1) - 0x60)] = ROMAJI_TABLE[k];
    });
    ROMAJI_TABLE['ゔ'] = 'vu';
  })();

  /**
   * Convert kana to romaji using modified Hepburn.
   * Checks for 2-character digraphs first, then single characters.
   * Special handling: small っ/ッ doubles next consonant, ん/ン becomes n or n' before vowels/y.
   */
  function toRomaji(str) {
    if (typeof str !== 'string') return str;
    var result = '';
    var i = 0;
    
    while (i < str.length) {
      // Try to match 2 characters first (digraphs like しゃ, きゃ)
      var twoChars = str.slice(i, i + 2);
      var romajiTwo = ROMAJI_TABLE[twoChars];
      // Only use 2-char match if it's a non-empty string (not just a placeholder)
      if (romajiTwo !== undefined && romajiTwo !== '' && twoChars.length === 2) {
        result += romajiTwo;
        i += 2;
        continue;
      }
      
      var c = str[i];
      
      // Handle small tsu: doubles the next consonant
      if (c === 'っ' || c === 'ッ') {
        var nextChar = str[i + 1];
        if (nextChar) {
          // Try to get the next character's romaji (check 2-char first, then 1-char)
          var nextRomaji = ROMAJI_TABLE[str.slice(i + 1, i + 3)] || ROMAJI_TABLE[str[i + 1]];
          if (nextRomaji && nextRomaji.length > 0) {
            // Double the first consonant
            var firstConsonant = nextRomaji[0];
            // Special cases
            if (nextRomaji.indexOf('ch') === 0) {
              result += 't';
            } else if (nextRomaji === 'tsu') {
              result += 't';
            } else if (/^[bcdfghjklmnpqrstvwxyz]/.test(firstConsonant)) {
              result += firstConsonant;
            }
          }
        }
        i++;
        continue;
      }
      
      // Handle ん/ン: becomes n' before vowels and y
      if ((c === 'ん' || c === 'ン') && i + 1 < str.length) {
        var next = str[i + 1];
        // Check if next starts with a vowel sound
        if (/[あいうえおやゆよアイウエオヤユヨ]/.test(next)) {
          result += "n'";
          i++;
          continue;
        }
      }
      
      // Handle long vowel mark (ー) - repeats the previous vowel
      if (c === 'ー') {
        // Find the last vowel in the result
        var lastVowel = result.match(/[aiueo][^aiueo]*$/);
        if (lastVowel) {
          var vowels = lastVowel[0].match(/[aiueo]/g);
          if (vowels && vowels.length > 0) {
            result += vowels[vowels.length - 1];
          }
        }
        i++;
        continue;
      }
      
      var romaji = ROMAJI_TABLE[c];
      if (romaji !== undefined) {
        result += romaji;
      } else {
        result += c;
      }
      i++;
    }
    
    return result;
  }

  /**
   * Parses furigana markup into segments: [{ text } | { base, ruby }].
   */
  function parseFurigana(str) {
    var out = [], last = 0, m;
    RUBY_RE.lastIndex = 0;
    while ((m = RUBY_RE.exec(str))) {
      if (m.index > last) out.push({ text: str.slice(last, m.index) });
      out.push({ base: m[1], ruby: m[2] });
      last = RUBY_RE.lastIndex;
    }
    if (last < str.length) out.push({ text: str.slice(last) });
    return out;
  }

  /**
   * Escapes HTML special characters.
   */
  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Renders furigana markup based on the readings setting.
   */
  function renderFurigana(str, h) {
    if (typeof str !== 'string') return str;
    var setting = DojoExt.getSetting('readings');
    var segments = parseFurigana(str);
    
    // plain mode always returns base text, independent of setting
    if (!h) {
      return segments.map(function (seg) {
        if (seg.text != null) {
          return escHtml(seg.text);
        }
        // For none mode in string output, just return base
        if (setting === 'none') {
          return escHtml(seg.base);
        }
        // For kana/romaji in string output, return ruby HTML
        var rubyText = setting === 'romaji' ? toRomaji(seg.ruby) : seg.ruby;
        return '<ruby>' + escHtml(seg.base) + '<rt>' + escHtml(rubyText) + '</rt></ruby>';
      }).join('');
    }
    
    // vnode mode with h function
    return segments.map(function (seg) {
      if (seg.text != null) {
        return h('span', null, seg.text);
      }
      if (setting === 'none') {
        return h('span', null, seg.base);
      }
      var rubyText = setting === 'romaji' ? toRomaji(seg.ruby) : seg.ruby;
      return h('ruby', null,
        h('span', null, seg.base),
        h('rt', null, rubyText)
      );
    });
  }

  /**
   * Plain text: strip furigana markup to the written form.
   */
  function plainFurigana(str) {
    if (typeof str !== 'string') return str;
    return str.replace(RUBY_RE, '$1');
  }

  // Register the setting
  if (DojoExt.registerSetting) {
    DojoExt.registerSetting({
      key: 'readings',
      label: { en: 'Japanese readings', ru: 'Японские чтения' },
      options: [
        { value: 'kana', label: { en: 'Kana', ru: 'Кана' } },
        { value: 'romaji', label: { en: 'Romaji', ru: 'Ромадзи' } },
        { value: 'none', label: { en: 'None', ru: 'Нет' } }
      ],
      default: 'kana'
    });
  }

  // Register the markup
  if (DojoExt.registerMarkup) {
    DojoExt.registerMarkup('ja-readings', {
      render: renderFurigana,
      plain: plainFurigana
    });
  }
});
