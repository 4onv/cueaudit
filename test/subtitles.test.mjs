import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, formatTime } from '../src/subtitles.mjs';

const srt = (text = 'Do not change 12.', timing = '00:00:01,250 --> 00:00:03,500', id = '1') => `${id}\n${timing}\n${text}\n`;

test('SRT retains text and identifiers while normalizing BOM and CRLF', () => {
  const parsed = parseSubtitles('\uFEFF' + srt('<i>Hello</i>\nSecond line', undefined, '007').replaceAll('\n', '\r\n'));
  assert.deepEqual(parsed, { format: 'srt', metadata: [], cues: [{ index: 1, id: '007', startMs: 1250, endMs: 3500, settings: '', text: '<i>Hello</i>\nSecond line' }] });
});

test('WebVTT reads optional identifiers, short/long timestamps, settings and metadata', () => {
  const input = 'WEBVTT demo\nLanguage: en\n\nNOTE source fixture\nNot actual speech\n\nSTYLE\n::cue { color: lime; }\n\nREGION\nid:fred\n\nintro\n00:01.250 --> 00:03.500 align:start line:10%\nHello 12.\n\n00:00:04.000 --> 00:00:05.001\nGoodbye.\n\nNOTE final note\n';
  const parsed = parseSubtitles(input);
  assert.equal(parsed.format, 'vtt');
  assert.deepEqual(parsed.metadata, ['WEBVTT demo\nLanguage: en', 'NOTE source fixture\nNot actual speech', 'STYLE\n::cue { color: lime; }', 'REGION\nid:fred', 'NOTE final note']);
  assert.deepEqual(parsed.cues[0], { index: 1, id: 'intro', startMs: 1250, endMs: 3500, settings: 'align:start line:10%', text: 'Hello 12.' });
  assert.deepEqual(parsed.cues[1], { index: 2, id: null, startMs: 4000, endMs: 5001, settings: '', text: 'Goodbye.' });
});

test('overlapping and duplicate intervals remain parseable for audit ambiguity checks', () => {
  const parsed = parseSubtitles(srt('a') + '\n' + srt('b', undefined, '2') + '\n' + srt('c', '00:00:02,000 --> 00:00:04,000', '3'));
  assert.equal(parsed.cues.length, 3);
  assert.equal(parsed.cues[0].startMs, parsed.cues[1].startMs);
});

test('invalid timing fields, ordering and extra SRT settings are rejected', () => {
  for (const timing of ['00:60:00,000 --> 01:00:01,000', '00:00:60,000 --> 00:01:01,000', '00:00:01,2 --> 00:00:03,500', '00:00:01.250 --> 00:00:03.500', '00:00:03,500 --> 00:00:03,500', '00:00:04,000 --> 00:00:03,500', '00:00:01,000-->00:00:02,000', '00:00:01,000 --> 00:00:02,000 X1:40']) assert.throws(() => parseSubtitles(srt('text', timing)), /Subtitle input at line/);
  assert.throws(() => parseSubtitles(srt() + '\n' + srt('earlier', '00:00:00,500 --> 00:00:01,000', '2')), /chronological/);
  assert.throws(() => parseSubtitles('WEBVTT\n\n60:00.000 --> 61:00.000\nx'), /invalid timestamp/);
});

test('explicit format and malformed block boundaries fail without disclosing content', () => {
  for (const value of ['', 'WEBVTT\n', srt(''), 'secret-cue-name\n00:00:01,000 --> 00:00:02,000\nsecret-content', 'WEBVTT\n00:00.000 --> 00:01.000\nsecret-content', 'WEBVTT\n\n00:00.000 --> 00:01.000\nsecret --> content', 'WEBVTT\n\nSTYLE\nsecret --> content']) {
    assert.throws(() => parseSubtitles(value), error => error instanceof Error && !error.message.includes('secret'));
  }
  assert.throws(() => parseSubtitles(srt(), { format: 'vtt' }), /WEBVTT header/);
  assert.throws(() => parseSubtitles(srt(), { format: 'ass' }), /format must be/);
  assert.throws(() => parseSubtitles(srt() + srt('second', '00:00:04,000 --> 00:00:05,000', '2')), /blank line/);
  assert.throws(() => parseSubtitles(null), /expected UTF-8 text/);
  assert.throws(() => parseSubtitles('WEBVTT\n\n00:00.000 --> 00:01.000\nx\n\nSTYLE\n::cue {}'), /must precede/);
});

test('input size, text size, cue count, and control-character limits are enforced', () => {
  assert.throws(() => parseSubtitles('x'.repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
  assert.throws(() => parseSubtitles('é'.repeat(1024 * 1024 + 1)), /2 MiB/);
  assert.throws(() => parseSubtitles(srt('x'.repeat(16385))), /16384/);
  assert.equal(parseSubtitles(srt('x'.repeat(16384))).cues.length, 1);
  assert.throws(() => parseSubtitles(Array.from({ length: 10001 }, (_, i) => srt('x', undefined, String(i + 1))).join('\n')), /10000 cue/);
  for (const control of ['\0', '\x1b', '\x08', '\x7f', '\u0085']) assert.throws(() => parseSubtitles(srt(`A${control}B`)), /control character/);
  assert.throws(() => parseSubtitles(srt('\ud800')), /Unicode surrogate/);
  assert.equal(parseSubtitles(srt('A\tB')).cues[0].text, 'A\tB');
});

test('timestamp formatting is exact beyond 24 hours and rejects fractional inputs', () => {
  assert.equal(formatTime(0), '00:00:00.000');
  assert.equal(formatTime(90061001), '25:01:01.001');
  assert.equal(parseSubtitles(srt('long', '123:45:06,007 --> 123:45:07,008')).cues[0].startMs, 445506007);
  for (const value of [-1, 1.5, NaN, Infinity, '1000', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => formatTime(value), /nonnegative safe integer/);
});
