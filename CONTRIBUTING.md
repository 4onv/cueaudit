# Contributing

Use Node.js 22 or newer; there are no runtime dependencies. Run `node --test` and `npm run test:package` before proposing a change. Keep CLI behavior and public exports covered by meaningful regression cases.

Useful contributions include format edge cases, language-specific negation checks with explicit limitations, better findings, and integration examples. Include both a change that should flag and a harmless edit that should pass. Never relabel heuristic checks as proof of equivalent meaning.

Use synthetic or openly licensed fixtures. Label generated data and do not commit private subtitles, credentials, transcripts, package caches, or local reports. Keep a clear distinction between parser errors (exit 2) and review findings (exit 1). Do not silently align ambiguous cues or change the source files.

The first version deliberately omits fuzzy cue alignment, translation judgments, provider calls, and subtitle editing. Discuss those scope changes in an issue before a large implementation.
