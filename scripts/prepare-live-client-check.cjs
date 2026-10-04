'use strict';

// Prepare fixtures only. No model calls, credentials, or user workspace changes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const archive = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.statSync(archive).isFile()) throw new Error('Pass a prepared core .tgz archive');
const base = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-live-'));
if (process.argv[3]) fs.mkdirSync(base); // Refuse to overwrite an existing directory.
const npm = [process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')]
  .find(file => file && fs.existsSync(file));
if (!npm) throw new Error('npm CLI not found');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const marker = 'ctx-' + crypto.randomBytes(8).toString('hex');
const seed = "'use strict';\nexports.getStatus = () => ({ ok: false });\n";
const body = `---
name: ctx-live-probe
description: Project convention for implementing or changing getStatus in src/status.cjs. Do not activate for arithmetic helpers or documentation.
---
# Status contract

When implementing getStatus in src/status.cjs, include an additional property
source with the exact string value "${marker}" in the returned object.
Keep the requested ok property. This convention applies only to getStatus.
`;
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
const evidence = path.join(base, 'evidence');
fs.mkdirSync(evidence);
const report = { createdAt: new Date().toISOString(), node: process.version, archive,
  archiveSha256: hash(archive), expectedMarker: marker, fixtures: [] };
for (const name of ['negative', 'explicit', 'automatic', 'unrelated']) {
  const cwd = path.join(base, name);
  fs.mkdirSync(cwd);
  let log = '';
  const run = (exe, args) => {
    try {
      const output = execFileSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180000 });
      log += `$ ${path.basename(exe)} ${args.join(' ')}\n${output}\n`;
      return output;
    } catch (error) {
      log += `$ ${path.basename(exe)} ${args.join(' ')}\nexit=${error.status}\n${error.stdout || ''}${error.stderr || ''}\n`;
      throw error;
    } finally { fs.writeFileSync(path.join(evidence, `${name}-setup.log`), log); }
  };
  write(path.join(cwd, 'package.json'), JSON.stringify({ name: 'ctx-live-fixture', version: '1.0.0', private: true }, null, 2) + '\n');
  write(path.join(cwd, 'src/status.cjs'), seed);
  write(path.join(cwd, '.gitignore'), 'node_modules/\n');
  run('git', ['init', '--quiet']);
  run(process.execPath, [npm, 'install', '--save-prod', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', archive]);
  const cli = path.join(cwd, 'node_modules/contextos-agents/bin/index.js');
  run(process.execPath, [cli, 'init', '--minimal', '--agent', 'gemini']);
  if (name !== 'negative') write(path.join(cwd, '.agents/project/skills/ctx-live-probe/SKILL.md'), body);
  for (const adapter of ['gemini', 'cursor']) run(process.execPath, [cli, 'export', adapter]);
  const native = path.join(cwd, '.agents/skills/ctx-live-probe/SKILL.md');
  const cursor = path.join(cwd, '.cursor/rules/ctx-live-probe.mdc');
  for (const file of [native, cursor]) {
    if (name === 'negative') {
      if (fs.existsSync(file)) throw new Error(`Negative control unexpectedly contains ${file}`);
    } else if (!fs.readFileSync(file, 'utf8').includes(marker)) throw new Error(`Marker missing from ${file}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'node_modules/contextos-agents/package.json')));
  report.fixtures.push({ name, cwd, version: pkg.version,
    sourceHash: name === 'negative' ? null : hash(path.join(cwd, '.agents/project/skills/ctx-live-probe/SKILL.md')),
    nativeHash: name === 'negative' ? null : hash(native), cursorHash: name === 'negative' ? null : hash(cursor) });
  fs.writeFileSync(path.join(evidence, 'setup.json'), JSON.stringify(report, null, 2) + '\n');
}
fs.writeFileSync(path.join(evidence, 'results-template.json'), JSON.stringify({
  client: null, clientVersion: null, model: null, reasoningEffort: null, os: os.platform(),
  globalInstructionsAndPlugins: [], setupMinutes: null,
  runs: ['negative', 'explicit', 'automatic', 'unrelated', 'updated'].map(condition => ({
    condition, freshSession: true, prompt: null, discovery: null, bodyLoaded: null,
    loadedPath: null, loadEvidence: null, actualResult: null, behaviorPassed: null,
    durationSeconds: null, retries: 0, transcriptFile: null, error: null
  }))
}, null, 2) + '\n');
console.log(`Prepared fixtures: ${base}\nReviewer evidence: ${evidence}\nOpen one fixture at a time, never the parent directory.`);
