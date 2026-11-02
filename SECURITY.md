# Security and data boundaries

CueAudit reads only the files explicitly passed to its CLI. Its comparison library has no filesystem, network, process execution, model, or telemetry functionality. Subtitles, WebVTT settings, and metadata are data and are never rendered or executed. Reports are text, Markdown, or JSON; Markdown output escapes embedded fragments.

Reports are **not anonymized**. Findings may include URLs, email addresses, numbers, and protected phrases from the inputs. Do not publish reports or fixtures containing private material. Terminal control characters are rejected by the parser and escaped by the report renderer.

The CLI limits subtitle inputs to 2 MiB and protected-term JSON to 64 KiB. Its `guard` output uses exclusive creation and will not overwrite existing files, including an existing symlink. A filesystem failure while writing may leave an incomplete newly created output; exit 2 indicates failure. Keep inputs when using the fallback workflow.

This program cannot prove semantic equivalence, subtitle correctness, safe instructions, or audio fidelity. Do not treat a `no-flags` result as a security or factual approval. The supported checks are narrow and deliberately documented.

For suspected vulnerabilities, use GitHub private vulnerability reporting if enabled, or open an issue describing only non-sensitive reproduction steps. Do not post credentials or private subtitles. This repository does not currently offer a private support inbox.
