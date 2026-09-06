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

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koko-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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

  test('--with-mcp flag installs .agents/mcp and mcp_config.json', () => {
    const testDir = path.join(tmpDir, 'with-mcp-test');
    fs.mkdirSync(testDir, { recursive: true });

    execSync(`node "${BIN_PATH}" --with-mcp --skip-compile`, { cwd: testDir });

    const agentsDir = path.join(testDir, '.agents');
    assert.ok(fs.existsSync(agentsDir), '.agents/ should be created');
    assert.ok(fs.existsSync(path.join(agentsDir, 'mcp')), 'mcp/ should exist with --with-mcp');
    assert.ok(fs.existsSync(path.join(agentsDir, 'mcp_config.json')), 'mcp_config.json should exist with --with-mcp');
  });

  test('setup-mcp configures MCP in an existing .agents/ folder', () => {
    const testDir = path.join(tmpDir, 'setup-mcp-test');
    fs.mkdirSync(testDir, { recursive: true });

    // Step 1: Install without MCP
    execSync(`node "${BIN_PATH}" --skip-compile`, { cwd: testDir });
    const agentsDir = path.join(testDir, '.agents');
    assert.ok(!fs.existsSync(path.join(agentsDir, 'mcp')), 'mcp/ should not exist yet');

    // Step 2: Configure MCP
    const output = execSync(`node "${BIN_PATH}" setup-mcp`, { cwd: testDir }).toString();
    assert.ok(output.includes('Installed ContextOS MCP'), 'Should confirm MCP installation');
    assert.ok(fs.existsSync(path.join(agentsDir, 'mcp')), 'mcp/ should be installed after setup-mcp');
    assert.ok(fs.existsSync(path.join(agentsDir, 'mcp_config.json')), 'mcp_config.json should be created after setup-mcp');
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
});
