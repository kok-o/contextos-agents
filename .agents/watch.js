/**
 * .agents/watch.js
 * ContextOS — Continuous Context Sync & File Watcher Daemon
 *
 * Watches:
 *   1. .agents/core/skills/ — regenerates agent configs on skill markdown edits
 *   2. package.json & manifests — detects tech stack drift and recommends profile adjustments
 *
 * Provides instant feedback during local development without manual re-exports.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const profiles = require('./profiles.js');

/**
 * Runs the ContextOS watch daemon.
 *
 * @param {string} [projectDir=process.cwd()] - Target project directory
 * @param {Object} [options={}] - Watcher configuration options
 * @param {number} [options.debounceMs=300] - Debounce delay in milliseconds
 * @param {Function} [options.onSync] - Callback after a sync event completes
 * @param {boolean} [options.exitOnSigint=true] - Whether to register process exit handlers
 * @returns {Object} Controller object with a `close()` method
 */
function runWatch(projectDir = process.cwd(), options = {}) {
  const debounceMs = options.debounceMs || 300;
  const agentsDir = path.join(projectDir, '.agents');
  const skillsDir = path.join(agentsDir, 'core', 'skills');
  const ctxPath = path.join(agentsDir, 'ctx.js');

  console.log('\n[ContextOS Watch] Initializing background continuous sync daemon...');
  console.log(`[ContextOS Watch] Project directory: ${projectDir}`);

  let lastStack = profiles.detectStack(projectDir);
  console.log(`[ContextOS Watch] Initial stack: ${lastStack.detected.join(', ') || 'Generic JS'} (${lastStack.recommendedProfile})`);

  let debounceTimer = null;
  let isSyncing = false;
  const watchers = [];

  function triggerRecompile(sourceReason) {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      if (isSyncing) return;
      isSyncing = true;

      try {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] [SYNC] Changes detected in ${sourceReason}. Recompiling agent skills...`);

        if (fs.existsSync(ctxPath)) {
          execFileSync(process.execPath, [ctxPath, 'export', 'all'], {
            cwd: projectDir,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          console.log(`[${time}] [OK] Skills exported to all agents (Gemini, Claude, Cursor, Copilot, Aider, Zed).`);
        }

        if (typeof options.onSync === 'function') {
          options.onSync({ type: 'recompile', reason: sourceReason });
        }
      } catch (err) {
        console.error(`[WARN] Auto-recompile failed: ${err.message}`);
      } finally {
        isSyncing = false;
      }
    }, debounceMs);
  }

  function checkStackChange() {
    try {
      const currentStack = profiles.detectStack(projectDir);
      const prevStr = lastStack.detected.sort().join(',');
      const currStr = currentStack.detected.sort().join(',');

      if (prevStr !== currStr) {
        const time = new Date().toLocaleTimeString();
        console.log(`\n[${time}] [DETECT] Project dependencies changed!`);
        console.log(`       Detected stack : ${currentStack.detected.join(', ')}`);
        console.log(`       Recommendation : Profile '${currentStack.recommendedProfile}'`);
        console.log(`       Run: contextos profile apply ${currentStack.recommendedProfile}\n`);
        lastStack = currentStack;

        if (typeof options.onSync === 'function') {
          options.onSync({ type: 'stack_change', stack: currentStack });
        }
      }
    } catch {
      // ignore transient filesystem read errors
    }
  }

  // 1. Watch .agents/core/skills/ directory
  if (fs.existsSync(skillsDir)) {
    try {
      const skillsWatcher = fs.watch(skillsDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const norm = filename.replace(/\\/g, '/');
        if (norm.endsWith('.md') || norm.endsWith('.json') || norm.endsWith('.yaml') || norm.endsWith('.yml')) {
          triggerRecompile(`skills/${filename}`);
        }
      });
      watchers.push(skillsWatcher);
    } catch (e) {
      console.warn(`[WARN] Could not establish recursive watcher on skills directory: ${e.message}`);
    }
  }

  // 2. Watch package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkgWatcher = fs.watch(pkgPath, () => {
        checkStackChange();
      });
      watchers.push(pkgWatcher);
    } catch (e) {
      console.warn(`[WARN] Could not watch package.json: ${e.message}`);
    }
  }

  console.log('[ContextOS Watch] Watching for skill updates and dependency shifts. Press Ctrl+C to stop.\n');

  function close() {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try {
        w.close();
      } catch {}
    }
  }

  if (options.exitOnSigint !== false) {
    const onExit = () => {
      console.log('\n[ContextOS Watch] Stopping watcher daemon.');
      close();
      process.exit(0);
    };
    process.once('SIGINT', onExit);
    process.once('SIGTERM', onExit);
  }

  return {
    close,
    triggerRecompile,
    checkStackChange,
  };
}

if (require.main === module) {
  runWatch();
}

module.exports = {
  runWatch,
};
