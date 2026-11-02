import { parseSubtitles } from './subtitles.mjs';
import { auditSubtitles } from './audit.mjs';
export { parseSubtitles, formatTime } from './subtitles.mjs';
export { auditSubtitles } from './audit.mjs';

/** Compare text already obtained by the caller. No I/O or model calls. */
export function checkSubtitles(original, candidate, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['beforeFormat','afterFormat','protect'].includes(key))) throw new Error('Check options accept only beforeFormat, afterFormat, and protect.');
  const { beforeFormat = 'auto', afterFormat = 'auto', protect = [] } = options;
  return auditSubtitles(parseSubtitles(original, { format: beforeFormat }), parseSubtitles(candidate, { format: afterFormat }), { protect });
}

/** Return the complete original whenever a configured check flags review.
 * Invalid input throws; it is never silently accepted or written anywhere.
 */
export function selectSubtitleText(original, candidate, options = {}) {
  const report = checkSubtitles(original, candidate, options);
  const selected = report.status === 'no-flags' ? 'candidate' : 'original';
  return { selected, text: selected === 'candidate' ? candidate : original, report };
}
