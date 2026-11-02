# Synthetic examples

Every subtitle and name in this directory is invented. These files demonstrate checks; they are not captured speech, real model output, or evidence of transcription quality.

`original.srt` and `clean.srt` differ in punctuation and line wrapping while retaining the checked anchors. `changed.srt` swaps 12 and 24 between cues, removes a negation, and replaces a protected name. A whole-file numeric multiset would miss the swap. `protect.json` declares the example protected name.

Run `node bin/cueaudit.mjs demo` from the repository root. The changed example is expected to require review.
