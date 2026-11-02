import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSubtitles } from '../src/audit.mjs';

function doc(texts, extras = {}) {
  return { format: 'srt', metadata: [], cues: texts.map((text, i) => ({ index: i + 1, id: String(i + 1), startMs: i * 2000, endMs: i * 2000 + 1500, settings: '', text })), ...extras };
}
const codes = report => report.findings.map(finding => finding.code);

test('punctuation, casing, line breaks, and supported basic styling do not flag retained anchors', () => {
  const report = auditSubtitles(doc(['um, do not spend $ 50 on the two parts']), doc(['Do NOT spend <b>$50</b>\non the two parts.']));
  assert.equal(report.status, 'no-flags');
  assert.equal(report.summary.changedCues, 1);
  assert.match(report.limitations[0], /does not establish accuracy/);
});

test('lost, invented, repeated, reordered, and reformatted numbers require review', () => {
  for (const [before, after] of [['Use 12 items.', 'Use 13 items.'], ['Use 12 items.', 'Use items.'], ['Use items.', 'Use 12 items.'], ['1 2', '2 1'], ['7 7', '7'], ['1,000', '1000'], ['zero one two', '0 1 2'], ['-12.5%', '12.5%'], ['12.5ms', '12.6ms'], ['.5', '5'], ['1e3', '1e5']]) {
    const report = auditSubtitles(doc([before]), doc([after]));
    assert.ok(codes(report).includes('numbers-changed'), `${before} -> ${after}`);
  }
});

test('word boundaries avoid numbers inside identifiers and number-word substrings', () => {
  const report = auditSubtitles(doc(['Someone has stone and v123tag.']), doc(['Someone has stones and v456tag.']));
  assert.ok(!codes(report).includes('numbers-changed'));
});

test('same file-wide totals do not hide numbers or negations moved between cues', () => {
  const report = auditSubtitles(doc(['Do not use 12.', 'Use 8.']), doc(['Use 8.', 'Do not use 12.']));
  assert.equal(report.findings.filter(f => f.code === 'numbers-changed').length, 2);
  assert.equal(report.findings.filter(f => f.code === 'negations-changed').length, 2);
  assert.deepEqual(report.findings[0].details.before, ['12']);
});

test('explicit negation lexicon handles contractions, curly apostrophes, and duplicates', () => {
  assert.equal(auditSubtitles(doc(['Don’t use it.']), doc(['Do not use it.'])).status, 'no-flags');
  for (const [before, after] of [['Never do it.', 'Do it.'], ['No, not now.', 'Not now.'], ['Cannot do it.', 'Can do it.'], ['Neither here nor there.', 'Here and there.'], ['without a key', 'with a key']]) {
    assert.ok(codes(auditSubtitles(doc([before]), doc([after]))).includes('negations-changed'));
  }
});

test('URL/email changes are separate from numbers inside those anchors', () => {
  const report = auditSubtitles(doc(['See https://example.com/v1. Email dev1@example.com.']), doc(['See https://example.com/v2. Email dev2@example.com.']));
  assert.deepEqual(codes(report), ['links-changed']);
  assert.deepEqual(report.findings[0].details.before, ['https://example.com/v1', 'dev1@example.com']);
  assert.equal(auditSubtitles(doc(['See https://example.com.']), doc(['See https://example.com!'])).status, 'no-flags');
});

test('protected phrases use literal case-sensitive overlapping counts and deduplicate configuration', () => {
  const report = auditSubtitles(doc(['banana Acme Acme']), doc(['bandana Acme acme']), { protect: ['ana', 'Acme', 'Acme', '__proto__'] });
  assert.equal(report.findings.length, 2);
  assert.deepEqual(report.findings.map(f => f.details), [{ term: 'ana', beforeCount: 2, afterCount: 1 }, { term: 'Acme', beforeCount: 2, afterCount: 1 }]);
});

test('custom literal loss is detected per cue even when total occurrences remain equal', () => {
  const report = auditSubtitles(doc(['WidgetX works.', 'This is another cue.']), doc(['It works.', 'This is WidgetX.']), { protect: ['WidgetX'] });
  assert.equal(report.findings.filter(f => f.code === 'protected-changed').length, 2);
});

test('exact timing matching reports retiming as unmatched cues without text guesses', () => {
  const after = doc(['Use 14.']); after.cues[0].startMs = 1;
  const report = auditSubtitles(doc(['Use 12.']), after);
  assert.deepEqual(codes(report), ['cue-removed', 'cue-added']);
  assert.equal(report.summary.matchedCues, 0);
});

test('duplicate intervals are ambiguous even when text or cue ids might suggest a match', () => {
  const before = doc(['A 1', 'B 2']); before.cues[1].startMs = 0; before.cues[1].endMs = 1500;
  const after = structuredClone(before); after.cues.reverse(); after.cues.forEach((cue, i) => cue.index = i + 1);
  const report = auditSubtitles(before, after);
  assert.deepEqual(codes(report), ['ambiguous-interval']);
  assert.equal(report.summary.matchedCues, 0);
  assert.deepEqual(report.findings[0].details, { beforeCount: 2, afterCount: 2 });
});

test('empty cue text, metadata, container and cue settings changes require review', () => {
  const after = doc(['  '], { format: 'vtt', metadata: ['NOTE changed'] }); after.cues[0].settings = 'align:start';
  const report = auditSubtitles(doc(['Words here.']), after);
  assert.deepEqual(codes(report), ['format-changed', 'metadata-changed', 'settings-changed', 'text-removed']);
  assert.deepEqual(codes(auditSubtitles(doc(['']), doc(['Added']))), ['text-added']);
});

test('unknown markup, entities, broken tags and voice annotations cannot silently pass', () => {
  for (const text of ['<v Alice>Hello', 'One &amp; two', '<b>one', '<i><b>x</i></b>', '<script>x</script>', 'x < y']) {
    assert.ok(codes(auditSubtitles(doc([text]), doc([text]))).includes('unsupported-markup'), text);
  }
  assert.equal(auditSubtitles(doc(['<b>One <i>two</i></b>']), doc(['One two'])).status, 'no-flags');
});

test('report is deterministic and details are bounded without weakening comparison', () => {
  const before = doc([Array(100).fill('12').join(' ')]), after = doc([Array(99).fill('12').join(' ')]);
  const report = auditSubtitles(before, after);
  assert.deepEqual(report, auditSubtitles(before, after));
  assert.equal(report.findings[0].details.before.length, 40);
  assert.equal(report.findings[0].details.beforeCount, 100);
  assert.equal(report.findings[0].details.truncated, true);
});

test('invalid public API options and documents are rejected without echoing values', () => {
  for (const options of [null, [], { bogus: true }, { protect: null }, { protect: 'secret' }, { protect: [''] }, { protect: ['\n'] }, { protect: ['x'.repeat(201)] }, { protect: Array(101).fill('x') }]) assert.throws(() => auditSubtitles(doc(['x']), doc(['x']), options));
  for (const bad of [null, {}, doc(['x'], { format: 'html' }), doc(['x'.repeat(16385)]), doc(['x'], { metadata: [12] })]) assert.throws(() => auditSubtitles(bad, doc(['x'])));
  assert.throws(() => auditSubtitles(doc(['x']), doc(['x']), { protect: ['DO_NOT_ECHO\nSECRET'] }), error => !error.message.includes('DO_NOT_ECHO'));
});

test('long non-email words and unmatched markup delimiters remain bounded inputs', () => {
  const text = 'x'.repeat(8000) + '<'.repeat(8000);
  const report = auditSubtitles(doc([text]), doc([text]));
  assert.deepEqual(codes(report), ['unsupported-markup']);
});

test('high finding counts retain a bounded deterministic prefix and exact total', () => {
  const protect = Array.from({ length: 100 }, (_, i) => 'a'.repeat(i + 1));
  const report = auditSubtitles(doc(Array(1000).fill('a'.repeat(100))), doc(Array(1000).fill('b')), { protect });
  assert.equal(report.status, 'review');
  assert.equal(report.summary.findings, 100000);
  assert.equal(report.findings.length, 1000);
  assert.equal(report.truncated, true);
  assert.equal(report.omittedFindings, 99000);
  assert.equal(report.findings[0].beforeIndex, 1);
  assert.equal(report.findings[0].details.term, 'a');
  assert.equal(report.findings.at(-1).beforeIndex, 10);
  assert.equal(report.findings.at(-1).details.term, 'a'.repeat(100));
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 1024 * 1024);
  const clean = auditSubtitles(doc(['x']), doc(['x']));
  assert.equal(clean.truncated, false);
  assert.equal(clean.omittedFindings, 0);
});
