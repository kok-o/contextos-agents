/**
 * bin/commands/hook.js
 * ContextOS Git Hook Installer & Lifecycle Manager
 *
 * Safely installs and uninstalls the pre-commit governance hook.
 * Preserves pre-existing user hooks, supports core.hooksPath and worktrees,
 * and operates idempotently.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findHooksDir } = require('../lib/git-snapshot.js');

const HOOK_MARKER_START = '# BEGIN CONTEXTOS HOOK';
const HOOK_MARKER_END = '# END CONTEXTOS HOOK';

const HOOK_PAYLOAD = `${HOOK_MARKER_START}
CTX_SCOPE_ARG=""
if [ -f ".agents/task-scope.json" ]; then
  CTX_SCOPE_ARG="--scope .agents/task-scope.json"
fi

if [ -f "./node_modules/.bin/contextos" ]; then
  ./node_modules/.bin/contextos scan --staged --enforce --placeholders $CTX_SCOPE_ARG
  CTX_STATUS=$?
elif [ -f "./node_modules/.bin/contextos-agents" ]; then
  ./node_modules/.bin/contextos-agents scan --staged --enforce --placeholders $CTX_SCOPE_ARG
  CTX_STATUS=$?
elif [ -f "./bin/index.js" ] && [ -f "./package.json" ]; then
  node ./bin/index.js scan --staged --enforce --placeholders $CTX_SCOPE_ARG
  CTX_STATUS=$?
else
  echo "[ERROR] ContextOS local runner not found. Install locally (npm i -D contextos-agents) before committing." >&2
  exit 2
fi

if [ $CTX_STATUS -ne 0 ]; then
  exit $CTX_STATUS
fi
${HOOK_MARKER_END}`;

function installHook(cwd = process.cwd()) {
  const hooksDir = findHooksDir(cwd);

  if (!hooksDir) {
    console.error('[ERROR] Not a Git repository or Git hooks directory not found.');
    process.exit(1);
  }

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookFile = path.join(hooksDir, 'pre-commit');

  if (fs.existsSync(hookFile)) {
    const existing = fs.readFileSync(hookFile, 'utf8');

    // Validate shebang if present
    const shebangMatch = existing.match(/^#!([^\r\n]+)/);
    if (shebangMatch) {
      const interpreter = shebangMatch[1].toLowerCase();
      const isShell = /\b(sh|bash|zsh|dash)\b/.test(interpreter);
      if (!isShell) {
        console.error(`[ERROR] Pre-commit hook uses non-shell interpreter (${shebangMatch[0]}). ContextOS pre-commit hook requires POSIX shell.`);
        process.exit(1);
      }
    }

    // Strip any existing ContextOS block (e.g. legacy trailing block from v2.1.0)
    const stripped = existing.includes(HOOK_MARKER_START)
      ? existing.replace(new RegExp(`\\n?${HOOK_MARKER_START}[\\s\\S]*?${HOOK_MARKER_END}\\n?`, 'g'), '').trim()
      : existing.trim();

    // Place HOOK_PAYLOAD right after shebang so it runs first and cannot be bypassed by user 'exit 0'
    let updated;
    const strippedShebangMatch = stripped.match(/^#!.*(?:\r?\n|$)/);
    if (strippedShebangMatch) {
      const shebang = strippedShebangMatch[0];
      const rest = stripped.slice(shebang.length).trim();
      const sep = rest ? '\n\n' : '\n';
      updated = `${shebang.trimEnd()}\n\n${HOOK_PAYLOAD}${sep}${rest}`;
    } else {
      updated = `#!/bin/sh\n\n${HOOK_PAYLOAD}${stripped ? `\n\n${stripped}` : ''}`;
    }

    fs.writeFileSync(hookFile, updated.trimEnd() + '\n', 'utf8');
    console.log(`✓ ContextOS pre-commit hook installed in ${hookFile}`);
  } else {
    // Fresh hook installation with shebang
    const fresh = `#!/bin/sh\n\n${HOOK_PAYLOAD}\n`;
    fs.writeFileSync(hookFile, fresh, 'utf8');
    console.log(`✓ ContextOS pre-commit hook installed in ${hookFile}`);
  }

  try {
    fs.chmodSync(hookFile, 0o755);
  } catch {
    // Best effort on platforms that do not support POSIX file modes
  }
}

function uninstallHook(cwd = process.cwd()) {
  const hooksDir = findHooksDir(cwd);

  if (!hooksDir) {
    console.error('[ERROR] Not a Git repository or Git hooks directory not found.');
    process.exit(1);
  }

  const hookFile = path.join(hooksDir, 'pre-commit');

  if (!fs.existsSync(hookFile)) {
    console.log('✓ No pre-commit hook found to uninstall.');
    return;
  }

  const existing = fs.readFileSync(hookFile, 'utf8');

  if (!existing.includes(HOOK_MARKER_START)) {
    console.log('✓ No ContextOS hook block detected in pre-commit hook.');
    return;
  }

  // Remove exclusively the ContextOS demarcated block
  const regex = new RegExp(`\\n?${HOOK_MARKER_START}[\\s\\S]*?${HOOK_MARKER_END}\\n?`, 'g');
  const remaining = existing.replace(regex, '').trim();

  // If file contains only shebang or is empty, remove it completely
  if (!remaining || remaining === '#!/bin/sh' || remaining === '#!/bin/bash') {
    fs.unlinkSync(hookFile);
    console.log(`✓ ContextOS pre-commit hook uninstalled and empty ${hookFile} removed.`);
  } else {
    // Preserve remaining user scripts
    fs.writeFileSync(hookFile, remaining + '\n', 'utf8');
    console.log(`✓ ContextOS block removed from ${hookFile}; user commands preserved.`);
  }
}

function hookCommand(args, flags) {
  const subCommand = args[1] ? args[1].toLowerCase().trim() : null;

  if (subCommand === 'install') {
    installHook(process.cwd());
    process.exit(0);
  } else if (subCommand === 'uninstall') {
    uninstallHook(process.cwd());
    process.exit(0);
  } else {
    console.log('\nUsage: contextos hook <install|uninstall>\n');
    console.log('Commands:');
    console.log('  install    Safely install pre-commit quality gate hook');
    console.log('  uninstall  Remove ContextOS block while preserving custom hooks\n');
    process.exit(1);
  }
}

module.exports = {
  installHook,
  uninstallHook,
  hookCommand,
  HOOK_MARKER_START,
  HOOK_MARKER_END,
  HOOK_PAYLOAD,
};
