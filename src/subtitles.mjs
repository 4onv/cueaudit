const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CUES = 10000;
const MAX_CUE_TEXT = 16384;

function fail(message, line) {
  throw new Error(`Subtitle input${line ? ` at line ${line}` : ''}: ${message}`);
}

function timestamp(value, format, line) {
  const expression = format === 'srt'
    ? /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/
    : /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
  const match = expression.exec(value);
  if (!match) fail('invalid timestamp.', line);
  const total = Number(match[1] ?? 0) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
  if (!Number.isSafeInteger(total)) fail('timestamp is outside the supported range.', line);
  return total;
}

/** Format a nonnegative integer millisecond timestamp, without rounding. */
export function formatTime(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Time must be a nonnegative safe integer in milliseconds.');
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/**
 * Parse the documented SRT/WebVTT subset. This is not a WebVTT renderer or a
 * complete conformance validator. Text/markup and settings are retained, never
 * interpreted. Metadata includes the VTT header and NOTE/STYLE/REGION blocks;
 * its line endings are normalized like the cue text.
 */
export function parseSubtitles(text, { format = 'auto' } = {}) {
  if (typeof text !== 'string') fail('expected UTF-8 text.');
  if (!text.isWellFormed()) fail('text contains an unpaired Unicode surrogate.');
  if (!['auto', 'srt', 'vtt'].includes(format)) fail('format must be auto, srt, or vtt.');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail('file exceeds the 2 MiB limit.');
  // Tabs and line endings are useful subtitle whitespace; other ASCII controls
  // are rejected so diagnostic/terminal consumers do not receive escape codes.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) fail('unsupported control character.');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const isVtt = /^WEBVTT(?:[ \t]|$)/.test(lines[0]);
  if (format === 'auto') format = isVtt ? 'vtt' : 'srt';
  const metadata = [];
  const cues = [];
  let cursor = 0;

  if (format === 'vtt') {
    if (!isVtt || lines[0].includes('-->')) fail('WebVTT requires a WEBVTT header.', 1);
    const header = [];
    while (cursor < lines.length && lines[cursor].trim() !== '') {
      if (lines[cursor].includes('-->')) fail('separate the WebVTT header from cues with a blank line.', cursor + 1);
      header.push(lines[cursor++]);
    }
    metadata.push(header.join('\n'));
  }

  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === '') cursor++;
    if (cursor === lines.length) break;
    const firstLine = cursor + 1;
    const block = [];
    while (cursor < lines.length && lines[cursor].trim() !== '') block.push(lines[cursor++]);

    if (format === 'vtt' && (/^NOTE(?:[ \t]|$)/.test(block[0]) || ['STYLE', 'REGION'].includes(block[0]))) {
      if (block[0] !== 'NOTE' && !block[0].startsWith('NOTE ') && !block[0].startsWith('NOTE\t') && cues.length) fail('STYLE and REGION blocks must precede cues.', firstLine);
      if (block.some(line => line.includes('-->'))) fail('metadata blocks cannot contain a cue arrow.', firstLine);
      metadata.push(block.join('\n'));
      continue;
    }

    let id = null;
    let timingOffset = 0;
    if (format === 'srt') {
      if (!/^\d+$/.test(block[0])) fail('SRT cues require a numeric identifier.', firstLine);
      id = block[0];
      timingOffset = 1;
    } else if (!block[0].includes('-->')) {
      id = block[0];
      timingOffset = 1;
    }
    const timing = block[timingOffset];
    const timingMatch = typeof timing === 'string' && /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/.exec(timing);
    if (!timingMatch) fail('expected a cue timing line.', firstLine + timingOffset);
    if (format === 'srt' && timingMatch[3]?.trim()) fail('SRT timing settings are not supported.', firstLine + timingOffset);
    const startMs = timestamp(timingMatch[1], format, firstLine + timingOffset);
    const endMs = timestamp(timingMatch[2], format, firstLine + timingOffset);
    if (endMs <= startMs) fail('cue end must be later than its start.', firstLine + timingOffset);
    if (cues.length && startMs < cues.at(-1).startMs) fail('cue start times must be in chronological order.', firstLine + timingOffset);
    const payloadLines = block.slice(timingOffset + 1);
    if (payloadLines.some(line => /^\d[\d:,.]*[ \t]+-->[ \t]+\d/.test(line))) fail('separate subtitle cues with a blank line.', firstLine);
    const payload = payloadLines.join('\n');
    if (!payload.trim()) fail('cue text must not be empty.', firstLine);
    if (payload.length > MAX_CUE_TEXT) fail('cue text exceeds the 16384 character limit.', firstLine);
    if (format === 'vtt' && payload.includes('-->')) fail('WebVTT cue text cannot contain a cue arrow.', firstLine);
    if (cues.length === MAX_CUES) fail('file exceeds the 10000 cue limit.', firstLine);
    cues.push({ index: cues.length + 1, id, startMs, endMs, settings: (timingMatch[3] ?? '').trim(), text: payload });
  }
  if (!cues.length) fail('at least one subtitle cue is required.');
  return { format, cues, metadata };
}
