/**
 * tests/install.test.js
 * Tests for bin/index.js — the main installer
 * Uses Node.js built-in test runner (node:test) — no dependencies needed
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'index.js');
const AGENTS_SOURCE = path.join(__dirname, '..', '.agents');

describe('bin/index.js — installer', () => {
  let tmpDir;
  let createdStubMcp = false;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koko-test-'));
    const sourceMcp = path.join(AGENTS_SOURCE, 'mcp');
    if (!fs.existsSync(sourceMcp)) {
      fs.mkdirSync(sourceMcp, { recursive: true });
      fs.writeFileSync(path.join(sourceMcp, 'server.mjs'), '// test stub\n');
      fs.writeFileSync(path.join(sourceMcp, 'runtime.py'), '# test stub\n');
      createdStubMcp = true;
    }
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (createdStubMcp) {
      try {
        fs.rmSync(path.join(AGENTS_SOURCE, 'mcp'), { recursive: true, force: true });
      } catch {}
    }
  });

  test('--version flag prints version', () => {
    const output = execSync(`node "${BIN_PATH}" --version`).toString().trim();
    assert.match(output, /\d+\.\d+\.\d+/, 'Should print a semver version');
  });

  test('--help flag prints usage', () => {
    const output = execSync(`node "${BIN_PATH}" --help`).toString();
    assert.ok(output.includes('Usage:'), 'Should include Usage section');
    assert.ok(output.includes('--dry-run'), 'Should list --dry-run flag');
    assert.ok(output.includes('--force'), 'Should list --force flag');
    assert.ok(output.includes('--with-mcp'), 'Should list --with-mcp flag');
    assert.ok(output.includes('setup-mcp'), 'Should list setup-mcp command');
  });

  test('--dry-run does not create .agents/ folder', () => {
    const targetAgents = path.join(tmpDir, 'dry-run-test', '.agents');
    const testDir = path.join(tmpDir, 'dry-run-test');
    fs.mkdirSync(testDir, { recursive: true });

    execSync(`node "${BIN_PATH}" --dry-run --skip-compile`, { cwd: testDir });

    assert.ok(!fs.existsSync(targetAgents), '.agents/ should NOT be created in dry-run mode');
  });

  test('installs .agents/ folder with required files (excluding mcp by default)', () => {
    const testDir = path.join(tmpDir, 'install-test');
    fs.mkdirSync(testDir, { recursive: true });

    execSync(`node "${BIN_PATH}" --skip-compile`, { cwd: testDir });

    const agentsDir = path.join(testDir, '.agents');
    assert.ok(fs.existsSync(agentsDir), '.agents/ should be created');
    assert.ok(fs.existsSync(path.join(agentsDir, 'AGENTS.md')), 'AGENTS.md should exist');
    assert.ok(fs.existsSync(path.join(agentsDir, 'skills.json')), 'skills.json should exist');
    assert.ok(fs.existsSync(path.join(agentsDir, 'ctx.js')), 'ctx.js should exist');
    assert.ok(!fs.existsSync(path.join(agentsDir, 'mcp')), 'mcp/ should NOT be installed by default');
    assert.ok(!fs.existsSync(path.join(agentsDir, 'mcp_config.json')), 'mcp_config.json should NOT be created by default');
  });


  test('refuses to overwrite an existing .agents/ folder without --force', () => {
    const testDir = path.join(tmpDir, 'preserve-existing-test');
    const existingAgents = path.join(testDir, '.agents');
    fs.mkdirSync(existingAgents, { recursive: true });
    const sentinel = path.join(existingAgents, 'custom-skill.md');
    fs.writeFileSync(sentinel, 'do not overwrite');

    assert.throws(
      () => execSync(`node "${BIN_PATH}" --skip-compile`, { cwd: testDir, stdio: 'pipe' }),
      'Installer should require --force when .agents/ already exists'
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'do not overwrite');
  });

  test('--force flag installs without warning output', () => {
    const testDir = path.join(tmpDir, 'force-test');
    const oldAgents = path.join(testDir, '.agents');
    fs.mkdirSync(oldAgents, { recursive: true });
    fs.writeFileSync(path.join(oldAgents, 'old-custom-file.txt'), 'old configuration');

    // Should not throw even though .agents/ exists
    const output = execSync(`node "${BIN_PATH}" --force --skip-compile`, {
      cwd: testDir,
    }).toString();

    assert.ok(!output.includes('Warning:'), '--force should suppress the warning');
    assert.ok(fs.existsSync(path.join(oldAgents, 'AGENTS.md')), 'Atomic replacement should install complete new content');
    assert.ok(!fs.existsSync(path.join(oldAgents, 'old-custom-file.txt')), 'Old content should not leak into replacement');
    assert.deepEqual(
      fs.readdirSync(testDir).filter(name => name.startsWith('.agents.backup') || name.startsWith('.agents.staging')),
      [],
      'Successful replacement should clean temporary backup and staging directories'
    );
  });

  test('--minimal flag installs only the 7 core essential skills', () => {
    const testDir = path.join(tmpDir, 'minimal-test');
    fs.mkdirSync(testDir, { recursive: true });

    execSync(`node "${BIN_PATH}" --minimal --skip-compile`, { cwd: testDir });

    const skillsDir = path.join(testDir, '.agents', 'core', 'skills');
    assert.ok(fs.existsSync(skillsDir), 'skills directory should exist');
    const installedSkills = fs.readdirSync(skillsDir);
    assert.equal(installedSkills.length, 7, 'Should install exactly 7 skills in minimal mode');
    const expected = ['engineering-workflow', 'gemini-precision', 'gstack-roles', 'ponytail-mindset', 'context-os', 'context-manager', 'security'];
    assert.deepEqual(installedSkills.sort(), expected.sort(), 'Installed skills must match 7 core essential skills');
  });

  test('contextos doctor runs successfully and outputs diagnostic report', () => {
    const output = execSync(`node "${BIN_PATH}" doctor`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('ContextOS Doctor'), 'Should print Doctor header');
    assert.ok(output.includes('Node.js'), 'Should report Node.js version');
    assert.ok(output.includes('Skills loaded:'), 'Should report loaded skills');
  });

  test('proxy commands delegate to ctx.js when in a project', () => {
    const output = execSync(`node "${BIN_PATH}" profile list`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('Available ContextOS Profiles:'), 'Should proxy profile list to ctx.js');
  });

  test('contextos stats runs successfully and outputs context savings report', () => {
    const output = execSync(`node "${BIN_PATH}" stats`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('Context Savings Report'), 'Should print stats header');
    assert.ok(output.includes('Full ('), 'Should report full token payload');
    assert.ok(output.includes('Savings'), 'Should report percentage savings');
  });

  test('contextos watch module initializes and closes cleanly', () => {
    const watchModule = require('../.agents/watch.js');
    const controller = watchModule.runWatch(path.join(__dirname, '..'), {
      exitOnSigint: false,
      debounceMs: 50,
    });
    assert.ok(typeof controller.close === 'function', 'Watcher should expose close() method');
    assert.ok(typeof controller.triggerRecompile === 'function', 'Watcher should expose triggerRecompile');
    controller.close();
  });

  test('package.json includes contextos in bin', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.bin.contextos, './bin/index.js', 'package.json must map "contextos" to ./bin/index.js');
  });

  test('direct node .agents/ctx.js doctor runs and outputs diagnostic report', () => {
    const ctxPath = path.join(__dirname, '..', '.agents', 'ctx.js');
    const output = execSync(`node "${ctxPath}" doctor`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('ContextOS Doctor'), 'Direct ctx.js doctor should print Doctor header');
    assert.ok(output.includes('Node.js'), 'Direct ctx.js doctor should report Node.js version');
  });

  test('direct node .agents/ctx.js stats runs and outputs context savings report', () => {
    const ctxPath = path.join(__dirname, '..', '.agents', 'ctx.js');
    const output = execSync(`node "${ctxPath}" stats`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('Context Savings Report'), 'Direct ctx.js stats should print report header');
  });

  test('direct node .agents/ctx.js init outputs initialization guide', () => {
    const ctxPath = path.join(__dirname, '..', '.agents', 'ctx.js');
    const output = execSync(`node "${ctxPath}" init`, { cwd: path.join(__dirname, '..') }).toString();
    assert.ok(output.includes('Initialization Guide'), 'Direct ctx.js init should print guide');
  });
});



