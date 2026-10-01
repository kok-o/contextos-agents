'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { mutate } = require('./cases');
const { ORACLES } = require('./oracles');

const ROOT = path.resolve(__dirname, '../..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function createFixture(parent, task, { faulty = true, sources } = {}) {
  parent = path.resolve(parent);
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'fixture-'));
  const files = [task.file, ...task.dependencies];
  const provenance = [];
  for (const file of files) {
    const original = sources?.[file] ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    const content = faulty && file === task.file ? mutate(original, task) : original;
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
    provenance.push({ file, originalSha256: hash(original), fixtureSha256: hash(content) });
  }
  return { root, files, editable: task.file, provenance };
}

function fixturePath(fixture, file, write = false) {
  if (typeof file !== 'string' || !fixture.files.includes(file) || (write && file !== fixture.editable)) throw new Error('File is outside the tool allowlist');
  const target = path.resolve(fixture.root, file);
  const relative = path.relative(fs.realpathSync(fixture.root), fs.realpathSync(target));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Fixture containment failed');
  return target;
}

function runTool(fixture, name, args) {
  if (name === 'read_file') return fs.readFileSync(fixturePath(fixture, args.path), 'utf8');
  if (name === 'edit_file') {
    const target = fixturePath(fixture, args.path, true);
    if (typeof args.old_text !== 'string' || !args.old_text || typeof args.new_text !== 'string') throw new Error('Edit requires nonempty exact old_text and new_text');
    const source = fs.readFileSync(target, 'utf8');
    if (source.split(args.old_text).length !== 2) throw new Error('old_text must match exactly once');
    const updated = source.replace(args.old_text, () => args.new_text);
    if (Buffer.byteLength(updated) > 100000) throw new Error('File size limit exceeded');
    fs.writeFileSync(target, updated); return 'Edit applied.';
  }
  if (name === 'check_syntax') {
    new vm.Script(fs.readFileSync(fixturePath(fixture, args.path), 'utf8'), { filename: args.path });
    return 'JavaScript syntax is valid. Behavioral acceptance tests are private and run after the attempt.';
  }
  throw new Error('Unknown tool');
}

function evaluate(fixture, task, { oracle = ORACLES[task.group], timeoutMs = 8000 } = {}) {
  const permission = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  if (!process.allowedNodeEnvironmentFlags.has(permission)) throw new Error('Node permission isolation is required');
  const dataRoot = fs.mkdtempSync(path.join(path.dirname(fixture.root), 'test-data-'));
  const worker = path.join(__dirname, 'worker.cjs');
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  return new Promise(resolve => {
    const child = spawn(process.execPath, [permission, `--allow-fs-read=${worker}`, `--allow-fs-read=${fixture.root}`, `--allow-fs-read=${dataRoot}`, `--allow-fs-write=${dataRoot}`, '--disallow-code-generation-from-strings', '--max-old-space-size=128', worker], {
      cwd: dataRoot, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '', error = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 20000) child.kill(); });
    child.stderr.on('data', chunk => { error += chunk; if (error.length > 20000) child.kill(); });
    child.stdin.on('error', () => {});
    child.on('error', failure => { error += failure.message; });
    child.on('close', code => {
      clearTimeout(timer);
      fs.rmSync(dataRoot, { recursive: true, force: true });
      if (expired || code !== 0) return resolve({ passed: false, infrastructureError: true, error: expired ? 'Worker timeout' : error.slice(0, 2000), exitCode: code });
      try { resolve({ ...JSON.parse(output), exitCode: code }); }
      catch { resolve({ passed: false, infrastructureError: true, error: 'Invalid worker result', exitCode: code }); }
    });
    child.stdin.end(JSON.stringify({ fixture: fixture.root, file: task.file, files: fixture.files, dataRoot, oracle }));
  });
}

async function validateControls(parent, tasks, sources) {
  const results = [];
  for (const task of tasks) {
    const gold = createFixture(parent, task, { faulty: false, sources });
    const faulty = createFixture(parent, task, { sources });
    const positive = await evaluate(gold, task);
    const negative = await evaluate(faulty, task);
    const valid = positive.passed && !negative.passed && !negative.infrastructureError;
    results.push({ taskId: task.id, valid, positive, negative, provenance: faulty.provenance });
    fs.rmSync(gold.root, { recursive: true, force: true });
    fs.rmSync(faulty.root, { recursive: true, force: true });
  }
  return results;
}

module.exports = { ROOT, hash, createFixture, fixturePath, runTool, evaluate, validateControls };
