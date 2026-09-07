#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(ROOT_DIR, '.git', 'hooks');
const PRE_COMMIT_HOOK = path.join(HOOKS_DIR, 'pre-commit');

function installPreCommitHook() {
  if (!fs.existsSync(HOOKS_DIR)) {
    console.warn(`[setup-hooks] .git/hooks directory not found at ${HOOKS_DIR}. Skipping hook install.`);
    return;
  }

  const hookContent = `#!/bin/sh
# ContextOS Pre-Commit Secret Scanner Hook
node scripts/check-secrets.js --staged
`;

  try {
    fs.writeFileSync(PRE_COMMIT_HOOK, hookContent, { encoding: 'utf8', mode: 0o755 });
    // On POSIX systems, ensure executable permission
    try {
      fs.chmodSync(PRE_COMMIT_HOOK, 0o755);
    } catch {}
    console.log(`[setup-hooks] Successfully installed pre-commit secret scanner hook to ${PRE_COMMIT_HOOK}`);
  } catch (err) {
    console.error(`[setup-hooks] Failed to install pre-commit hook: ${err.message}`);
    process.exit(1);
  }
}

installPreCommitHook();
