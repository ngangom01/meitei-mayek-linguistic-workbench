# Focused expert review dataset

Dataset file: \`public/review-items.json\`

The Workbench loads this file automatically on the first visit in a browser profile. It is copied into that browser's local IndexedDB once. Existing local review records are preserved; the app removes the retired video/BOSEM chapter records from earlier starter versions.

## What's included

| Group | Records | What the expert checks |
|---|---:|---|
| Core letters | 27 | Teaching name, pronunciation, examples, variants and writing/stroke order |
| Lonsum / consonants | 8 | Teaching name, pronunciation, consonant/final use and examples |
| Cheitap / vowels | 8 | Teaching name, sound, attachment/context, examples and combinations |
| Other signs | 3 | Name, function, placement and examples |
| Combination task | 1 | Linguistically valid syllables and character combinations |
| Pronunciation task | 1 | Pronunciation decisions and audio samples |
| **Total** | **48** | |

## Character identity source

The 46 character/sign records use the Unicode 18.0.0 Meetei Mayek Names List for the glyph, code point and official Unicode character name:

https://www.unicode.org/Public/18.0.0/charts/nameslist/abc0/

Unicode names are technical identifiers. They are **not** Meitei teaching names, transliterations or pronunciations. The expert must verify those linguistic fields from appropriate linguistic evidence. The Unicode chart is an identity reference, not a pronunciation guide.

The 46 records are:
- 27 core letters: U+ABC0–U+ABDA
- 8 lonsum/consonants: U+ABDB–U+ABE2
- 8 Cheitap/vowel signs: U+ABE3–U+ABEA
- 3 other signs: U+ABEB–U+ABED

For combining signs, the Workbench record contains the character itself. A dotted-circle carrier may help display a mark in isolation, but the carrier is not part of the encoded character.

## Linguistic review rules

1. Do not infer a Meitei teaching name or pronunciation from a Unicode name.
2. Record the exact source and page/section for each linguistic claim.
3. Preserve the script exactly as shown by the source. Do not silently normalize or rewrite it.
4. Distinguish a Unicode-valid sequence from a linguistically valid syllable or word.
5. Do not treat every possible letter-plus-vowel-sign pair as a valid word or teaching combination.
6. Capture uncertainty and variants in the relevant fields; use **Needs clarification** rather than guessing.
7. Record audio only after establishing what is being pronounced. Mark audio review separately from linguistic review.

## Local storage and updates

The current dataset is version 2 and contains 48 items. The app seeds it under the local setting \`review-seed-v2\`. On startup it removes the old video-reference and BOSEM chapter records from the earlier 69-item queue, including any attached audio for those retired records. Other local work is preserved.

The Workbench remains local-first: expert data is stored in the browser on that device. The expert should export a backup regularly and prepare a review ZIP when returning work.
