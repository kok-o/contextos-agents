'use strict';

// Exercise the documented checkpoint rollback against a real previous npm archive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const previous = path.resolve(process.argv[2] || 'scratch/r2-previous/contextos-agents-2.2.0.tgz');
const candidate = path.resolve(process.argv[3] || `scratch/release-candidate/contextos-agents-${require('../package.json').version}.tgz`);
const previousMcp = path.resolve(process.argv[4] || 'scratch/r2-previous/contextos-mcp-0.3.1.tgz');
const candidateMcp = path.join(path.dirname(candidate), `contextos-mcp-${require('../contextos-mcp/package.json').version}.tgz`);
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
assert.ok(fs.existsSync(npm), 'Run through npm run check:migration');
for (const archive of [previous, candidate, previousMcp, candidateMcp]) assert.ok(fs.existsSync(archive), `Missing archive: ${archive}`);
function archiveIdentity(archive, names) {
  const pkg = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8', windowsHide: true }));
  assert.ok(names.includes(pkg.name), `Unexpected package in ${archive}: ${pkg.name}`);
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/);
  return { name: pkg.name, version: pkg.version };
}
const previousCoreIdentity = archiveIdentity(previous, ['contextos-agents']);
const previousMcpIdentity = archiveIdentity(previousMcp, ['@contextos/mcp', 'contextos-mcp']);
const candidateMcpIdentity = archiveIdentity(candidateMcp, ['contextos-mcp']);
fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-migration-consumer-space '));
const checkpoint = path.join(consumer, 'checkpoint');
const configPaths = ['.agents', '.cursor', 'AGENTS.md', 'CLAUDE.md', '.github', '.aider.conf.yml', 'CONVENTIONS.md', '.zed', 'GEMINI.md'];
const env = { ...process.env, NO_COLOR: '1', npm_config_cache: path.join(root, 'scratch/consumer-npm-cache') };
delete env.NODE_PATH;
const steps = [];
// Windows npm ci removes/reinstalls hundreds of dependency files during rollback.
// Keep CLI checks strict while allowing bounded filesystem/network time for npm.
const npmTimeoutMs = process.platform === 'win32' ? 600000 : 180000;
function run(exe, args, timeoutMs = 180000) {
  const command = [exe, ...args];
  const started = Date.now();
  try {
    const output = execFileSync(exe, args, { cwd: consumer, env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
    steps.push({ command, exitCode: 0, durationMs: Date.now() - started, timeoutMs, output });
    return output;
  } catch (error) {
    steps.push({ command, exitCode: error.status, durationMs: Date.now() - started, timeoutMs, output: `${error.stdout || ''}${error.stderr || ''}` });
    throw error;
  }
}
function install(archive) { run(process.execPath, [npm, 'install', '--save-dev', '--no-audit', '--no-fund', '--ignore-scripts', archive], npmTimeoutMs); }
function cli(...args) { return run(process.execPath, [path.join(consumer, 'node_modules/contextos-agents/bin/index.js'), ...args]); }
function verifyInstalled(identity) {
  const installed = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules', identity.name, 'package.json')));
  assert.equal(installed.name, identity.name);
  assert.equal(installed.version, identity.version);
}
function write(file, body) {
  fs.mkdirSync(path.dirname(path.join(consumer, file)), { recursive: true });
  fs.writeFileSync(path.join(consumer, file), body);
}
function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink: ${file}`);
    if (entry.isDirectory()) Object.assign(result, hashes(file, rel + '/'));
    else result[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return result;
}
function configHashes() {
  const result = {};
  for (const rel of configPaths) {
    const file = path.join(consumer, rel);
    if (!fs.existsSync(file)) continue;
    if (fs.statSync(file).isDirectory()) Object.assign(result, hashes(file, rel + '/'));
    else result[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  return result;
}
let result;
try {
  write('package.json', JSON.stringify({ name: 'migration-consumer', version: '1.0.0', private: true }));
  write('AGENTS.md', '# User rules\nUSER_AGENTS_KEEP\n');
  write('CLAUDE.md', '# User rules\nUSER_CLAUDE_KEEP\n');
  write('.cursor/rules/team.mdc', 'USER_CURSOR_KEEP\n');
  run('git', ['init', '-q']);
  install(previous);
  install(previousMcp);
  verifyInstalled(previousMcpIdentity);
  const previousVersion = JSON.parse(cli('--version', '--json')).version;
  assert.equal(previousVersion, previousCoreIdentity.version);
  cli('init', '--minimal');
  cli('skill', 'override', 'engineering-workflow');
  fs.appendFileSync(path.join(consumer, '.agents/project/skills/engineering-workflow/SKILL.md'), '\nUSER_OVERRIDE_KEEP\n');
  fs.cpSync(path.join(root, 'examples/quickstart/team-order'), path.join(consumer, '.agents/project/skills/team-order'), { recursive: true });
  cli('compile');
  cli('export', 'all');
  // 2.2.0 normalizes Aider YAML on its second export. Check the baseline before upgrade.
  cli('export', 'all');
  assert.equal(JSON.parse(cli('export', 'all', '--check', '--json')).hasDrift, false);
  const before = configHashes();
  fs.mkdirSync(checkpoint);
  for (const rel of [...configPaths, 'package.json', 'package-lock.json']) {
    const file = path.join(consumer, rel);
    if (fs.existsSync(file)) fs.cpSync(file, path.join(checkpoint, rel), { recursive: true });
  }
  install(candidate);
  install(candidateMcp);
  verifyInstalled(candidateMcpIdentity);
  cli('update');
  cli('compile');
  cli('export', 'all');
  assert.equal(JSON.parse(cli('export', 'all', '--check', '--json')).hasDrift, false);
  for (const rel of ['AGENTS.md', '.cursor/rules/team.mdc', '.agents/project/skills/engineering-workflow/SKILL.md', '.agents/project/skills/team-order/SKILL.md']) {
    assert.equal(configHashes()[rel], before[rel], `Upgrade changed user rule: ${rel}`);
  }
  assert.ok(fs.readFileSync(path.join(consumer, 'CLAUDE.md'), 'utf8').includes('USER_CLAUDE_KEEP'));
  const candidateVersion = JSON.parse(cli('--version', '--json')).version;
  assert.equal(candidateVersion, require('../package.json').version);
  run(process.execPath, [path.join(__dirname, 'check-installed-mcp.cjs'), consumer]);
  // Preserve the entire upgraded configuration for manual reconciliation of later edits.
  const upgraded = path.join(consumer, 'upgraded-config');
  fs.mkdirSync(upgraded);
  for (const rel of configPaths) {
    const file = path.join(consumer, rel);
    if (fs.existsSync(file)) fs.renameSync(file, path.join(upgraded, rel));
    if (fs.existsSync(path.join(checkpoint, rel))) fs.cpSync(path.join(checkpoint, rel), file, { recursive: true });
  }
  for (const rel of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(checkpoint, rel), path.join(consumer, rel));
  run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], npmTimeoutMs);
  assert.equal(JSON.parse(cli('--version', '--json')).version, previousVersion);
  verifyInstalled(previousMcpIdentity);
  assert.deepEqual(configHashes(), before, 'Rollback must restore every configuration byte');
  assert.equal(JSON.parse(cli('export', 'all', '--check', '--json')).hasDrift, false);
  result = { result: 'PASS', previousVersion, candidateVersion, previousMcp: previousMcpIdentity, candidateMcp: candidateMcpIdentity,
    platform: process.platform, node: process.version,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    rollback: 'checkpoint + previous package-lock + npm ci', configurationFilesRestored: Object.keys(before).length,
    userRulesPreserved: true, consumerPath: consumer };
} catch (error) {
  result = { result: 'FAIL', consumerPath: consumer, error: error.message };
  process.exitCode = 1;
}
result.archives = [previous, candidate, previousMcp, candidateMcp].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
result.steps = steps;
fs.writeFileSync(path.join(root, 'scratch/release-migration-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, steps: undefined }, null, 2));
