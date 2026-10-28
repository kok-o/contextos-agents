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
  for (const file of ['package.json', 'README.md', 'GUIDE.md', 'docs/PRODUCT_BOUNDARIES.md', 'docs/MIGRATION.md',
    '.github/actions/contextos-gate/action.yml', '.github/workflows/validate-skills.yml', '.github/workflows/publish.yml']) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  // The core-only suite must not read the separate checkout. The fixture still
  // exercises rejection of a missing MCP document in the paired contract.
  const mcpReadme = path.join(directory, 'contextos-mcp/README.md');
  fs.mkdirSync(path.dirname(mcpReadme), { recursive: true });
  const actualMcpReadme = path.join(root, 'contextos-mcp/README.md');
  fs.writeFileSync(mcpReadme, process.env.CONTEXTOS_CORE_ONLY_TESTS === '1' ? '# Synthetic MCP fixture\n' : fs.readFileSync(actualMcpReadme));
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
  fs.writeFileSync(workflow, fs.readFileSync(workflow, 'utf8').replaceAll('node --test tests/release-publish.test.js', 'echo skipped'));
  assert.match(checkTestInventory(fixture).join('\n'), /validate-skills.yml: separately scheduled/);
});

test('core stable preflight dispatch verifies one reviewed archive across six platforms without MCP or publication', () => {
  const workflow = require('yaml').parse(fs.readFileSync(path.resolve(__dirname, '../.github/workflows/validate-skills.yml'), 'utf8'));
  const input = workflow.on.workflow_dispatch.inputs.core_stable_preflight;
  assert.equal(input.type, 'boolean');
  assert.equal(input.default, false);
  const stableRoute = "${{ github.event_name == 'workflow_dispatch' && inputs.core_stable_preflight }}";
  const normalRoute = "${{ github.event_name != 'workflow_dispatch' || !inputs.core_stable_preflight }}";
  const stableIds = ['core-stable-archive', 'core-stable-preflight'];
  const normalIds = ['installed-consumer', 'test', 'validate-skills', 'lint-frontmatter', 'lint-markdown',
    'validate-registry', 'validate-contextos-mcp', 'mcp-source-regressions', 'oci-integration'];
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [...stableIds, ...normalIds].sort());
  for (const id of stableIds) assert.equal(workflow.jobs[id].if, stableRoute);
  for (const id of normalIds) assert.equal(workflow.jobs[id].if, normalRoute);
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const enabled of [false, true]) {
      const stable = event === 'workflow_dispatch' && enabled;
      const active = Object.entries(workflow.jobs).filter(([, job]) =>
        job.if === stableRoute ? stable : !stable).map(([id]) => id).sort();
      assert.deepEqual(active, (stable ? stableIds : normalIds).slice().sort());
    }
  }

  const prepare = workflow.jobs['core-stable-archive'];
  const accept = workflow.jobs['core-stable-preflight'];
  assert.equal(accept.needs, 'core-stable-archive');
  assert.deepEqual(accept.strategy.matrix.os, ['ubuntu-latest', 'windows-latest', 'macos-latest']);
  assert.deepEqual(accept.strategy.matrix.node, ['22', '24']);
  assert.equal(accept.strategy['fail-fast'], false);
  assert.equal(accept.env.CONTEXTOS_CORE_ONLY_TESTS, '1');
  const upload = prepare.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const download = accept.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with.name, upload.with.name);
  assert.equal(download.with.path, 'scratch');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with.overwrite, true, 'a rerun may replace only bytes that pass the reviewed identity check');
  assert.equal(upload.with.name.includes('github.run_attempt'), false, 'rerunning failed matrix jobs must still find the successful prepare artifact');
  assert.match(upload.with.path, /scratch\/release-candidate\/\*\.tgz/);
  assert.match(upload.with.path, /scratch\/previous-core\/\*\.tgz/);
  for (const job of [prepare, accept]) {
    assert.deepEqual(job.permissions, { contents: 'read' });
    assert.equal(job.steps[0].with['persist-credentials'], false);
    assert.ok(job.steps.some(step => step.run === 'npm ci --ignore-scripts'));
    const commands = job.steps.map(step => step.run || '').join('\n');
    assert.doesNotMatch(commands, /\bnpm\s+publish\b|\.main\(['"]publish['"]|\bgit\s+(?:push|tag)\b|contextos-mcp|--check-mcp/);
    assert.equal(job.steps.some(step => step.env?.NODE_AUTH_TOKEN), false);
  }
  const prepareRuns = prepare.steps.map(step => step.run || '').join('\n');
  assert.match(prepareRuns, /\.main\('prepare', 'core-stable'\)/);
  assert.match(prepareRuns, /npm pack contextos-agents@2\.3\.2 --ignore-scripts/);
  const runs = accept.steps.map(step => step.run || '').join('\n');
  for (const required of ['npm run build', 'git diff --exit-code', 'npm run validate', 'npm run validate:catalog',
    'node scripts/validate-registry.cjs', 'npm run check:secrets:core', 'npm run test:skills', 'npm run lint:md',
    'node .agents/ctx.js export all --check --json', 'npm run test:core', 'node --test tests/release-publish.test.js',
    'npm run check:release-surface:core', 'npm run check:consumer:core -- scratch/release-candidate',
    'npm run check:migration:core -- scratch/previous-core/contextos-agents-2.3.2.tgz']) {
    assert.ok(runs.includes(required), `core stable preflight must retain ${required}`);
  }
  assert.equal(runs.split(".main('verify', 'core-stable')").length - 1, 2, 'archive bytes must be verified before and after acceptance');
  const evidence = accept.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(evidence.if, 'always()');
  for (const file of ['core-tests.log', 'release-publish-prepared.json', 'release-core-install-result.json',
    'release-core-migration-result.json', 'release-core-surface.json']) assert.ok(evidence.with.path.includes(file));
  const lintRuns = workflow.jobs['lint-markdown'].steps.map(step => step.run || '').join('\n');
  assert.match(lintRuns, /npm ci --ignore-scripts/);
  assert.doesNotMatch(lintRuns, /npm install --no-save/);
  assert.match(lintRuns, /npx --no-install markdownlint/);
});

test('public install commands and gate examples agree with package metadata', t => {
  assert.deepEqual(checkPublicInstructions(undefined, { coreOnly: process.env.CONTEXTOS_CORE_ONLY_TESTS === '1' }), []);
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

test('standalone package policy retains every blocked credential name and extension', () => {
  const { BLOCKED_EXACT_NAMES, BLOCKED_EXTENSIONS } = require('../bin/lib/scan');
  const { privateFile, validatePackagePaths } = require('../scripts/release-package-surface.cjs');
  for (const name of BLOCKED_EXACT_NAMES) assert.equal(privateFile(`dist/${name}`), true, name);
  for (const extension of BLOCKED_EXTENSIONS) assert.equal(privateFile(`dist/item${extension}`), true, extension);
  assert.equal(privateFile('dist/.env.example'), false);
  assert.throws(() => validatePackagePaths([], 'unknown'), /Unknown package surface/);
});

test('reviewed compatibility artifacts do not allow neighboring raw evidence or npm inclusion', () => {
  const reviewed = [
    'docs/evidence/gemini-flash-3-8-rules-baseline.json',
    'docs/evidence/gemini-flash-3-8-rules-scenarios.json',
    'docs/evidence/2026-10-27-codex-sol-rc1/trials.json',
    'docs/evidence/2026-10-27-codex-desktop-sol-rc1/auto-picker-discovery.png',
  ];
  const unreviewed = [
    'docs/evidence/gemini-flash-3-8-rules-raw.json',
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

test('core npm file selection includes plugin JSON without backup siblings', t => {
  const fixture = contractFixture(t);
  const plugins = path.join(fixture, '.agents/plugins/contextos');
  fs.mkdirSync(plugins, { recursive: true });
  for (const file of ['plugin.json', 'hooks.json', 'hooks.json.bak']) {
    fs.writeFileSync(path.join(plugins, file), '{}\n');
  }
  const npm = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].find(file => file && fs.existsSync(file));
  assert.ok(npm, 'Cannot locate npm-cli.js for the package selection check');
  const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: fixture, encoding: 'utf8', windowsHide: true,
  }))[0];
  const files = packed.files.map(file => file.path);
  assert.ok(files.includes('.agents/plugins/contextos/plugin.json'));
  assert.ok(files.includes('.agents/plugins/contextos/hooks.json'));
  assert.equal(files.includes('.agents/plugins/contextos/hooks.json.bak'), false);
});

test('secret gate permits ignored local credentials and detects their exact value in exempt fixtures', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-release-secret-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = ['scripts/check-secrets.js', 'bin/lib/scan.js', 'bin/lib/git-snapshot.js'];
  if (fs.existsSync(path.resolve(__dirname, '../bin/lib/secret-fixtures.json'))) files.push('bin/lib/secret-fixtures.json');
  for (const file of files) {
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

test('core secret gate excludes MCP explicitly while the full gate detects its secrets', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-core-secret-scope-')));
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ctx-core-secret-scope-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(path.resolve(__dirname, '../scripts/check-secrets.js'), path.join(root, 'scripts/check-secrets.js'));
  fs.cpSync(path.resolve(__dirname, '../bin/lib'), path.join(root, 'bin/lib'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, 'contextos-mcp'));
  fs.writeFileSync(path.join(root, 'contextos-mcp/package.json'), '{"name":"contextos-mcp"}\n');
  fs.writeFileSync(path.join(root, 'contextos-mcp/leak.js'), `const token = '${'ghp_' + 'Q7'.repeat(18)}';\n`);
  const run = args => spawnSync(process.execPath, ['scripts/check-secrets.js', ...args], { cwd: root, encoding: 'utf8' });
  const core = run(['--all', '--core-only']);
  assert.equal(core.status, 0, core.stdout + core.stderr);
  assert.match(core.stdout, /Core-only scope excludes/);
  assert.equal(run(['--all']).status, 1, 'the full repository gate must still reject the MCP leak');
  assert.equal(run(['--all', '--mcp-only']).status, 1, 'the MCP gate must reject its own leak');
  fs.unlinkSync(path.join(root, 'contextos-mcp/leak.js'));
  assert.equal(run(['--all', '--mcp-only']).status, 0);
  fs.unlinkSync(path.join(root, 'contextos-mcp/package.json'));
  assert.notEqual(run(['--all', '--mcp-only']).status, 0, 'missing MCP must not silently pass');
});
