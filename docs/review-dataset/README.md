# Initial expert review dataset

Dataset file: \`public/review-items.json\`

The Workbench loads this file automatically on the first visit in a browser profile. It is copied into that browser's local IndexedDB once. Existing local records with the same ID are not overwritten. The dataset includes no user names, personal details or audio recordings.

## What's included

| Group | Records | What the expert checks |
|---|---:|---|
| Core letters | 27 | Teaching name, pronunciation, examples, variants and writing/stroke order |
| Lonsum letters | 8 | Teaching name, pronunciation, use as a final consonant and examples |
| Dependent vowel signs | 8 | Name, sound, attachment/context, examples and combinations |
| Other signs | 3 | Name, function, placement and examples |
| Supplied video references | 7 | Classify the content, capture evidence and timestamps |
| BOSEM Class 1 chapters | 14 | Chapter-by-chapter material review, source coverage and exercises |
| Cross-cutting tasks | 2 | Valid syllables/combinations and pronunciation/audio review |
| **Total** | **69** | |

## Unicode identity source

The 46 character/sign records use the Unicode 18.0.0 Meetei Mayek Names List for the glyph, code point and official Unicode character name:

https://www.unicode.org/Public/18.0.0/charts/nameslist/abc0/

Unicode names are technical identifiers. They are **not** populated as Meitei teaching names, transliterations or pronunciations. The expert should leave those fields empty until a linguistic source or native-speaker/linguist check supports them. The Unicode chart's annotations are also not treated as a substitute for a BOSEM pronunciation guide.

The 46 records are:
- 27 core letters: U+ABC0–U+ABDA
- 8 lonsum letters: U+ABDB–U+ABE2
- 8 dependent vowel signs: U+ABE3–U+ABEA
- 3 other signs: U+ABEB–U+ABED

For combining signs, the Workbench record contains the character itself. A dotted-circle carrier may help display a mark in isolation, but the carrier is not part of the encoded character.

## Supplied teaching references

The following links were supplied for this review project. Chapter coverage is taken only from the titles/labels supplied with those links; this file does not claim that their full video contents have been transcribed or verified.

1. Basic Meitei Mayek — https://www.youtube.com/watch?v=jCErJHkOSyw
2. BOSEM Class 1, Chapters 1–4 — https://www.youtube.com/watch?v=U31pbGnLtsU
3. BOSEM Class 1, Chapters 5–6 — https://www.youtube.com/watch?v=KpKESO7ScaE
4. BOSEM Class 1, Chapters 7–8 — https://www.youtube.com/watch?v=ZgkkPtcITbU
5. BOSEM Class 1, Chapters 9–11 — https://www.youtube.com/watch?v=SQQ-aW92M5I
6. BOSEM Class 1, Chapters 13–14 — https://www.youtube.com/watch?v=LdafY7hqOx4
7. Supplied video with title/scope not yet identified — https://www.youtube.com/watch?v=PIBUvK2lQxY

**Chapter 12 is intentionally marked as a source gap.** No Chapter 12 video was included in the supplied list. Please provide the relevant textbook page or recording before reviewing that chapter's content.

The seventh video is retained as a source link, but the title and relevance must be identified by the expert or Academy owner.

## Linguistic review rules

1. Do not infer a Meitei teaching name or pronunciation from a Unicode name.
2. Record the exact source, page or video timestamp for each linguistic claim.
3. Preserve the script exactly as shown by the source. Do not silently normalize or rewrite it.
4. Distinguish a Unicode-valid sequence from a linguistically valid syllable or word.
5. Do not treat every possible letter-plus-vowel-sign pair as a valid word or teaching combination.
6. Capture uncertainty and variants in the relevant fields; use **Needs clarification** rather than guessing.
7. Record audio only after the expert has established what is being pronounced. Mark audio review separately from linguistic review.

## Local storage and updates

The dataset is seeded once per browser profile, using the local setting \`review-seed-v1\`. The expert's changes remain in that browser's IndexedDB. If the dataset is revised later, an existing browser profile will not silently replace its reviewed records; use a deliberately versioned seed/import update and preserve local expert changes.
