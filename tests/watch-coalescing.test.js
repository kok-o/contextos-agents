/**
 * tests/watch-coalescing.test.js
 * Unit tests for Milestone 8 Coalescing Watch Daemon (.agents/watch.js)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CoalescingWatchDaemon, shouldIgnorePath } = require('../.agents/watch.js');

describe('Milestone 8 — Coalescing Watch Daemon', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-test-'));
    fs.mkdirSync(path.join(tmpDir, '.agents', 'core', 'skills', 'react'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.agents', 'core', 'skills', 'react', 'SKILL.md'),
      '---\nname: react\ndescription: React guidelines\n---\n# React\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.agents', 'AGENTS.md'), '# Project Rules\n');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', dependencies: { react: '^18.0.0' } }));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('shouldIgnorePath filters internal and transient files accurately', () => {
    assert.equal(shouldIgnorePath('.agents/.contextos/transactions/tx-1/journal.json'), true);
    assert.equal(shouldIgnorePath('.agents/generated/gemini/skills/react/SKILL.md'), true);
    assert.equal(shouldIgnorePath('.git/index'), true);
    assert.equal(shouldIgnorePath('node_modules/react/index.js'), true);
    assert.equal(shouldIgnorePath('.cursor/rules/react.mdc'), true);
    assert.equal(shouldIgnorePath('.zed/prompts/react.md'), true);
    assert.equal(shouldIgnorePath('.agents/contextos.lock.json'), true);
    assert.equal(shouldIgnorePath('.agents/lockfile.v2.json'), true);

    // Monitored files MUST NOT be ignored
    assert.equal(shouldIgnorePath('.agents/core/skills/react/SKILL.md'), false);
    assert.equal(shouldIgnorePath('.agents/core/skills/react/skill.yaml'), false);
    assert.equal(shouldIgnorePath('.agents/AGENTS.md'), false);
    assert.equal(shouldIgnorePath('package.json'), false);
  });

  test('coalesces multiple rapid triggers into a unified queued pass', async () => {
    let syncCount = 0;
    const syncedReasons = [];

    const daemon = new CoalescingWatchDaemon(tmpDir, {
      debounceMs: 50,
      silent: true,
      exitOnSigint: false,
      onSync: (event) => {
        if (event.type === 'recompile') {
          syncCount++;
          syncedReasons.push(...event.reasons);
        }
      },
    });

    // Rapidly queue 5 file change triggers
    daemon.triggerRecompile('.agents/core/skills/react/SKILL.md');
    daemon.triggerRecompile('.agents/core/skills/react/skill.yaml');
    daemon.triggerRecompile('.agents/AGENTS.md');
    daemon.triggerRecompile('.agents/core/skills/react/SKILL.md'); // duplicate

    assert.equal(daemon.pendingReasons.size, 3, 'Duplicate reasons must be deduplicated in set');

    // Wait for debounce and queue processing
    await new Promise(resolve => setTimeout(resolve, 150));

    assert.equal(syncCount, 1, 'Multiple rapid triggers must coalesce into a single sync pass');
    assert.ok(syncedReasons.includes('.agents/AGENTS.md'));
    assert.equal(daemon.pendingReasons.size, 0, 'Queue must be drained');

    daemon.close();
  });

  test('saves failure diagnostics to .agents/.contextos/watch-error.json without crashing', async () => {
    let errorCaught = false;

    const daemon = new CoalescingWatchDaemon(tmpDir, {
      debounceMs: 10,
      silent: true,
      exitOnSigint: false,
      onSync: (event) => {
        if (event.type === 'error') {
          errorCaught = true;
        }
      },
    });

    const mockError = new Error('Simulated adapter failure');
    mockError.code = 'SIMULATED_ERR';

    // Inject failure diagnostic
    daemon.saveFailureDiagnostics(['skills/invalid/SKILL.md'], mockError);

    const errorLogPath = path.join(tmpDir, '.agents', '.contextos', 'watch-error.json');
    assert.ok(fs.existsSync(errorLogPath), 'watch-error.json must be written on failure');

    const errorData = JSON.parse(fs.readFileSync(errorLogPath, 'utf8'));
    assert.equal(errorData.error, 'Simulated adapter failure');
    assert.equal(errorData.code, 'SIMULATED_ERR');
    assert.deepEqual(errorData.reasons, ['skills/invalid/SKILL.md']);

    daemon.close();
  });

  test('detects dependency drift and emits stack change without modifying active profile', () => {
    let stackChanged = false;
    let newStack = null;

    const daemon = new CoalescingWatchDaemon(tmpDir, {
      silent: true,
      exitOnSigint: false,
      onSync: (event) => {
        if (event.type === 'stack_change') {
          stackChanged = true;
          newStack = event.stack;
        }
      },
    });

    daemon.lastStack = { detected: ['react'], recommendedProfile: 'frontend' };

    // Modify package.json to include nestjs
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', dependencies: { react: '^18.0.0', '@nestjs/core': '^10.0.0' } })
    );

    daemon.checkStackChange();

    assert.equal(stackChanged, true, 'checkStackChange must emit stack_change event');
    assert.ok(newStack.detected.includes('NestJS'), 'Detected stack must include new framework');

    daemon.close();
  });
});
