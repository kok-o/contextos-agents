/**
 * tests/watch-coalescing.test.js
 * Unit tests for Milestone 8 Coalescing Watch Daemon (.agents/watch.js)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { CoalescingWatchDaemon, shouldIgnorePath } = require('../.agents/watch.js');

test('fallback watching survives removal and recreation of a skill directory', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-recreate-'));
  const dir = path.join(root, '.agents/project/skills/team');
  const source = path.join(dir, 'SKILL.md');
  fs.mkdirSync(dir, { recursive: true });
  const body = version => `---\nname: team\ndescription: Team rules\n---\nVERSION_${version}`;
  fs.writeFileSync(source, body('ONE'));
  const events = [];
  const daemon = new CoalescingWatchDaemon(root, { silent: true, exitOnSigint: false, debounceMs: 20, onSync: event => events.push(event) });
  t.after(() => { daemon.close(); assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }); });
  daemon.watchTreeFallback(path.join(root, '.agents'));
  daemon.triggerRecompile('initial');
  const waitFor = async predicate => {
    const deadline = Date.now() + 2500;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(predicate(), 'watcher must synchronize the current source');
  };
  const output = path.join(root, '.agents/skills/team/SKILL.md');
  const hasVersion = version => fs.existsSync(output) && fs.readFileSync(output, 'utf8').includes(`VERSION_${version}`);
  await waitFor(() => hasVersion('ONE'));
  fs.unlinkSync(source);
  fs.rmdirSync(dir);
  fs.mkdirSync(dir);
  fs.writeFileSync(source, body('TWO'));
  await waitFor(() => hasVersion('TWO'));
  await new Promise(resolve => setTimeout(resolve, 100));
  fs.writeFileSync(source, body('THREE'));
  await waitFor(() => hasVersion('THREE'));
  assert.ok(events.every(event => event.type === 'recompile'));
  assert.equal(daemon.pendingReasons.size, 0);
});

test('watch yields while another process holds the lock and retries after release', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-busy-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'ctx-watch-busy-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const result = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const [repo, root] = process.argv.slice(1);
    const { CoalescingWatchDaemon } = require(path.join(repo, '.agents/watch.js'));
    const { ProjectMutationLock } = require(path.join(repo, '.agents/filesystem/project-lock.js'));
    const skill = path.join(root, '.agents/project/skills/team/SKILL.md');
    fs.mkdirSync(path.dirname(skill), {recursive: true});
    fs.writeFileSync(skill, '---\\nname: team\\ndescription: Team rule\\n---\\nHello');
    const lock = new ProjectMutationLock(root);
    const token = lock.acquire({command: 'holder'});
    let timerFired = false;
    const deadline = setTimeout(() => { console.error('retry timed out'); process.exit(2); }, 2500);
    const daemon = new CoalescingWatchDaemon(root, {
      silent: true, exitOnSigint: false, debounceMs: 10,
      onSync(event) {
        if (event.type !== 'recompile') return;
        if (!timerFired || !event.reasons.includes('changed.md')) process.exit(3);
        daemon.close(); clearTimeout(deadline); console.log('SYNCED_AFTER_RELEASE');
      },
    });
    setTimeout(() => { timerFired = true; lock.release(token); }, 100);
    daemon.triggerRecompile('changed.md');
  `, path.resolve(__dirname, '..'), root], { encoding: 'utf8', timeout: 5000 });
  assert.strictEqual(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /SYNCED_AFTER_RELEASE/);
});

for (const [mode, tier] of ['recursive', 'fallback'].flatMap(mode => ['project', 'vendor'].map(tier => [mode, tier]))) {
  test(`watch (${mode}) observes new ${tier} rules and subsequent resource edits`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-owned-'));
    fs.mkdirSync(path.join(root, '.agents/project/skills'), { recursive: true });
    const events = [];
    let resolveEvent;
    const nextEvent = () => new Promise(resolve => { resolveEvent = resolve; });
    const eventReceived = nextEvent();
    const daemon = new CoalescingWatchDaemon(root, {
      silent: true, exitOnSigint: false, debounceMs: 20,
      onSync(event) { events.push(event); resolveEvent(); },
    });
    t.after(() => {
      daemon.close();
      assert.ok(root.startsWith(path.join(os.tmpdir(), 'ctx-watch-owned-')));
      fs.rmSync(root, { recursive: true, force: true });
    });
    const originalWatch = fs.watch;
    if (mode === 'fallback') {
      fs.watch = function(file, options, listener) {
        if (options?.recursive) throw new Error('Recursive watching unavailable');
        return originalWatch.apply(fs, arguments);
      };
    }
    try { daemon.start(); } finally { fs.watch = originalWatch; }
    const dir = path.join(root, `.agents/${tier}/skills/team`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'skill.yaml'), 'id: team\nname: team\nresources:\n  - details.txt\n');
    fs.writeFileSync(path.join(dir, 'details.txt'), 'BEFORE');
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team rules\n---\nHello');
    const waitFor = async event => {
      let timeout;
      await Promise.race([event, new Promise(resolve => { timeout = setTimeout(resolve, 5000); })]);
      clearTimeout(timeout);
    };
    await waitFor(eventReceived);
    assert.ok(events.some(event => event.type === 'recompile'), 'new source rule must trigger export');
    assert.ok(fs.existsSync(path.join(root, '.agents/skills/team/SKILL.md')));
    // Let the native watcher finish delivering the initial directory events
    // before modelling the user's next edit.
    await new Promise(resolve => setTimeout(resolve, 100));
    const resourceChanged = nextEvent();
    fs.writeFileSync(path.join(dir, 'details.txt'), 'AFTER');
    await waitFor(resourceChanged);
    assert.strictEqual(fs.readFileSync(path.join(root, '.agents/skills/team/details.txt'), 'utf8'), 'AFTER');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(events.filter(event => event.type === 'recompile').every(event => event.reasons.every(reason => !shouldIgnorePath(reason))), 'generated outputs must not be source events');
  });
}

for (const notification of ['missing', 'nameless']) {
  test(`fallback reconciles new sources when native notifications are ${notification}`, async t => {
    const { EventEmitter } = require('node:events');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-watch-reconcile-'));
    fs.mkdirSync(path.join(root, '.agents/project/skills'), { recursive: true });
    const callbacks = new Map();
    const originalWatch = fs.watch;
    let synced;
    const firstSync = new Promise(resolve => { synced = resolve; });
    const daemon = new CoalescingWatchDaemon(root, {
      silent: true, exitOnSigint: false,
      onSync(event) { if (event.type === 'recompile') synced(); },
    });
    t.after(() => {
      daemon.close();
      assert.equal(daemon.reconcileTimer, null);
      assert.equal(path.dirname(root), os.tmpdir());
      fs.rmSync(root, { recursive: true, force: true });
    });
    fs.watch = function(file, options, callback) {
      if (options?.recursive) throw new Error('No recursive support');
      callbacks.set(file, typeof options === 'function' ? options : callback);
      const watcher = new EventEmitter();
      watcher.close = () => {};
      return watcher;
    };
    try { daemon.start(); } finally { fs.watch = originalWatch; }
    const dir = path.join(root, '.agents/vendor/skills/team');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team policy\n---\nTeam rules');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), 'id: team\nresources: [details.txt]\n');
    fs.writeFileSync(path.join(dir, 'details.txt'), 'BEFORE');
    if (notification === 'nameless') callbacks.get(path.join(root, '.agents'))('rename', null);
    let timeout;
    try {
      await Promise.race([firstSync, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Fallback reconciliation did not export the new source')), 5000);
      })]);
    } finally { clearTimeout(timeout); }
    assert.ok(daemon.fallbackWatchers.has(dir), 'new subtree must be watched');
    assert.equal(fs.readFileSync(path.join(root, '.agents/skills/team/details.txt'), 'utf8'), 'BEFORE');
    fs.writeFileSync(path.join(dir, 'details.txt'), 'AFTER');
    daemon.reconcileFallbackSources();
    await daemon.processQueue();
    assert.equal(fs.readFileSync(path.join(root, '.agents/skills/team/details.txt'), 'utf8'), 'AFTER');
    daemon.reconcileFallbackSources();
    assert.equal(daemon.pendingReasons.size, 0, 'generated writes must not create source drift');
    const snapshot = daemon.fallbackSnapshot;
    const readdir = fs.readdirSync;
    fs.readdirSync = function(dir, ...args) {
      if (dir === path.join(root, '.agents')) throw Object.assign(new Error('Source scan denied'), { code: 'EACCES' });
      return readdir.call(fs, dir, ...args);
    };
    try { assert.doesNotThrow(() => daemon.reconcileFallbackSources()); }
    finally { fs.readdirSync = readdir; }
    assert.equal(daemon.fallbackSnapshot, snapshot, 'a failed scan must not become the new source baseline');
    assert.equal(daemon.pendingReasons.size, 0);
    assert.match(fs.readFileSync(daemon.errorLogPath, 'utf8'), /Source scan denied/);
    fs.writeFileSync(path.join(dir, 'details.txt'), 'AFTER AGAIN');
    daemon.reconcileFallbackSources();
    const capture = daemon.snapshotFallbackSources;
    daemon.snapshotFallbackSources = () => { throw new Error('Pre-sync scan temporarily unavailable'); };
    try { await daemon.processQueue(); } finally { daemon.snapshotFallbackSources = capture; }
    assert.equal(fs.readFileSync(path.join(root, '.agents/skills/team/details.txt'), 'utf8'), 'AFTER');
    assert.equal(daemon.fallbackSnapshot, null, 'a failed pre-sync scan must keep the edit discoverable');
    daemon.reconcileFallbackSources();
    await daemon.processQueue();
    assert.equal(fs.readFileSync(path.join(root, '.agents/skills/team/details.txt'), 'utf8'), 'AFTER AGAIN');
  });
}

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
