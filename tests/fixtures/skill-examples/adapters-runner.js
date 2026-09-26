/**
 * tests/fixtures/skill-examples/adapters-runner.js
 * Executable verification for adapters skill CLI commands and declarations.
 */

'use strict';

const assert = require('node:assert');
const { COMMAND_REGISTRY, isKnownCommand } = require('../../../bin/commands.js');

function verifyAdaptersSkillCommands() {
  const results = [];

  // Test 1: Verify 'export' command exists in the canonical registry
  assert.strictEqual(isKnownCommand('export'), true, "'export' must be a registered CLI command");
  const exportCmd = COMMAND_REGISTRY.export;
  assert.ok(exportCmd, 'Command export must exist');
  assert.match(exportCmd.usage, /contextos export/);
  results.push({ id: 'adapters:cli:export-registered', passed: true });

  // Test 2: Verify all 6 supported adapter targets are documented
  const supportedTargets = ['gemini', 'claude', 'cursor', 'copilot', 'aider', 'zed'];
  for (const target of supportedTargets) {
    assert.ok(exportCmd.description.includes(target) || exportCmd.usage.includes(target), `Target ${target} must be supported by export command`);
  }
  results.push({ id: 'adapters:cli:supported-targets', passed: true });

  return results;
}

module.exports = {
  verifyAdaptersSkillCommands,
};
