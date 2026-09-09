/**
 * .agents/watch.js
 * ContextOS — Coalescing Watch Daemon & Continuous Context Sync Engine
 *
 * Implements the Milestone 8 watch specification:
 * - Coalescing event queue (pendingReasons set) preventing dropped events during compilation
 * - ProjectMutationLock integration to guarantee single-writer safety across parallel processes
 * - Directory containment & exclusion of generated/transient paths (.agents/generated, .agents/.contextos)
 * - Multi-scope surveillance: skills, plugins, profiles, resources, AGENTS.md, package.json
 * - Recursive watcher fast-path with directory-tree polling fallback
 * - Failure diagnostics persistence (.agents/.contextos/watch-error.json) preventing daemon crash
 * - Dependency drift detection without mutating active profile automatically
 */

'use strict';

const fs = require('fs');
const path = require('path');
const profiles = require('./profiles.js');
const {
  ProjectMutationLock,
  toPosix,
} = require('./filesystem/index.js');

const IGNORED_PREFIXES = [
  '.agents/.contextos',
  '.agents/generated',
  '.git',
  'node_modules',
  '.cursor',
  '.zed',
  '.contextos',
];

/**
 * Determines whether a relative path should be ignored by the file watcher.
 */
function shouldIgnorePath(relPath) {
  if (!relPath) return true;
  const norm = toPosix(relPath).replace(/^\.\//, '');

  for (const prefix of IGNORED_PREFIXES) {
    if (norm === prefix || norm.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // Ignore lockfiles and direct adapter outputs
  if (norm.endsWith('contextos.lock.json') || norm.endsWith('lockfile.v2.json')) {
    return true;
  }
  if (norm === '.aider.conf.yml' || norm === 'CONVENTIONS.md' || norm === '.cursorrules') {
    return true;
  }
  if (norm.endsWith('copilot-instructions.md')) {
    return true;
  }

  return false;
}

class CoalescingWatchDaemon {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 250;
    this.options = options;
    this.pendingReasons = new Set();
    this.isProcessing = false;
    this.closed = false;
    this.debounceTimer = null;
    this.watchers = [];
    this.lastStack = null;
    this.errorLogPath = path.join(this.projectDir, '.agents', '.contextos', 'watch-error.json');
    this.lock = new ProjectMutationLock(this.projectDir);
  }

  /**
   * Initializes watchers across all monitored directories and files.
   */
  start() {
    if (!this.options.silent) {
      console.log('\n[ContextOS Watch] Initializing background continuous sync daemon...');
      console.log(`[ContextOS Watch] Project directory: ${this.projectDir}`);
    }

    try {
      this.lastStack = profiles.detectStack(this.projectDir);
      if (!this.options.silent) {
        console.log(`[ContextOS Watch] Initial stack: ${this.lastStack.detected.join(', ') || 'Generic JS'} (${this.lastStack.recommendedProfile})`);
      }
    } catch {
      this.lastStack = { detected: [], recommendedProfile: 'default' };
    }

    // 1. Monitored directories
    const watchDirs = [
      path.join(this.projectDir, '.agents', 'core', 'skills'),
      path.join(this.projectDir, '.agents', 'plugins'),
      path.join(this.projectDir, '.agents', 'resources'),
      path.join(this.projectDir, '.agents', 'profiles'),
    ];

    for (const dir of watchDirs) {
      if (fs.existsSync(dir)) {
        this.watchDirectory(dir);
      }
    }

    // 2. Monitored individual files
    const watchFiles = [
      path.join(this.projectDir, '.agents', 'AGENTS.md'),
      path.join(this.projectDir, 'package.json'),
    ];

    for (const file of watchFiles) {
      if (fs.existsSync(file)) {
        this.watchFile(file);
      }
    }

    if (!this.options.silent) {
      console.log('[ContextOS Watch] Watching for skill updates and dependency shifts. Press Ctrl+C to stop.\n');
    }

    if (this.options.exitOnSigint !== false) {
      const onExit = () => {
        if (!this.options.silent) {
          console.log('\n[ContextOS Watch] Stopping watcher daemon.');
        }
        this.close();
        process.exit(0);
      };
      process.once('SIGINT', onExit);
      process.once('SIGTERM', onExit);
    }

    return this;
  }

  /**
   * Watches a directory with recursive watching, falling back to tree scanning.
   */
  watchDirectory(dirPath) {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const relToProject = toPosix(path.relative(this.projectDir, path.join(dirPath, filename)));
        if (shouldIgnorePath(relToProject)) return;

        const lower = filename.toLowerCase();
        if (lower.endsWith('.md') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.json')) {
          this.triggerRecompile(relToProject);
        }
      });
      this.watchers.push(watcher);
    } catch (e) {
      // Fallback: Watch subdirectories individually if recursive is unsupported
      this.watchTreeFallback(dirPath);
    }
  }

  /**
   * Fallback for systems where recursive fs.watch is unavailable.
   */
  watchTreeFallback(dirPath) {
    try {
      const watcher = fs.watch(dirPath, (eventType, filename) => {
        if (!filename) return;
        const full = path.join(dirPath, filename);
        const relToProject = toPosix(path.relative(this.projectDir, full));
        if (shouldIgnorePath(relToProject)) return;
        this.triggerRecompile(relToProject);
      });
      this.watchers.push(watcher);

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sub = path.join(dirPath, entry.name);
          const rel = toPosix(path.relative(this.projectDir, sub));
          if (!shouldIgnorePath(rel)) {
            this.watchTreeFallback(sub);
          }
        }
      }
    } catch {}
  }

  /**
   * Watches an individual file (e.g. package.json or AGENTS.md).
   */
  watchFile(filePath) {
    try {
      const watcher = fs.watch(filePath, () => {
        const rel = toPosix(path.relative(this.projectDir, filePath));
        if (path.basename(filePath) === 'package.json') {
          this.checkStackChange();
        } else {
          this.triggerRecompile(rel);
        }
      });
      this.watchers.push(watcher);
    } catch {}
  }

  /**
   * Queues a change reason and schedules a coalesced compilation pass.
   */
  triggerRecompile(sourceReason) {
    if (this.closed) return;
    if (sourceReason) {
      this.pendingReasons.add(sourceReason);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, this.debounceMs);
  }

  /**
   * Processes the coalescing queue until empty.
   */
  async processQueue() {
    if (this.isProcessing || this.closed) return;
    if (this.pendingReasons.size === 0) return;

    this.isProcessing = true;

    try {
      while (this.pendingReasons.size > 0 && !this.closed) {
        // Snapshot reasons and clear the queue for incoming events during export
        const reasonsSnapshot = Array.from(this.pendingReasons);
        this.pendingReasons.clear();

        await this.executeSync(reasonsSnapshot);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Performs an export pass with atomic ProjectMutationLock mutual exclusion.
   */
  async executeSync(reasons) {
    let lockToken = null;
    try {
      try {
        lockToken = this.lock.acquire({ command: 'watch:sync' });
      } catch (err) {
        if (err.code === 'CTX_PROJECT_BUSY') {
          if (!this.options.silent) {
            console.log(`[ContextOS Watch] Project mutation lock is held by another process. Re-queuing changes...`);
          }
          for (const r of reasons) {
            this.pendingReasons.add(r);
          }
          return;
        }
        throw err;
      }

      const time = new Date().toLocaleTimeString();
      if (!this.options.silent) {
        console.log(`[${time}] [SYNC] Changes detected (${reasons.slice(0, 3).join(', ')}${reasons.length > 3 ? ` +${reasons.length - 3} more` : ''}). Recompiling adapters...`);
      }

      const { renderAdapters, applyArtifacts } = require('./adapters/pure-compiler.js');
      const rendered = renderAdapters(this.projectDir, 'all');
      const result = applyArtifacts(this.projectDir, rendered.artifacts, {
        command: 'watch',
        lockToken,
        context: rendered.context,
      });

      if (!this.options.silent) {
        console.log(`[${time}] [OK] Skills exported cleanly (${result.appliedCount} files applied, tx: ${result.txId}).`);
      }

      // Clear any prior failure diagnostic on successful compile
      if (fs.existsSync(this.errorLogPath)) {
        try {
          fs.unlinkSync(this.errorLogPath);
        } catch {}
      }

      if (typeof this.options.onSync === 'function') {
        this.options.onSync({ type: 'recompile', reasons, result });
      }
    } catch (err) {
      this.saveFailureDiagnostics(reasons, err);
      if (typeof this.options.onSync === 'function') {
        this.options.onSync({ type: 'error', reasons, error: err });
      }
    } finally {
      if (lockToken) {
        try {
          this.lock.release(lockToken);
        } catch {}
      }
    }
  }

  /**
   * Persists failure diagnostics without crashing the long-running daemon.
   */
  saveFailureDiagnostics(reasons, error) {
    try {
      const dir = path.dirname(this.errorLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload = {
        timestamp: new Date().toISOString(),
        reasons,
        error: error.message,
        stack: error.stack,
        code: error.code || 'ERR_COMPILATION_FAILED',
      };
      fs.writeFileSync(this.errorLogPath, JSON.stringify(payload, null, 2), 'utf8');
      if (!this.options.silent) {
        console.error(`[WARN] Auto-recompile failed: ${error.message}`);
        console.error(`       Diagnostics saved to ${toPosix(path.relative(this.projectDir, this.errorLogPath))}`);
      }
    } catch {}
  }

  /**
   * Checks for tech stack and dependency changes without automatically altering profiles.
   */
  checkStackChange() {
    try {
      const currentStack = profiles.detectStack(this.projectDir);
      const prevStr = (this.lastStack?.detected || []).slice().sort().join(',');
      const currStr = (currentStack.detected || []).slice().sort().join(',');

      if (prevStr !== currStr) {
        const time = new Date().toLocaleTimeString();
        if (!this.options.silent) {
          console.log(`\n[${time}] [DETECT] Project dependencies changed!`);
          console.log(`       Detected stack : ${currentStack.detected.join(', ') || 'None'}`);
          console.log(`       Recommendation : Profile '${currentStack.recommendedProfile}'`);
          console.log(`       Run: contextos profile apply ${currentStack.recommendedProfile}\n`);
        }
        this.lastStack = currentStack;

        if (typeof this.options.onSync === 'function') {
          this.options.onSync({ type: 'stack_change', stack: currentStack });
        }
      }
    } catch {
      // Ignore transient read errors during npm install / edits
    }
  }

  /**
   * Closes all watchers and cleans up active timers.
   */
  close() {
    this.closed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {}
    }
    this.watchers = [];
  }
}

/**
 * Public entrypoint for ContextOS watch daemon.
 *
 * @param {string} [projectDir=process.cwd()]
 * @param {object} [options={}]
 * @returns {object} Controller exposing close(), triggerRecompile(), and checkStackChange()
 */
function runWatch(projectDir = process.cwd(), options = {}) {
  const daemon = new CoalescingWatchDaemon(projectDir, options);
  daemon.start();

  return {
    daemon,
    close: () => daemon.close(),
    triggerRecompile: (reason) => daemon.triggerRecompile(reason),
    checkStackChange: () => daemon.checkStackChange(),
    processQueue: () => daemon.processQueue(),
    get pendingReasons() {
      return daemon.pendingReasons;
    },
    get isProcessing() {
      return daemon.isProcessing;
    },
  };
}

if (require.main === module) {
  runWatch();
}

module.exports = {
  CoalescingWatchDaemon,
  runWatch,
  shouldIgnorePath,
};
