import { formatTime } from './subtitles.mjs';

// Reports are data. Prevent terminal controls and Markdown/HTML interpretation.
function plain(value) { return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' '); }
function md(value) { return plain(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g,'\\$&'); }
export function renderReport(report, format = 'text') {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  if (!['text','markdown'].includes(format)) throw new Error('Report format must be text, markdown, or json.');
  const escape = format === 'markdown' ? md : plain;
  const summary = report.summary;
  const rows = [format === 'markdown' ? '# CueAudit' : 'CueAudit', '', `Result: ${report.status}`, `${summary.matchedCues} matched cues; ${summary.changedCues} changed; ${summary.findings} findings.`, ''];
  if (report.truncated) rows.push(`Report truncated: ${report.omittedFindings} additional findings omitted. Review remains required.`, '');
  for (const finding of report.findings) {
    const at = finding.startMs === null || finding.startMs === undefined ? 'document' : formatTime(finding.startMs);
    rows.push(`- ${escape(at)} / ${escape(finding.code)}: ${escape(finding.message)}`);
    if (finding.details !== undefined) rows.push(`  ${escape(JSON.stringify(finding.details))}`);
  }
  if (!report.findings.length) rows.push('No configured checks flagged a change. This does not establish accuracy or equivalent meaning.');
  rows.push('', 'Limits:');
  for (const limitation of report.limitations) rows.push(`- ${escape(limitation)}`);
  rows.push('', 'Reports can contain subtitle fragments and protected terms. Review before sharing.');
  return rows.join('\n') + '\n';
}
