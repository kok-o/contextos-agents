'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { validateGitPaths, validatePackagePaths, checkTestInventory, checkPublicInstructions } = require('../scripts/check-release-surface.cjs');

function contractFixture(t) {
  const root = path.resolve(__dirname, '..');
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-release-contract-')));
  t.after(() => {
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ctx-release-contract-'));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
  });
  for (const file of ['package.json', 'README.md', 'GUIDE.md', 'docs/PRODUCT_BOUNDARIES.md', 'docs/MIGRATION.md', 'contextos-mcp/README.md',
    '.github/actions/contextos-gate/action.yml', '.github/workflows/validate-skills.yml', '.github/workflows/publish.yml']) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  fs.mkdirSync(path.join(directory, 'tests'));
  for (const file of fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.js'))) fs.writeFileSync(path.join(directory, 'tests', file), '');
  return directory;
}

test('every core test is scheduled, including the release suite in both CI workflows', t => {
  assert.deepEqual(checkTestInventory(), []);
  const fixture = contractFixture(t);
  fs.writeFileSync(path.join(fixture, 'tests/forgotten.test.js'), '');
  assert.ok(checkTestInventory(fixture).includes('Test not scheduled: tests/forgotten.test.js'));
  fs.unlinkSync(path.join(fixture, 'tests/forgotten.test.js'));
  const workflow = path.join(fixture, '.github/workflows/validate-skills.yml');
  fs.writeFileSync(workflow, fs.readFileSync(workflow, 'utf8').replace('node --test tests/release-publish.test.js', 'echo skipped'));
  assert.match(checkTestInventory(fixture).join('\n'), /validate-skills.yml: separately scheduled/);
});

test('public install commands and gate examples agree with package metadata', t => {
  assert.deepEqual(checkPublicInstructions(), []);
  const fixture = contractFixture(t);
  const readme = path.join(fixture, 'README.md');
  const original = fs.readFileSync(readme, 'utf8');
  fs.writeFileSync(readme, original.replace('npm install --save-dev contextos-mcp', 'npm install --save-dev @contextos/mcp'));
  assert.match(checkPublicInstructions(fixture).join('\n'), /README.md: installs/);
  fs.writeFileSync(readme, original.replace(/version: '[^']+'/g, "version: '0.0.0'"));
  assert.match(checkPublicInstructions(fixture).join('\n'), /README.md: gate example/);
  fs.writeFileSync(readme, original);
  const action = path.join(fixture, '.github/actions/contextos-gate/action.yml');
  // A correct default on a different input must not hide the wrong version input.
  const version = JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'))).version;
  fs.writeFileSync(action, fs.readFileSync(action, 'utf8').replace(`default: '${version}'`, "default: '0.0.0'") + `\nother:\n  default: '${version}'\n`);
  assert.match(checkPublicInstructions(fixture).join('\n'), /inputs.version.default/);
});

test('core-only public instructions do not require an MCP checkout', t => {
  const fixture = contractFixture(t);
  fs.unlinkSync(path.join(fixture, 'contextos-mcp/README.md'));
  assert.deepEqual(checkPublicInstructions(fixture, { coreOnly: true }), []);
  assert.throws(() => checkPublicInstructions(fixture), /ENOENT/);
});

test('a prerelease cannot default to the latest npm tag', t => {
  const fixture = contractFixture(t);
  const file = path.join(fixture, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  // This guard is relevant while preparing the prerelease; stable fixtures still exercise it.
  pkg.version = '3.0.0-rc.1';
  pkg.publishConfig = { tag: 'latest' };
  fs.writeFileSync(file, JSON.stringify(pkg));
  assert.match(checkPublicInstructions(fixture, { coreOnly: true }).join('\n'), /non-latest publishConfig.tag/);
});

test('consumer gate records timeouts and extends only npm installation on Windows', t => {
  const fixture = contractFixture(t);
  const script = path.join(fixture, 'scripts/check-release-install.cjs');
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(path.resolve(__dirname, '../scripts/check-release-install.cjs'), script);
  const version = JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'))).version;
  const archives = path.join(fixture, 'archives');
  fs.mkdirSync(archives);
  fs.writeFileSync(path.join(archives, `contextos-agents-${version}.tgz`), 'unused: npm is intercepted before reading it');

  for (const phase of ['install', 'cli']) {
    const preload = path.join(fixture, 'timeout.cjs');
    fs.writeFileSync(preload, `
      const cp = require('node:child_process');
      cp.execFileSync = (executable, args) => {
        const npmInstall = args[1] === 'install';
        if (${JSON.stringify(phase)} === 'cli' && npmInstall) return '';
        if (!npmInstall && !(executable === 'git' && args[0] === 'init')) throw new Error('unexpected command');
        const error = new Error('simulated timeout'); error.code = 'ETIMEDOUT'; throw error;
      };
    `);
    const result = spawnSync(process.execPath, ['--require', preload, script, '--core-only', archives], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(fixture, 'scratch/release-core-install-result.json')));
    t.after(() => {
      const consumer = fs.realpathSync(report.consumerPath);
      assert.equal(path.dirname(consumer), fs.realpathSync(os.tmpdir()));
      assert.ok(path.basename(consumer).startsWith('contextos-release-consumer-space '));
      fs.rmSync(consumer, { recursive: true, force: true });
    });
    assert.equal(report.result, 'FAIL', 'a timeout must not be converted into a passing check');
    assert.equal(report.failedStep.code, 'ETIMEDOUT');
    assert.equal(report.failedStep.timeoutMs, phase === 'install' && process.platform === 'win32' ? 600000 : 180000);
    assert.ok(report.failedStep.durationMs >= 0);
    if (phase === 'install') assert.ok(report.failedStep.command.includes('install'));
    else assert.deepEqual(report.failedStep.command, ['git', 'init', '-q']);
  }
});

test('release surface rejects credentials, local probes and raw evidence while retaining public docs', () => {
  const bad = ['contextos-mcp/.env', 'scratch/key.txt', 'docs/evidence/private.json', 'docs/AUDIT_2026-10-03.md', 'benchmarks/run-sol-agent.js', 'private.pem'];
  assert.deepEqual(validateGitPaths(bad), bad);
  assert.deepEqual(validateGitPaths(['contextos-mcp/.env.example', 'docs/BENCHMARK_RESULTS.md', 'benchmarks/luna/client.js', 'docs/evidence/release-2.3.json']), []);
  const core = ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'bin/index.js', '.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js'];
  assert.deepEqual(validatePackagePaths(core, 'core'), []);
  for (const file of ['benchmarks/luna/client.js', 'docs/ROADMAP.md', 'scratch/api.json', '.agents/state/session.json', '.agents/core/.env']) assert.ok(validatePackagePaths([...core, file], 'core').includes(file));
});

test('reviewed compatibility artifacts do not allow neighboring raw evidence or npm inclusion', () => {
  const reviewed = [
    'docs/evidence/2026-10-27-codex-sol-rc1/trials.json',
    'docs/evidence/2026-10-27-codex-desktop-sol-rc1/auto-picker-discovery.png',
  ];
  const unreviewed = [
    'docs/evidence/2026-10-27-codex-sol-rc1/private.json',
    'docs/evidence/2026-10-27-codex-desktop-sol-rc1/raw/rollout.jsonl',
    'docs/evidence/2026-10-27-codex-desktop-sol-rc1/auto-picker-discovery-original.png',
    'docs/evidence/2026-10-27-codex-desktop-sol-rc1/.env',
  ];
  assert.deepEqual(validateGitPaths([...reviewed, ...unreviewed]), unreviewed);
  for (const kind of ['core', 'mcp']) {
    const violations = validatePackagePaths(reviewed, kind);
    assert.ok(reviewed.every(file => violations.includes(file)));
  }
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
