'use strict';

// Run the root suite without compiling or loading the separate MCP package.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const scheduled = require('../package.json').scripts.test.split(/\s+/).filter(arg => arg.startsWith('tests/'));
const mcpSuites = new Set([
  'tests/resolver-parity.test.js',
  'tests/runtime-state-machine.test.js',
  'tests/sandbox-execution.test.js',
  'tests/transactional-git.test.js',
  'tests/verification-reviewer-pipeline.test.js',
]);
const files = scheduled.filter(file => !mcpSuites.has(file));
console.log('Core-only tests exclude MCP source suites: ' + [...mcpSuites].join(', '));
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root, stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
