# Changelog

## 0.1.2 — 2026-11-11

- Reject POSIX named pipes immediately when reading subtitle inputs or protected terms.

## 0.1.1 — 2026-11-07

- Decode a documented subset of named and numeric character references before anchor checks, avoiding automatic review for ordinary `&amp;` text.
- Compare encoded numbers, negation and protected phrases as visible text; decode exactly once and keep escaped tags literal.
- Continue requiring review for unknown references, unsafe code points and unsupported markup. Add regression coverage for each boundary.

## 0.1.0 — 2026-11-02

- Compare original and cleaned SRT/WebVTT subtitles at exact cue intervals.
- Flag changed numeric, link, English-negation, and custom protected anchors.
- Report changed structure, ambiguous intervals, metadata, settings, and unsupported markup.
- Provide text, Markdown, JSON, a reusable JavaScript API, and an explicit whole-original fallback command.
- Include synthetic examples and cross-platform unit, CLI, and package installation checks.
