import { Buffer } from 'node:buffer';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FINDINGS = 1000;
const NUMBER_WORDS = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion';
const CONTRACTIONS = new Set(["can't", "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't", "couldn't", "shouldn't", "wouldn't", "mustn't", "needn't", "shan't", "mightn't", 'cannot']);
const NEGATIONS = new Set(['no', 'not', 'never', 'neither', 'nor', 'without']);
const LIMITATIONS = Object.freeze([
  'No flags means only that these checks found no differences; it does not establish accuracy, equivalent meaning, or fidelity to audio.',
  'Cues are paired only by exact, unique start/end times. Retiming, splitting, merging, or duplicate intervals requires review.',
  'Number and negation checks use an English lexicon and literal sequences. They do not interpret arithmetic, units, spelling corrections, or the scope of a negation.',
  'Protected phrases are case-sensitive literal substrings. Their occurrence counts are compared within each cue, not their grammatical role.',
  'Reports may include numbers, URLs, email addresses, and protected phrases from the input. Review them before sharing.'
]);

function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || !['srt', 'vtt'].includes(doc.format) || !Array.isArray(doc.cues) || doc.cues.length > 10000 || !Array.isArray(doc.metadata)) throw new Error('Expected a parsed subtitle document.');
  let bytes = 0;
  for (let i = 0; i < doc.cues.length; i++) {
    const cue = doc.cues[i];
    if (!cue || cue.index !== i + 1 || !Number.isSafeInteger(cue.startMs) || cue.startMs < 0 || !Number.isSafeInteger(cue.endMs) || cue.endMs <= cue.startMs || typeof cue.text !== 'string' || cue.text.length > 16384 || typeof cue.settings !== 'string' || cue.settings.length > 4096 || !(cue.id === null || typeof cue.id === 'string')) throw new Error('Invalid parsed cue.');
    bytes += Buffer.byteLength(cue.text) + Buffer.byteLength(cue.settings) + Buffer.byteLength(cue.id ?? '');
  }
  for (const item of doc.metadata) {
    if (typeof item !== 'string') throw new Error('Invalid subtitle metadata.');
    bytes += Buffer.byteLength(item);
  }
  if (bytes > MAX_BYTES) throw new Error('Subtitle document exceeds the analysis limit.');
}

function protectedTerms(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => key !== 'protect')) throw new Error('Audit options accept only a protect array.');
  const terms = options.protect === undefined ? [] : options.protect;
  if (!Array.isArray(terms) || terms.length > 100 || terms.some(term => typeof term !== 'string' || !term.trim() || term.length > 200 || /[\u0000-\u001f\u007f]/.test(term))) throw new Error('Protect must contain at most 100 nonempty, single-line strings of at most 200 characters.');
  return [...new Set(terms)];
}

function groupIntervals(cues) {
  const result = new Map();
  for (const cue of cues) {
    const key = `${cue.startMs}:${cue.endMs}`;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(cue);
  }
  return result;
}

// Only the unambiguous basic formatting subset is removed for text checks.
function visibleText(text) {
  const stack = [];
  let unsupported = false;
  const plain = text.replace(/<[^<>]*>/g, tag => {
    const basic = /^<(\/)?(b|i|u)>$/i.exec(tag);
    if (!basic) { unsupported = true; return tag; }
    const name = basic[2].toLowerCase();
    if (basic[1]) { if (stack.pop() !== name) unsupported = true; }
    else stack.push(name);
    return '';
  });
  if (stack.length || /[<>]/.test(plain) || /&(?:[a-z][a-z0-9]*|#\d+|#x[a-f0-9]+);/i.test(plain)) unsupported = true;
  return { text: plain, unsupported };
}

function anchors(text) {
  const links = [];
  // Combined matching prevents a number inside a URL/email becoming a separate number anchor.
  const linkPattern = /https?:\/\/[^\s<>"']+|[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}/gi;
  const withoutLinks = text.replace(linkPattern, value => {
    // Sentence punctuation is outside the anchor; URL punctuation can therefore be ambiguous.
    links.push(value.replace(/[.,;!?]+$/, ''));
    return ' '.repeat(value.length);
  });
  const normalized = withoutLinks.replace(/\u2019/g, "'");
  const numeric = new RegExp(`(?<![\\p{L}\\p{N}_])(?:[$€£¥][ \\t]*)?[+-]?(?:\\d+(?:[.,]\\d+)*|[.,]\\d+)(?:e[+-]?\\d+)?(?:%)?|(?<![\\p{L}\\p{N}_])(?:${NUMBER_WORDS})(?![\\p{L}\\p{N}_])`, 'giu');
  const numbers = [...normalized.matchAll(numeric)].map(match => match[0].toLowerCase().replace(/([$€£¥])[ \t]+/g, '$1'));
  const negations = [];
  for (const match of normalized.matchAll(/[\p{L}]+(?:'[\p{L}]+)?/gu)) {
    const token = match[0].toLowerCase();
    if (CONTRACTIONS.has(token)) negations.push('not');
    else if (NEGATIONS.has(token)) negations.push(token);
  }
  return { numbers, links, negations };
}

function same(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function preview(values) { return values.slice(0, 40).map(value => value.length > 160 ? value.slice(0, 157) + '...' : value); }
function sequenceDetails(before, after) { return { before: preview(before), after: preview(after), beforeCount: before.length, afterCount: after.length, truncated: before.length > 40 || after.length > 40 || [...before, ...after].some(value => value.length > 160) }; }
function countLiteral(text, term) {
  let count = 0, start = 0;
  while ((start = text.indexOf(term, start)) !== -1) { count++; start++; }
  return count;
}

/** Compare two already parsed subtitle documents. This function performs no I/O. */
export function auditSubtitles(beforeDoc, afterDoc, options = {}) {
  validateDocument(beforeDoc); validateDocument(afterDoc);
  const terms = protectedTerms(options);
  const beforeGroups = groupIntervals(beforeDoc.cues), afterGroups = groupIntervals(afterDoc.cues);
  const findings = [];
  let matchedCues = 0, changedCues = 0, findingCount = 0;
  function add(code, before, after, message, details) {
    findingCount++;
    if (findings.length >= MAX_FINDINGS) return;
    const cue = before ?? after;
    findings.push({ code, beforeIndex: before?.index ?? null, afterIndex: after?.index ?? null, startMs: cue?.startMs ?? null, endMs: cue?.endMs ?? null, message, ...(details ? { details: typeof details === 'function' ? details() : details } : {}) });
  }
  if (beforeDoc.format !== afterDoc.format) add('format-changed', null, null, 'Subtitle container format changed; review the conversion.');
  if (!same(beforeDoc.metadata, afterDoc.metadata)) add('metadata-changed', null, null, 'Header, comments, styles, or regions changed.');
  const keys = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])].sort((a, b) => {
    const [as, ae] = a.split(':').map(Number), [bs, be] = b.split(':').map(Number);
    return as - bs || ae - be;
  });
  for (const key of keys) {
    const before = beforeGroups.get(key) ?? [], after = afterGroups.get(key) ?? [];
    if (before.length > 1 || after.length > 1) {
      add('ambiguous-interval', before[0], after[0], 'Duplicate time intervals cannot be paired without guessing.', { beforeCount: before.length, afterCount: after.length });
      continue;
    }
    const original = before[0], edited = after[0];
    if (!original) { add('cue-added', null, edited, 'No original cue has this exact interval. Review additions, retiming, or resegmentation.'); continue; }
    if (!edited) { add('cue-removed', original, null, 'No edited cue has this exact interval. Review removals, retiming, or resegmentation.'); continue; }
    matchedCues++;
    if (original.text !== edited.text || original.settings !== edited.settings) changedCues++;
    if (original.settings !== edited.settings) add('settings-changed', original, edited, 'Cue presentation settings changed.');
    const oldText = visibleText(original.text), newText = visibleText(edited.text);
    if (oldText.unsupported || newText.unsupported) add('unsupported-markup', original, edited, 'This cue contains markup or entities outside the supported text-analysis subset. Review its visible text manually.');
    if (oldText.text.trim() && !newText.text.trim()) add('text-removed', original, edited, 'The original cue had text; the edited cue is empty.');
    if (!oldText.text.trim() && newText.text.trim()) add('text-added', original, edited, 'The original cue was empty; the edited cue has text.');
    const oldAnchors = anchors(oldText.text), newAnchors = anchors(newText.text);
    for (const [category, message] of [
      ['numbers', 'The ordered literal number sequence changed; review values, counts, formatting, and order.'],
      ['links', 'The ordered URL/email sequence changed.'],
      ['negations', 'The explicit English negation sequence changed; review the wording.']
    ]) {
      if (!same(oldAnchors[category], newAnchors[category])) add(`${category}-changed`, original, edited, message, () => sequenceDetails(oldAnchors[category], newAnchors[category]));
    }
    for (const term of terms) {
      const beforeCount = countLiteral(oldText.text, term), afterCount = countLiteral(newText.text, term);
      if (beforeCount !== afterCount) add('protected-changed', original, edited, 'A protected literal changed occurrence count within this cue.', () => ({ term, beforeCount, afterCount }));
    }
  }
  return {
    schemaVersion: 1,
    status: findingCount ? 'review' : 'no-flags',
    summary: { beforeCues: beforeDoc.cues.length, afterCues: afterDoc.cues.length, matchedCues, changedCues, findings: findingCount },
    findings,
    truncated: findingCount > findings.length,
    omittedFindings: findingCount - findings.length,
    limitations: [...LIMITATIONS, 'URLs omit trailing sentence punctuation (. , ; ! ?); a URL whose actual value ends in those characters needs manual review.']
  };
}
