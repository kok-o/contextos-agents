'use strict';

// Run the root suite without compiling or loading the separate MCP package.
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
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
const env = { ...process.env, CONTEXTOS_CORE_ONLY_TESTS: '1' };
// The action tests exercise Bash. Prefer Git Bash over the Windows WSL shim,
// which may exist even when no WSL distribution is installed.
if (process.platform === 'win32') {
  try {
    const gitPaths = execFileSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
    const bash = gitPaths.flatMap(file => [path.join(path.dirname(file), 'bash.exe'), path.resolve(path.dirname(file), '../bin/bash.exe')]).find(file => fs.existsSync(file));
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
    if (bash) env[pathKey] = `${path.dirname(bash)}${path.delimiter}${env[pathKey] || ''}`;
  } catch { /* A missing Bash remains a visible test failure. */ }
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root, stdio: 'inherit', env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
