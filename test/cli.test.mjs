import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSubtitles, selectSubtitleText } from '@4onv/cueaudit';
import { renderReport } from '../src/render.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const bin = path.join(root,'bin/cueaudit.mjs');
const example = name => path.join(root,'examples',name);
function cli(args,cwd=root) {
  const env = {...process.env}; delete env.NODE_OPTIONS; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath,[bin,...args],{cwd,env,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  assert.ifError(result.error); return result;
}
test('a POSIX subtitle FIFO fails without waiting for a writer', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cueaudit-fifo-'));
  try {
    const fifo = path.join(directory, 'subtitle.srt');
    assert.equal(spawnSync('mkfifo', [fifo], { timeout: 5000 }).status, 0);
    const result = cli(['check', fifo, example('original.srt')]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /regular UTF-8 file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('synthetic demo demonstrates harmless cleanup and moved anchors',() => {
  const result = cli(['demo','--format','json']);
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.synthetic,true); assert.equal(report.clean.status,'no-flags'); assert.equal(report.changed.status,'review');
  assert.equal(report.changed.summary.matchedCues,3); assert.ok(report.changed.summary.findings>=4);
});
test('check exit codes distinguish review from invalid input, with machine-readable output',() => {
  const changed = cli(['check',example('original.srt'),example('changed.srt'),'--format','json','--protect',example('protect.json')]);
  assert.equal(changed.status,1,changed.stderr); assert.equal(JSON.parse(changed.stdout).status,'review');
  assert.equal(cli(['check',example('original.srt'),example('clean.srt')]).status,0);
  assert.equal(cli(['check','missing.srt',example('clean.srt')]).status,2);
  assert.equal(cli(['check',example('original.srt'),example('clean.srt'),'--format','html']).status,2);
});
test('guard writes complete fallback and never overwrites source or existing output',async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'cueaudit-cli-'));
  try {
    const original='\uFEFF'+(await readFile(example('original.srt'),'utf8')).replace(/\n/g,'\r\n');
    const source=path.join(directory,'original.srt'); await writeFile(source,original);
    const output=path.join(directory,'selected.srt');
    const guarded=cli(['guard',source,example('changed.srt'),'--output',output]);
    assert.equal(guarded.status,1,guarded.stderr); assert.equal(await readFile(output,'utf8'),original);
    assert.equal(cli(['guard',source,example('clean.srt'),'--output',output]).status,2);
    assert.equal(cli(['guard',source,example('clean.srt'),'--output',source]).status,2);
    assert.equal(await readFile(source,'utf8'),original); assert.equal(await readFile(output,'utf8'),original);
    const cleanOutput=path.join(directory,'clean.srt');
    assert.equal(cli(['guard',source,example('clean.srt'),'--output',cleanOutput]).status,0);
    assert.equal(await readFile(cleanOutput,'utf8'),await readFile(example('clean.srt'),'utf8'));
  } finally { await rm(directory,{recursive:true,force:true,maxRetries:3}); }
});
test('invalid UTF-8 or protected options cannot produce guard output',async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'cueaudit-invalid-'));
  try {
    const invalid=path.join(directory,'invalid.srt'); await writeFile(invalid,Buffer.from([0xff,0xfe,0x00]));
    const output=path.join(directory,'output.srt');
    assert.equal(cli(['guard',invalid,example('clean.srt'),'--output',output]).status,2);
    await assert.rejects(stat(output),{code:'ENOENT'});
    const terms=path.join(directory,'terms.json'); await writeFile(terms,'{"secret":"DO_NOT_ECHO"}');
    const result=cli(['check',example('original.srt'),example('clean.srt'),'--protect',terms]);
    assert.equal(result.status,2); assert.doesNotMatch(result.stderr,/DO_NOT_ECHO/);
  } finally { await rm(directory,{recursive:true,force:true,maxRetries:3}); }
});
test('public API returns exact selected text and does not bless unexamined semantics',async () => {
  const original=await readFile(example('original.srt'),'utf8');
  const candidate=await readFile(example('changed.srt'),'utf8');
  const result=selectSubtitleText(original,candidate); assert.equal(result.selected,'original'); assert.equal(result.text,original);
  const drift=original.replace('Keep','Destroy');
  assert.equal(checkSubtitles(original,drift).status,'no-flags'); // Documented blind spot, not semantic equivalence.
  assert.throws(()=>selectSubtitleText(original,''));
  assert.throws(()=>selectSubtitleText(original,original.replace('Project Orion','Project Apollo'),{protct:['Project Orion']}),/options accept/);
  assert.throws(()=>checkSubtitles(original,original,null),/options accept/);
});
test('Markdown reports escape hostile subtitle fragments and terminal controls',() => {
  const report={status:'review',summary:{matchedCues:1,changedCues:1,findings:1},findings:[{startMs:0,code:'test',message:'changed',details:{value:'<img src=x onerror=alert(1)> [click](https://evil.example)\u001b[31m'}}],limitations:[]};
  const markdown=renderReport(report,'markdown'); assert.doesNotMatch(markdown,/<img|\u001b|\[click\]\(https:/);
  assert.match(markdown,/&lt;img/); assert.doesNotMatch(renderReport(report,'text'),/\u001b/);
});
