import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli || !path.isAbsolute(npmCli)) throw new Error('Run with npm run test:package.');
const directory = await mkdtemp(path.join(tmpdir(), 'cueaudit-package-'));
const env = { ...process.env, npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' };
delete env.NODE_TEST_CONTEXT; delete env.NODE_OPTIONS;
function run(file, args, cwd = directory, allowedCodes = [0]) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.ok(allowedCodes.includes(result.status), `Command failed: ${args[0]}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
try {
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const result = JSON.parse(run(npmCli, ['pack','--json','--ignore-scripts','--pack-destination',directory], root));
  const packed = Array.isArray(result) ? result[0] : result[metadata.name];
  assert.equal(packed?.name, metadata.name); assert.equal(path.basename(packed.filename),packed.filename);
  for (const file of ['src/index.mjs','src/subtitles.mjs','src/audit.mjs','docs/checks.md','SECURITY.md','CONTRIBUTING.md','examples/original.srt']) assert.ok(packed.files.some(entry=>entry.path===file),`Missing packed file: ${file}`);
  const prefix = path.join(directory,'installed');
  run(npmCli,['install','--prefix',prefix,'--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',path.join(directory,packed.filename)]);
  const installed = path.join(prefix,'node_modules',...metadata.name.split('/'));
  const bin = path.join(installed,'bin/cueaudit.mjs');
  const fixture = name => path.join(installed,'examples',name);
  assert.equal(run(bin,['--version']).trim(),metadata.version);
  assert.ok((await stat(path.join(prefix,'node_modules/.bin',process.platform==='win32'?'cueaudit.cmd':'cueaudit'))).isFile());
  const demo = JSON.parse(run(bin,['demo','--format','json']));
  assert.equal(demo.synthetic,true); assert.equal(demo.clean.status,'no-flags'); assert.equal(demo.changed.status,'review');
  const report = JSON.parse(run(bin,['check',fixture('original.srt'),fixture('changed.srt'),'--format','json'],directory,[1]));
  assert.equal(report.status,'review');
  const output = path.join(directory,'selected.srt');
  run(bin,['guard',fixture('original.srt'),fixture('changed.srt'),'--output',output],directory,[1]);
  assert.equal(await readFile(output,'utf8'),await readFile(fixture('original.srt'),'utf8'));
  console.log(`Package smoke passed: ${metadata.name}@${metadata.version}; offline install, bin, demo, check, and complete-original fallback.`);
} finally {
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('cueaudit-package-'));
  await rm(resolved,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
