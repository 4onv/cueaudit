#!/usr/bin/env node
import { constants } from 'node:fs';
import { parseArgs } from 'node:util';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkSubtitles, selectSubtitleText } from '../src/index.mjs';
import { renderReport } from '../src/render.mjs';

const help = `CueAudit — did subtitle cleanup change the details?\n\nUsage:\n  cueaudit demo [--format text|markdown|json]\n  cueaudit check ORIGINAL CANDIDATE [--protect TERMS.json] [--format text|markdown|json]\n  cueaudit guard ORIGINAL CANDIDATE --output NEW_FILE [--protect TERMS.json]\n\nInputs: UTF-8 SRT or WebVTT (auto-detected); <=2 MiB each.\n--protect: a JSON array of literal, case-sensitive phrases (up to 100).\ncheck: exit 0 no flags; 1 review needed; 2 invalid input or I/O failure.\nguard: writes the complete candidate when no flags, otherwise the complete original.\nIt refuses to overwrite an existing output. Exit 1 means original fallback was written.\nInvalid inputs exit 2 and are never written. No provider calls or transcript uploads.\nNo flags does not prove correctness, meaning preservation, or audio accuracy.\n`;

async function readUtf8(file, limit = 2 * 1024 * 1024) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw new Error();
    const buffer = Buffer.alloc(limit + 1);
    let total = 0;
    while (total <= limit) {
      const { bytesRead } = await handle.read(buffer, total, limit + 1 - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > limit) throw new Error();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0,total));
  } catch { throw new Error('Cannot read an input: use an existing regular UTF-8 file within the size limit.'); }
  finally { await handle?.close(); }
}
async function protectTerms(file) {
  if (!file) return [];
  try { return JSON.parse((await readUtf8(file, 64 * 1024)).replace(/^\uFEFF/,'')); }
  catch { throw new Error('Cannot read protected terms: use a UTF-8 JSON array in a file up to 64 KiB.'); }
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals:true, options:{ format:{type:'string'}, protect:{type:'string'}, output:{type:'string'}, help:{type:'boolean'}, version:{type:'boolean'} } });
  if (values.help || !positionals.length && !values.version) { console.log(help); return; }
  if (values.version) { console.log('0.1.2'); return; }
  const [command, originalFile, candidateFile] = positionals;
  if (!['check','guard','demo'].includes(command)) throw new Error('Unknown command. See --help.');
  const accepted = command === 'demo' ? ['format'] : command === 'guard' ? ['protect','output'] : ['protect','format'];
  if (Object.keys(values).some(key => !accepted.includes(key))) throw new Error('Option is not valid for this command. See --help.');
  const format = values.format ?? 'text';
  if (!['text','markdown','json'].includes(format)) throw new Error('Report format must be text, markdown, or json.');
  if (command === 'demo') {
    if (positionals.length !== 1) throw new Error('demo takes no file arguments.');
    const fixture = name => readFile(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)), 'utf8');
    const [original, clean, changed, terms] = await Promise.all(['original.srt','clean.srt','changed.srt','protect.json'].map(fixture));
    const protect = JSON.parse(terms);
    const result = { synthetic:true, note:'Invented subtitle examples, not measured cleanup or transcription quality.', clean:checkSubtitles(original,clean,{protect}), changed:checkSubtitles(original,changed,{protect}) };
    if (format === 'json') console.log(JSON.stringify(result,null,2));
    else { console.log('SYNTHETIC DEMO — invented subtitles, not performance evidence.\n\nPunctuation cleanup:\n'); process.stdout.write(renderReport(result.clean,format)); console.log('\nNumbers moved between cues, negation removed, protected name changed:\n'); process.stdout.write(renderReport(result.changed,format)); }
    return;
  }
  if (positionals.length !== 3) throw new Error('Provide ORIGINAL and CANDIDATE subtitle files.');
  if (command === 'guard' && !values.output) throw new Error('guard requires --output NEW_FILE.');
  const [original,candidate,protect] = await Promise.all([readUtf8(originalFile),readUtf8(candidateFile),protectTerms(values.protect)]);
  if (command === 'check') {
    const report = checkSubtitles(original,candidate,{protect});
    process.stdout.write(renderReport(report,format));
    process.exitCode = report.status === 'review' ? 1 : 0;
  } else {
    const result = selectSubtitleText(original,candidate,{protect});
    let output;
    try { output = await open(values.output,'wx',0o600); await output.writeFile(result.text,'utf8'); }
    catch { throw new Error('Cannot create output. Choose a new file in an existing writable directory; existing files are never overwritten.'); }
    finally { await output?.close(); }
    console.log(`Wrote complete ${result.selected}; ${result.report.summary.findings} findings. No flags is not proof of equivalent meaning.`);
    process.exitCode = result.selected === 'original' ? 1 : 0;
  }
}
main().catch(error => { console.error(`CueAudit: ${error.message}`); process.exitCode = 2; });
