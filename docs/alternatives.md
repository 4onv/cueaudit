# Alternatives and scope

CueAudit checks whether a proposed same-language subtitle cleanup preserves exact cue intervals and selected anchors. It runs offline on Node.js 22 or newer and produces review findings; it does not transcribe audio, translate, or judge meaning. These alternatives were reviewed on **November 2, 2026**. Their capabilities may change.

| Project | Existing capability | When to choose it |
| --- | --- | --- |
| [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit), including its [CLI reference](https://github.com/SubtitleEdit/subtitleedit/blob/main/docs/reference/command-line.md) | A broad subtitle editor with conversion and `seconv lint` validation. | You need to author, convert, synchronize, or inspect subtitle files rather than compare a cleanup proposal with an original. |
| [Subtitle Transcript Refiner](https://github.com/clausagerskov/Subtitle-Transcript-Refiner) | Builds transcription evidence and refines official subtitles. Its [semantic audit](https://github.com/clausagerskov/Subtitle-Transcript-Refiner/blob/main/.agents/skills/subtitle-transcript-refiner/scripts/semantic_audit.py) looks for evidence words missing from overlapping refined cues and supports a pending/excluded review workflow. | You need to compare a refined subtitle track with independently obtained transcription evidence. |
| [Jev Subtitle Translator](https://github.com/GeekLinkDev/jev-subtitle-translator) | Translates SRT through a configured model provider, preserves original cue structure, and reviews source–translation pairs with Jev. | You need translation and model-assisted review of possible meaning changes. |
| [Subzero](https://github.com/yuri-rod/subzero) | Subtitle cleanup and conversion, timing verification, translation, OCR recovery, and media-library jobs. | You need a larger media-processing workflow, including audio/video-dependent operations. |
| [JiWER](https://github.com/jitsi/jiwer) | Computes word/character error and related similarity measures for speech-recognition evaluation. | You need reference/hypothesis accuracy metrics over a corpus. |

## What CueAudit adds

CueAudit treats exact subtitle intervals as the comparison boundary. Moving a protected item to a different cue can therefore produce a finding even when the document-wide item totals are unchanged. It checks a candidate produced by any tool, without a provider account, an audio model, or a dependency on a particular editor.

The initial checks cover cue structure, numeric anchors, links, English negation, and occurrences of explicitly protected phrases. JSON and Markdown reports can be consumed by other tooling. The fallback API can retain the complete original text when review is required; it does not splice selected candidate cues into the original.

This overlaps with existing validation and preservation work. The distinction is the packaging and narrow before/after contract, not a claim to have invented subtitle checking or semantic verification. The repository does not copy another project's implementation.

## What the checks cannot decide

- Whether either subtitle file accurately represents the audio.
- Whether a translation preserves meaning, or a rewritten sentence is equivalent.
- Whether intentional retiming, splitting, or merging is correct.
- Whether a numeric-format change or removed negation is justified in context.
- Whether meaning changed while the selected anchors remained unchanged.

Use CueAudit as an explainable review signal. For broader editing, audio-grounded evidence, or translation quality, use the appropriate specialist tool and human review.
