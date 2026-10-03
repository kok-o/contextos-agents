'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { validateGitPaths, validatePackagePaths } = require('../scripts/check-release-surface.cjs');

test('release surface rejects credentials, local probes and raw evidence while retaining public docs', () => {
  const bad = ['contextos-mcp/.env', 'scratch/key.txt', 'docs/evidence/private.json', 'docs/AUDIT_2026-10-03.md', 'benchmarks/run-sol-agent.js', 'private.pem'];
  assert.deepEqual(validateGitPaths(bad), bad);
  assert.deepEqual(validateGitPaths(['contextos-mcp/.env.example', 'docs/BENCHMARK_RESULTS.md', 'benchmarks/luna/client.js', 'docs/evidence/release-2.3.json']), []);
  const core = ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'bin/index.js', '.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js'];
  assert.deepEqual(validatePackagePaths(core, 'core'), []);
  for (const file of ['benchmarks/luna/client.js', 'docs/ROADMAP.md', 'scratch/api.json', '.agents/state/session.json', '.agents/core/.env']) assert.ok(validatePackagePaths([...core, file], 'core').includes(file));
});

test('secret gate permits ignored local credentials and detects their exact value in exempt fixtures', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-release-secret-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ['scripts/check-secrets.js', 'bin/lib/scan.js', 'bin/lib/git-snapshot.js']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(root, file));
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
  const secret = 'synthetic-local-credential-1234567890';
  fs.writeFileSync(path.join(root, '.env'), `OPENAI_API_KEY=${secret}\n`);
  const run = () => spawnSync(process.execPath, ['scripts/check-secrets.js', '--all'], { cwd: root, encoding: 'utf8' });
  assert.equal(run().status, 0);
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests/leak.js'), `const copied = '${secret}';\n`);
  const failed = run();
  assert.equal(failed.status, 1); assert.equal((failed.stdout + failed.stderr).includes(secret), false);
  assert.match(failed.stderr, /Local credential copied/);
  execFileSync('git', ['add', 'tests/leak.js'], { cwd: root });
  fs.writeFileSync(path.join(root, 'tests/leak.js'), 'const copied = null;\n');
  const staged = spawnSync(process.execPath, ['scripts/check-secrets.js', '--staged'], { cwd: root, encoding: 'utf8' });
  assert.equal(staged.status, 1); assert.equal((staged.stdout + staged.stderr).includes(secret), false);
  fs.unlinkSync(path.join(root, 'tests/leak.js'));
  execFileSync('git', ['add', '-f', '.env'], { cwd: root });
  assert.equal(run().status, 1);
});
