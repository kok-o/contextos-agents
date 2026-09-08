/**
 * tests/cli-registry.test.js
 * Tests for bin/commands.js and bin/index.js command routing & --json output
 * Uses Node.js built-in test runner (node:test) — zero external dependencies
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { COMMAND_REGISTRY, getCommand, isKnownCommand, getStatus } = require('../bin/commands.js');
const { detectProjectAttributes } = require('../bin/lib/detector.js');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'index.js');
const ROOT_DIR = path.join(__dirname, '..');

describe('bin/commands.js — CLI Command Registry & Status', () => {
  test('COMMAND_REGISTRY declares all required ContextOS commands', () => {
    const requiredCommands = [
      'init', 'status', 'update', 'uninstall', 'doctor',
      'validate', 'audit', 'export', 'profile', 'resolve',
      'stats', 'watch', 'detect', 'install-skill', 'skill',
      'setup-mcp', 'clean-worktrees',
    ];

    for (const cmd of requiredCommands) {
      assert.ok(COMMAND_REGISTRY[cmd], `COMMAND_REGISTRY must declare '${cmd}'`);
      assert.ok(COMMAND_REGISTRY[cmd].description, `'${cmd}' must have a description`);
      assert.ok(COMMAND_REGISTRY[cmd].usage, `'${cmd}' must have usage instructions`);
    }
  });

  test('getCommand finds commands by name and alias', () => {
    const initCmd = getCommand('init');
    assert.ok(initCmd, 'Should find init command');
    assert.equal(initCmd.name, 'init');

    const auditCmd = getCommand('audit');
    assert.ok(auditCmd, 'Should find audit command');
    assert.equal(auditCmd.name, 'validate'); // alias resolved to validate
  });

  test('isKnownCommand returns true for canonical commands and false for unknown', () => {
    assert.ok(isKnownCommand('init'));
    assert.ok(isKnownCommand('status'));
    assert.ok(isKnownCommand('update'));
    assert.ok(isKnownCommand('doctor'));
    assert.ok(isKnownCommand('audit')); // alias
    assert.equal(isKnownCommand('non-existent-command-xyz'), false);
  });

  test('getStatus returns structured metadata for current project', () => {
    const status = getStatus(ROOT_DIR);
    assert.equal(status.package, 'contextos-agents');
    assert.ok(status.version, 'Should report semver version');
    assert.equal(status.initialized, true);
    assert.ok(typeof status.skillsCount === 'number');
    assert.ok(status.skillsCount >= 24);
    assert.equal(typeof status.mcpInstalled, 'boolean');
    assert.equal(status.mcpInstalled, fs.existsSync(path.join(ROOT_DIR, '.agents', 'mcp', 'server.mjs')));
    assert.ok(Array.isArray(status.compiledAdapters));
  });

  test('detectProjectAttributes detects stack and active IDE configurations', () => {
    const report = detectProjectAttributes(ROOT_DIR);
    assert.ok(report.stack, 'Should contain stack detection');
    assert.ok(report.ide, 'Should contain IDE detection');
    assert.ok(Array.isArray(report.ide.detected));
    assert.ok(Array.isArray(report.ide.recommendedAgents));
    assert.ok(report.ide.recommendedAgents.includes('gemini'));
  });
});

describe('bin/index.js — CLI dispatch & flags', () => {
  test('--help includes standardized npx contextos-agents syntax and commands', () => {
    const output = execSync(`node "${BIN_PATH}" --help`).toString();
    assert.ok(output.includes('npx contextos-agents init'), 'Usage must document npx contextos-agents init');
    assert.ok(output.includes('status'), 'Commands list must include status');
    assert.ok(output.includes('--json'), 'Options list must include --json');
    assert.ok(output.includes('--agent'), 'Options list must include --agent');
  });

  test('contextos status outputs human-readable status', () => {
    const output = execSync(`node "${BIN_PATH}" status`, { cwd: ROOT_DIR }).toString();
    assert.ok(output.includes('ContextOS Project Status'), 'Should include status banner');
    assert.ok(output.includes('Skills Installed'), 'Should list skills count');
    assert.ok(output.includes('MCP Server'), 'Should report MCP server status');
  });

  test('contextos status --json outputs parseable JSON', () => {
    const raw = execSync(`node "${BIN_PATH}" status --json`, { cwd: ROOT_DIR }).toString();
    const parsed = JSON.parse(raw);
    assert.equal(parsed.package, 'contextos-agents');
    assert.equal(parsed.initialized, true);
    assert.ok(parsed.skillsCount >= 24);
    assert.equal(typeof parsed.mcpInstalled, 'boolean');
    assert.equal(parsed.mcpInstalled, fs.existsSync(path.join(ROOT_DIR, '.agents', 'mcp', 'server.mjs')));
  });

  test('contextos detect --json outputs structured detection result', () => {
    const raw = execSync(`node "${BIN_PATH}" detect --json`, { cwd: ROOT_DIR }).toString();
    const parsed = JSON.parse(raw);
    assert.ok(parsed.summary, 'Should contain summary');
    assert.ok(parsed.summary.recommendedProfile, 'Should recommend profile');
    assert.ok(Array.isArray(parsed.summary.recommendedAgents));
  });

  test('unknown command exits with code 1 and prints helpful error', () => {
    assert.throws(
      () => execSync(`node "${BIN_PATH}" unknown-dummy-command`, { cwd: ROOT_DIR, stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const stderr = err.stderr.toString();
        assert.ok(stderr.includes('[ERROR] Unknown command: unknown-dummy-command'));
        assert.ok(stderr.includes('--help'));
        return true;
      }
    );
  });

  test('unknown command with --json exits with code 1 and prints JSON error', () => {
    assert.throws(
      () => execSync(`node "${BIN_PATH}" unknown-dummy-command --json`, { cwd: ROOT_DIR, stdio: 'pipe' }),
      (err) => {
        assert.equal(err.status, 1);
        const stderr = err.stderr.toString();
        const parsed = JSON.parse(stderr);
        assert.equal(parsed.code, 1);
        assert.ok(parsed.error.includes('unknown-dummy-command'));
        return true;
      }
    );
  });

  test('init --dry-run --json outputs structured preview with detected attributes', () => {
    const raw = execSync(`node "${BIN_PATH}" init --dry-run --agent auto --json`, { cwd: ROOT_DIR }).toString();
    const parsed = JSON.parse(raw);
    assert.equal(parsed.dryRun, true);
    assert.ok(parsed.filesCount > 0);
    assert.ok(Array.isArray(parsed.targetAgents));
    assert.ok(parsed.targetAgents.length > 0);
  });
});
