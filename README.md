# CueAudit

**Did subtitle cleanup change the details? Check before you ship.**

[![CI](https://github.com/4onv/cueaudit/actions/workflows/ci.yml/badge.svg)](https://github.com/4onv/cueaudit/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

CueAudit compares original and edited SRT/WebVTT subtitles, offline, cue by cue. It flags changes to timing, numbers, English negation, links, and phrases you explicitly protect. No model, account, runtime dependencies, or transcript uploads.

```text
Original, cue 1: Keep 12 draft clips; do not publish.
Edited,   cue 1: Keep 24 draft clips; do publish.
Original, cue 2: Publish 24 approved clips.
Edited,   cue 2: Publish 12 approved clips.

Same numbers across the file. Different instructions at each timestamp.
CueAudit flags both numeric sequences and the missing negation.
```

This example is **synthetic**. The tool checks a narrow preservation contract. **No flags does not prove accuracy or equivalent meaning.** In particular, `Keep 12` → `Destroy 12` can pass unless you protect the changed word.

## Try it

Install [Node.js 22 or newer](https://nodejs.org/), then:

```sh
git clone https://github.com/4onv/cueaudit.git
cd cueaudit
node bin/cueaudit.mjs demo
node bin/cueaudit.mjs check examples/original.srt examples/clean.srt
node bin/cueaudit.mjs check examples/original.srt examples/changed.srt --protect examples/protect.json --format markdown
```

The last command intentionally exits `1` because the edited fixture needs review. `demo` always exits `0` when its demonstration completes and visibly labels the invented examples.

For an installed CLI, download `4onv-cueaudit-0.1.1.tgz` from the [GitHub release](https://github.com/4onv/cueaudit/releases/tag/v0.1.1), then:

```sh
npm install -g ./4onv-cueaudit-0.1.1.tgz --offline --ignore-scripts --no-audit --no-fund
cueaudit demo
```

The package has **not been published to npm**. Install the downloaded archive, or use the source commands above.

## Use after a cleanup step

```sh
cueaudit check original.srt cleaned.srt --format json
cueaudit check original.vtt cleaned.vtt --protect terms.json --format markdown
```

`terms.json` is a JSON array, such as `["Project Orion", "do not deploy"]`. Terms are literal and case-sensitive. Cue-local occurrence counts must match; this is useful for names, technical terms, and instructions the built-in checks cannot understand.

| Exit | Meaning |
| --- | --- |
| `0` | No configured checks flagged a change |
| `1` | Review findings; for `guard`, the original fallback was written |
| `2` | Invalid input, unsupported structure, or I/O error |

Reports go to stdout. Subtitle text and protected values can appear in findings. Review reports before sharing, just as you would the source subtitles.

## Keep the original when a check flags a change

```sh
cueaudit guard original.srt cleaned.srt --protect terms.json --output selected.srt
```

`guard` writes the **complete original** if any check flags review, or the complete candidate otherwise. It never mixes individually accepted cues. It preserves the selected UTF-8 text, including BOM and line endings, and refuses to overwrite an existing output. Invalid inputs produce exit `2` without selecting either file. The destination's parent directory must exist. Inspect exit codes before continuing a pipeline.

This is a conservative fallback policy, not a guarantee that an accepted candidate is accurate. Original transcripts can also be wrong.

## JavaScript API

From a checkout use `./src/index.mjs`; after installing the archive as a local dependency use `@4onv/cueaudit`:

```js
import { checkSubtitles, selectSubtitleText } from './src/index.mjs';

const report = checkSubtitles(originalText, candidateText, {
  protect: ['Project Orion'],
});

const { selected, text } = selectSubtitleText(originalText, candidateText);
// selected is 'original' or 'candidate'. You decide whether to save text.
```

The API performs no I/O. Invalid input throws. Lower-level `parseSubtitles`, `formatTime`, and `auditSubtitles` exports support integrations with already parsed cues.

## What gets checked

- **Exact intervals:** unique start/end millisecond pairs identify corresponding cues. Added, removed, retimed, split, or merged cues require review. Duplicate intervals are ambiguous and are not guessed.
- **Local anchors:** ordered numeric anchors, URLs/emails, and explicit English negation are compared inside each matched cue. Custom phrase occurrence counts are checked there too.
- **Presentation changes:** WebVTT metadata and cue settings are compared. Unsupported markup/entities cause review instead of silently weakening text analysis.

Cue numbers and WebVTT IDs are labels, not the matching key. Harmless renumbering alone is accepted. Overlapping cues with distinct intervals are allowed. See [the exact checks and format subset](docs/checks.md).

## Limits

This is for cleanup that should preserve cue timing and selected literals. It is intentionally strict about resegmentation, number formatting, and retiming; use a subtitle editor to review intentional changes. It is not translation QA, speech recognition, a subtitle renderer, or an audio-ground-truth checker. English negation is heuristic; scope changes within a cue, synonyms, omitted unprotected words, and changed meaning can be missed. Protected phrases are not a full language parser.

Inputs are bounded to 2 MiB, 10,000 cues, and 16,384 characters per cue. The parser supports a documented SRT/WebVTT subset rather than full standard conformance. All bundled subtitles are invented fixtures.

## Development

```sh
node --test
npm run test:package
```

CI tests on Windows and Ubuntu with Node.js 22 and 24, including an offline installation of the actual package archive. No provider calls are required.

Read [the dated research](docs/research-2026-11-01.md), [existing alternatives](docs/alternatives.md), [security boundaries](SECURITY.md), and [contributing guide](CONTRIBUTING.md). The project is MIT licensed. Adoption and stars are not promised.
