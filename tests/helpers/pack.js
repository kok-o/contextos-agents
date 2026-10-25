'use strict';

/**
 * Test helper: pack the repository into a temporary directory (never into the
 * repository root, which may hold a release archive) and extract it without
 * passing a drive-letter path to GNU tar as the archive operand.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Run npm without a shell: through its own script when it is known, else the platform launcher. */
function runNpm(args, options = {}) {
  const script = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)
    ? process.env.npm_execpath
    : [
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ].find(candidate => fs.existsSync(candidate));
  const base = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options };
  return script
    ? spawnSync(process.execPath, [script, ...args], base)
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { ...base, shell: process.platform === 'win32' });
}

function packRepository(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const result = runNpm(['pack', '--ignore-scripts', '--pack-destination', destination], { cwd: REPO_ROOT });
  if (result.status !== 0) throw new Error(`npm pack failed: ${result.stdout}\n${result.stderr}`);
  const fileName = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop().trim();
  const archive = path.join(destination, fileName);
  if (!fs.existsSync(archive)) throw new Error(`npm pack did not create ${archive}`);
  return archive;
}

function extractArchive(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  // Relative archive operand + cwd: GNU tar treats "C:\..." as a remote host.
  execFileSync('tar', ['-xzf', path.basename(archive), '-C', destination], {
    cwd: path.dirname(archive),
    stdio: 'pipe',
  });
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

module.exports = { REPO_ROOT, packRepository, extractArchive, makeTempDir, runNpm };
