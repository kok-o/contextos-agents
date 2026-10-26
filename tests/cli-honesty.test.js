'use strict';

/**
 * Small contracts of the command line that earlier versions got wrong: what a
 * message promises must be what the exit code and the files say.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { runScan } = require('../bin/lib/scan.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');

test('--project targets diagnostics, fixes, and proxied exports without touching cwd', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-target-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'current project');
  const target = path.join(root, 'target project');
  const bin = path.resolve(__dirname, '../bin/index.js');
  for (const dir of [cwd, target]) {
    fs.mkdirSync(path.join(dir, '.agents/project/skills'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.agents/.contextos'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agents/.contextos/watch-error.json'), '{}');
  }
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'target-project', dependencies: { react: '19.0.0' } }));
  const run = (...args) => spawnSync(process.execPath, [bin, ...args, '--project', target, '--json'], { cwd, encoding: 'utf8' });
  const status = run('status');
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).projectDir, target);
  const detect = run('detect');
  assert.equal(detect.status, 0, detect.stderr);
  assert.equal(path.resolve(JSON.parse(detect.stdout).workspaceGraph.repositoryRoot), target);
  const doctor = run('doctor', '--fix');
  assert.doesNotThrow(() => JSON.parse(doctor.stdout), doctor.stderr);
  assert.equal(fs.existsSync(path.join(target, '.agents/.contextos/watch-error.json')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.agents/.contextos/watch-error.json')), true);
  assert.equal(fs.existsSync(path.join(cwd, '.agents/lockfile.v2.json')), false);
  const check = run('export', 'all', '--check');
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('--project without a value fails before diagnostics or mutations', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-missing-project-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const bin = path.resolve(__dirname, '../bin/index.js');
  const result = spawnSync(process.execPath, [bin, 'doctor', '--fix', '--project', '--json'], { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--project.*(?:path|value)/i);
});

test('export and export --check honor the same --target adapter set', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-export-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team rules\n---\nTeam policy');
  const bin = path.resolve(__dirname, '../bin/index.js');
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' });
  for (const target of ['cursor', 'cursor,claude']) {
    const exported = run('export', '--target', target);
    assert.equal(exported.status, 0, exported.stdout + exported.stderr);
    assert.equal(fs.existsSync(path.join(root, '.agents/skills/team/SKILL.md')), false, 'unselected Gemini output');
    const checked = run('export', '--target', target, '--check', '--json');
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  }
});

function gitProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-honesty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@contextos.dev'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# project\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

test('scan without --enforce does not claim a clean result when it found something', t => {
  const dir = gitProject(t);
  fs.writeFileSync(path.join(dir, '.env'), 'TOKEN=abc\n');
  execFileSync('git', ['add', '.env'], { cwd: dir });

  const advisory = runScan({ cwd: dir, enforce: false });
  assert.equal(advisory.code, 0, 'advisory mode never fails the commit');
  assert.ok(advisory.findings.length > 0);
  assert.match(advisory.message, /advisory/);
  assert.doesNotMatch(advisory.message, /cleanly|No violations/);

  const strict = runScan({ cwd: dir, enforce: true });
  assert.equal(strict.code, 1);
  assert.match(strict.message, /Blocking violations/);
});

test('scan reports a clean tree as clean', t => {
  const dir = gitProject(t);
  fs.writeFileSync(path.join(dir, 'notes.md'), 'nothing secret\n');
  execFileSync('git', ['add', 'notes.md'], { cwd: dir });
  const clean = runScan({ cwd: dir, enforce: false });
  assert.equal(clean.findings.length, 0);
  assert.match(clean.message, /No violations/);
});

test('a configuration error in the drift report carries a status like every other outcome', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-honesty-drift-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = detectDrift(dir, 'no-such-adapter');
  assert.equal(report.status, 'error');
  assert.equal(report.code, 2);
  assert.equal(report.schemaVersion, '2.0.0');
});

test('skill add passes --allow-floating to the pinning check instead of ignoring it', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-honesty-float-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.agents', 'project', 'skills'), { recursive: true });
  const ctx = path.resolve(__dirname, '..', '.agents', 'ctx.js');

  const plain = spawnSync(process.execPath, [ctx, 'skill', 'add', 'someone/somerepo'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  assert.notEqual(plain.status, 0);
  assert.match(plain.stdout + plain.stderr, /must be pinned to an exact 40-character commit SHA/);

  // With the flag the pinning check passes and the install reaches the fetch. The network is replaced by
  // a preload that fails every request, so the test stays offline.
  const preload = path.join(dir, 'no-network.cjs');
  fs.writeFileSync(preload, [
    "const https = require('https');",
    "const { EventEmitter } = require('events');",
    "https.get = () => { const req = new EventEmitter(); req.setTimeout = () => req; req.destroy = () => {};",
    "  process.nextTick(() => req.emit('error', new Error('network disabled in test'))); return req; };",
  ].join('\n'));
  const floating = spawnSync(process.execPath, [ctx, 'skill', 'add', 'someone/somerepo', '--allow-floating'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload)}` },
  });
  const output = floating.stdout + floating.stderr;
  assert.doesNotMatch(output, /must be pinned to an exact 40-character commit SHA/);
  assert.match(output, /Fetching: https:\/\/raw\.githubusercontent\.com\/someone\/somerepo/);
});

test('doctor verifies the installed package and never executes modules found in the project', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-honesty-doctor-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, 'project-code-ran');
  for (const rel of ['resolver/canonical-resolver.js', 'rules/rule-catalog.js', 'compiler/manifest-compiler.js']) {
    const file = path.join(dir, '.agents', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n`);
  }
  const bin = path.resolve(__dirname, '..', 'bin', 'index.js');
  const result = spawnSync(process.execPath, [bin, 'doctor'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(fs.existsSync(marker), false, 'doctor executed a module from the project');
  assert.match(result.stdout, /package modules verified/);
});
