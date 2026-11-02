# Checks, formats, and limits

## Matching and result semantics

Two cues correspond only when their integer start/end millisecond pairs match exactly and are unique in both files. Overlaps are allowed; duplicate intervals require review. IDs and SRT counter values are not matching keys. Unmatched intervals produce added/removed findings rather than fuzzy guesses. Retiming, splitting, or merging therefore requires review even if intentional.

`no-flags` means only that configured checks found no issue. `review` means one or more findings. Invalid format or options throw in the library and exit 2 in the CLI. These results do not establish accuracy, translation quality, semantic equivalence, or fidelity to audio.

The JSON report has `schemaVersion: 1`, `status`, `summary`, `findings`, `truncated`, `omittedFindings`, and `limitations`. `changedCues` counts matched pairs with different text or settings; it does not count unmatched cues. A finding includes a code, original/candidate cue indices when available, interval milliseconds when available, a message, and optional details. At most 1,000 findings are retained; `summary.findings` remains the exact total, with omitted findings counted separately. Truncation never clears a review result. Details include at most 40 anchors per sequence, truncated to 160 characters each, with counts and a truncation indicator. Comparison uses the full extracted sequences.

## Text checks

| Check | Contract | Deliberate limits |
| --- | --- | --- |
| Numbers | Ordered digit tokens, signs, decimal/group separators, scientific exponents, attached percent signs, common currency prefixes, and a small English number-word lexicon must match within each cue | Literal, not arithmetic: `12` and `twelve`, or `1,000` and `1000`, require review. Units and locale conventions are not understood. Embedded identifiers can be missed. |
| Links | Ordered HTTP(S) URLs and common email forms must match within each cue | Not a complete URL/email parser. Trailing `. , ; ! ?` is treated as punctuation; actual URLs ending in those characters need manual review. |
| Negation | Explicit English tokens `no`, `not`, `never`, `neither`, `nor`, `without`, plus common negative contractions, must retain their sequence | Contractions normalize to `not`; grammatical scope, modality, synonyms, other languages, and negation moved within one cue are not understood. |
| Protected phrases | Case-sensitive literal substring occurrence counts must match within each cue | Counts include overlapping occurrences. Phrases are not words or regexes. Position, grammatical role, and unprotected names are not checked. |

Number words are zero through nineteen, multiples of ten through ninety, hundred, thousand, million, and billion. Case is ignored for number words and negation, but link spelling and protected phrases are literal. Up to 100 nonblank single-line protected phrases of at most 200 characters are supported; duplicates are removed.

Balanced `<b>`, `<i>`, and `<u>` tags without attributes are removed before text checks. Other tags, voice annotations, entities, malformed markup, and stray angle brackets cause an `unsupported-markup` finding, even when unchanged. Cue text is never rendered. Protect terms are checked against this same text projection.

Changing unprotected words can preserve all anchors and still invert meaning. Changing a unit with the same number can also pass. For example, `Keep 12` versus `Destroy 12` demonstrates a known blind spot. Protect crucial phrases, review findings, and use listening or a separate semantic review where appropriate.

## Supported input subset

- UTF-8 text; optional BOM; LF, CRLF, and CR line endings. CLI decoding rejects malformed UTF-8. At least one nonempty cue is required.
- SRT: numeric ID, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, one or more text lines, blank separators. Hours may exceed 24. Legacy coordinate/settings extensions are rejected.
- WebVTT: `WEBVTT` header and blank separator; optional cue IDs; `MM:SS.mmm` or `HH:MM:SS.mmm` timestamps; optional raw cue settings. Header, NOTE, STYLE, and REGION blocks are retained and compared; STYLE/REGION must precede cues. Settings and CSS are not validated or executed.
- Minutes/seconds must be 00–59, milliseconds exactly three digits, end later than start, and start times chronological. Same-start overlapping intervals are supported. This is a strict useful subset, not a full conformance validator or renderer.
- Each input is limited to 2 MiB, 10,000 cues, and 16,384 characters per cue. ASCII/C1 controls except tabs and line endings are rejected. Times must fit safe integer milliseconds.

References: [W3C WebVTT Candidate Recommendation Draft](https://www.w3.org/TR/2026/CRD-webvtt1-20260520/) and [Library of Congress SRT description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml). Implementing this subset does not imply conformance with every feature described there.

## Fallback behavior

`selectSubtitleText` and `guard` choose the entire original on any review finding and the entire candidate otherwise. They do not merge text or repair subtitles. Invalid input, including empty candidate files, causes an error rather than a selection. The caller must handle that error. `guard` preserves the selected UTF-8 text and creates a new output exclusively; it does not replace an existing source or output. A write failure can leave an incomplete new file and exits 2.

The API itself has no I/O. The lower-level `auditSubtitles` export expects the documented parsed-document shape; prefer `checkSubtitles` for raw text.
