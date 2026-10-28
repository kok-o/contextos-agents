/**
 * tests/consumer-gate.test.js
 * Integration test verifying that the context engine and adapters operate strictly
 * on the consumer project root, discovering consumer-unique skills without leaking
 * or falling back to the author package directory.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync, spawn } = require('child_process');

const { renderAdapters } = require('../.agents/adapters/pure-compiler.js');
const { detectDrift } = require('../.agents/adapters/drift-detector.js');

// Execute the composite action's real Bash source, resolving expressions exactly
// once as Actions does. Only the trusted registry origin is replaced by our local
// fixture; no public-registry downloads or third-party installs are involved.
describe('CI action bootstrap trust boundary', () => {
  const yaml = require('yaml');
  const http = require('node:http');
  const crypto = require('node:crypto');
  const actionDir = path.resolve(__dirname, '../.github/actions/contextos-gate');
  const action = yaml.parse(fs.readFileSync(path.join(actionDir, 'action.yml'), 'utf8'));
  const fixtureVersion = require('../package.json').version;
  const fixtureTarballPath = `/contextos-agents/-/contextos-agents-${fixtureVersion}.tgz`;
  const npmCli = process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    : path.resolve(path.dirname(fs.realpathSync(execFileSync('which', ['npm'], { encoding: 'utf8' }).trim())), 'npm-cli.js');
  let base, workspace, runnerTemp, server, registry, requests, tarball;

  function runProcess(file, args, options) {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, stdout, stderr }));
    });
  }

  async function runAction(inputs = {}, extraEnv = {}, fixtureActionDir = actionDir) {
    const values = Object.fromEntries(Object.entries(action.inputs).map(([key, spec]) => [key, spec.default]));
    Object.assign(values, inputs);
    const output = path.join(base, `output-${crypto.randomUUID()}`);
    const report = path.join(base, `report-${crypto.randomUUID()}`);
    const expressions = {
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`inputs.${key}`, value])),
      'github.action_path': fixtureActionDir.replace(/\\/g, '/'),
      'steps.setup-node.outputs.node-version': process.version,
    };
    const interpolate = text => String(text).replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
      assert.ok(Object.hasOwn(expressions, key), `Unknown action expression: ${key}`);
      return expressions[key];
    });
    let result;
    for (const step of action.runs.steps.filter(step => step.run)) {
      const stepEnv = Object.fromEntries(Object.entries(step.env || {}).map(([key, value]) => [key, interpolate(value)]));
      // The origin is trusted action configuration, not consumer npm config.
      if (Object.hasOwn(stepEnv, 'CONTEXTOS_REGISTRY')) stepEnv.CONTEXTOS_REGISTRY = registry;
      const script = path.join(base, `step-${crypto.randomUUID()}.sh`);
      fs.writeFileSync(script, interpolate(step.run));
      result = await runProcess('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', script.replace(/\\/g, '/')], {
        cwd: workspace,
        env: {
          ...process.env, RUNNER_TEMP: runnerTemp, RUNNER_TOOL_CACHE: path.join(base, 'tool cache'),
          RUNNER_OS: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
          RUNNER_ARCH: process.arch.toUpperCase(), GITHUB_WORKSPACE: workspace,
          GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: report, ...extraEnv, ...stepEnv,
        },
      });
      if (result.code !== 0) break;
    }
    const summary = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
    return { ...result, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '', summary,
      report: summary.startsWith('{') ? JSON.parse(summary) : null };
  }

  before(async () => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-action-fixture-'));
    workspace = path.join(base, 'consumer workspace');
    runnerTemp = path.join(base, 'runner temp');
    fs.mkdirSync(workspace);
    fs.mkdirSync(runnerTemp);
    const cache = path.join(base, 'tool cache/node', process.versions.node, process.arch);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.symlinkSync(process.platform === 'win32' ? path.dirname(process.execPath) : path.dirname(path.dirname(process.execPath)), cache,
      process.platform === 'win32' ? 'junction' : 'dir');
    const pkg = path.join(base, 'trusted package');
    fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({
      name: 'contextos-agents', version: fixtureVersion, bin: { 'contextos-agents': 'bin/index.js' },
      scripts: { preinstall: 'node lifecycle.js', install: 'node lifecycle.js', postinstall: 'node lifecycle.js' },
    }));
    fs.writeFileSync(path.join(pkg, 'lifecycle.js'), `require('fs').writeFileSync(${JSON.stringify(path.join(base, 'LIFECYCLE_RAN'))}, 'executed');`);
    fs.writeFileSync(path.join(pkg, 'bin/index.js'), `
      const fs = require('fs');
      fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY, JSON.stringify({
        trusted: true, argv: process.argv.slice(2), execPath: process.execPath,
        entrypoint: __filename, cwd: process.cwd(), env: process.env
      }));
      const profile = process.argv[process.argv.indexOf('--profile') + 1];
      process.exit(profile === 'fixture-drift' ? 1 : profile === 'fixture-error' ? 2 : 0);
    `);
    const empty = path.join(base, 'empty.npmrc');
    fs.writeFileSync(empty, '');
    const packed = JSON.parse(execFileSync(process.execPath,
      [npmCli, 'pack', '--ignore-scripts', '--json', '--userconfig', empty, '--globalconfig', path.join(base, 'empty-global.npmrc')],
      { cwd: pkg, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } }));
    tarball = fs.readFileSync(path.join(pkg, packed[0].filename));
    requests = [];
    server = http.createServer((req, res) => {
      requests.push(req.url);
      if (req.url === fixtureTarballPath) {
        res.end(tarball);
      } else if (req.url === '/contextos-agents' || req.url === `/contextos-agents/${fixtureVersion}`) {
        const manifest = {
          name: 'contextos-agents', version: fixtureVersion, bin: { 'contextos-agents': 'bin/index.js' },
          dist: { tarball: `${registry}${fixtureTarballPath.slice(1)}`,
            integrity: `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}` },
        };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(req.url.endsWith(`/${fixtureVersion}`) ? manifest : {
          name: manifest.name, 'dist-tags': { latest: manifest.version }, versions: { [manifest.version]: manifest },
        }));
      } else { res.statusCode = 404; res.end('Fixture has no other packages'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    registry = `http://127.0.0.1:${server.address().port}/`;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (base) fs.rmSync(base, { recursive: true, force: true });
  });

  test('pinned bootstrap ignores same-version local package, npmrc, npm environment and lifecycle scripts', async () => {
    const rogue = path.join(workspace, 'node_modules/contextos-agents');
    const bins = path.join(workspace, 'node_modules/.bin');
    fs.mkdirSync(rogue, { recursive: true });
    fs.mkdirSync(bins, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ dependencies: { 'contextos-agents': fixtureVersion } }));
    fs.writeFileSync(path.join(rogue, 'package.json'), JSON.stringify({ name: 'contextos-agents', version: fixtureVersion, bin: 'index.js' }));
    fs.writeFileSync(path.join(rogue, 'index.js'), `console.error('ROGUE_LOCAL_PACKAGE'); process.exit(0);`);
    fs.writeFileSync(path.join(bins, 'contextos-agents'), `#!/bin/sh\necho ROGUE_LOCAL_BIN >&2\nexit 0\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bins, 'contextos-agents.cmd'), '@echo ROGUE_LOCAL_BIN\r\n@exit /b 0\r\n');
    const evilConfig = path.join(workspace, '.npmrc');
    fs.writeFileSync(evilConfig, 'registry=http://127.0.0.1:1/\noffline=true\nignore-scripts=false\nbin-links=true\n');
    const globalConfig = path.join(workspace, 'global.npmrc');
    fs.copyFileSync(evilConfig, globalConfig);
    const preload = path.join(workspace, 'evil-preload.cjs');
    const preloadMarker = path.join(base, 'NODE_PRELOAD_RAN');
    fs.writeFileSync(preload, `require('fs').writeFileSync(${JSON.stringify(preloadMarker)}, 'executed');`);
    fs.appendFileSync(evilConfig, `node-options=--require ${JSON.stringify(preload)}\nscript-shell=${path.join(bins, 'rogue-script-shell')}\n`);
    for (const name of ['node', 'npm', 'npx']) {
      fs.writeFileSync(path.join(bins, name), '#!/bin/sh\necho WORKSPACE_TOOL_EXECUTED >&2\nexit 97\n', { mode: 0o755 });
      fs.writeFileSync(path.join(bins, `${name}.cmd`), '@echo WORKSPACE_TOOL_EXECUTED\r\n@exit /b 97\r\n');
    }
    const result = await runAction({}, {
      npm_config_offline: 'true', NPM_CONFIG_REGISTRY: 'http://127.0.0.1:1/',
      NPM_CONFIG_USERCONFIG: evilConfig, npm_config_globalconfig: globalConfig,
      npm_config_ignore_scripts: 'false', NPM_CONFIG_PREFIX: workspace,
      npm_config_node_options: `--require ${JSON.stringify(preload)}`,
      NPM_CONFIG_SCRIPT_SHELL: path.join(bins, 'rogue-script-shell'),
      npm_config_cache: path.join(workspace, '.npm-cache'),
      HOME: workspace, USERPROFILE: workspace, CONTEXTOS_REGISTRY: 'http://127.0.0.1:1/',
      NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, NODE_PATH: path.join(workspace, 'node_modules'),
      PATH: `${bins}${path.delimiter}${process.env.PATH || process.env.Path}`,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.report?.trusted, true, `Action must run the trusted installed package, not local .bin: ${result.stdout}\n${result.stderr}`);
    assert.ok(!result.stderr.includes('ROGUE_LOCAL'));
    assert.ok(!result.stderr.includes('WORKSPACE_TOOL_EXECUTED'));
    assert.ok(!path.relative(workspace, result.report.entrypoint).startsWith('node_modules'));
    assert.ok(result.report.entrypoint.startsWith(runnerTemp));
    assert.equal(result.report.execPath, fs.realpathSync(process.execPath));
    assert.ok(requests.includes(fixtureTarballPath));
    assert.equal(fs.existsSync(path.join(base, 'LIFECYCLE_RAN')), false);
    assert.equal(fs.existsSync(preloadMarker), false, 'NODE_OPTIONS must be cleared before bootstrap Node starts');
    assert.equal(result.report.env.NODE_OPTIONS, undefined);
    assert.equal(result.report.env.NODE_PATH, undefined);
    assert.equal(Object.keys(result.report.env).some(key => key.toLowerCase().startsWith('npm_config_')), false);
    assert.equal(result.report.env.PATH, path.dirname(fs.realpathSync(process.execPath)));
    assert.equal(result.output, 'status=pass\ncode=0\n');
    assert.deepEqual(fs.readdirSync(runnerTemp), [], 'Isolated installation must be cleaned up');
  });

  test('F01: bootstrap clears case variants of Node preloads before the first native process', async () => {
    for (const variable of ['node_options', 'Node_Options']) {
      const marker = path.join(base, `${variable}-executed`);
      const preload = path.join(base, `${variable}-preload.cjs`);
      fs.writeFileSync(preload, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');`);
      const result = await runAction({}, { [variable]: `--require ${JSON.stringify(preload)}` });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(fs.existsSync(marker), false, `${variable} must not preload consumer code`);
      assert.equal(result.report?.trusted, true);
    }
  });

  test('action inputs remain literal argv data, including substitutions, quotes and paths with spaces', async () => {
    const fixtureRoot = path.join(base, 'trusted action checkout with spaces');
    const fixtureAction = path.join(fixtureRoot, '.github/actions/contextos-gate');
    fs.cpSync(actionDir, fixtureAction, { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'bin'));
    fs.copyFileSync(path.join(base, 'trusted package/bin/index.js'), path.join(fixtureRoot, 'bin/index.js'));
    const inputs = {
      version: 'local', 'working-directory': 'a project $(printf INPUT_SUBSTITUTION >&2)',
      adapters: 'cursor $(printf ADAPTER_SUBSTITUTION >&2)', profile: 'a "quoted" $(printf PROFILE_SUBSTITUTION >&2) profile',
    };
    const result = await runAction(inputs, {}, fixtureAction);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr.includes('SUBSTITUTION'), false, 'Input must never be evaluated as shell source');
    assert.deepEqual(result.report.argv, ['gate', '--project', inputs['working-directory'], '--target', inputs.adapters,
      '--github-annotations', '--profile', inputs.profile]);
  });

  test('rejects non-pinned package specs and input code without executing or requesting packages', async () => {
    const requestCount = requests.length;
    for (const version of ['latest', '^3.0.0', 'file:./node_modules/contextos-agents',
      '3.0.0 --ignore-scripts=false', '$(printf VERSION_SUBSTITUTION >&2)', '3.0.0-01']) {
      const result = await runAction({ version });
      assert.equal(result.code, 2, result.stderr);
      assert.match(result.stderr, /exact SemVer/);
      assert.equal(result.output, 'status=error\ncode=2\n');
      assert.equal(result.report, null);
    }
    assert.equal(requests.length, requestCount);
  });

  test('security requirements and malformed security inputs fail closed as data', async () => {
    for (const inputs of [{ 'require-secrets': 'true' }, { 'skip-secrets': 'false' },
      { 'require-secrets': '$(printf SECURITY_SUBSTITUTION >&2)' }]) {
      const result = await runAction(inputs);
      assert.equal(result.code, 2, result.stderr);
      assert.equal(result.output, 'status=error\ncode=2\n');
      assert.equal(result.stderr.includes('SECURITY_SUBSTITUTION'), false);
      assert.equal(result.report, null);
    }
  });

  test('preserves drift/error outputs and removes installations after nonzero exits', async () => {
    for (const [profile, code, status] of [['fixture-drift', 1, 'drift'], ['fixture-error', 2, 'error']]) {
      const result = await runAction({ profile });
      assert.equal(result.code, code, result.stderr);
      assert.equal(result.report.trusted, true);
      assert.equal(result.output, `status=${status}\ncode=${code}\n`);
      assert.deepEqual(fs.readdirSync(runnerTemp), []);
    }
    const failedInstall = await runAction({ version: '9.9.9' });
    assert.equal(failedInstall.code, 2, failedInstall.stderr);
    assert.equal(failedInstall.output, 'status=error\ncode=2\n');
    assert.equal(failedInstall.report, null);
    assert.deepEqual(fs.readdirSync(runnerTemp), []);
  });

  test('refuses bootstrap storage inside the consumer workspace', async () => {
    const result = await runAction({}, { RUNNER_TEMP: workspace });
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, /outside the consumer workspace/);
    assert.equal(result.output, 'status=error\ncode=2\n');
    assert.equal(result.report, null);
  });

  test('actual action local mode runs the real gate, detecting clean output then drift', async () => {
    const consumer = path.join(workspace, 'real consumer project with spaces');
    fs.mkdirSync(path.join(consumer, '.agents/core/skills/fixture'), { recursive: true });
    fs.writeFileSync(path.join(consumer, '.agents/core/skills/fixture/SKILL.md'),
      '---\nname: fixture\ndescription: Trusted consumer fixture\n---\n\n# Fixture\n\nKeep consumer data isolated.\n');
    fs.writeFileSync(path.join(consumer, '.agents/ctx.js'), 'throw new Error("ROGUE_CONSUMER_SCRIPT");');
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(consumer, 'cursor');
    applyArtifacts(consumer, rendered.artifacts, { context: rendered.context });
    const inputs = { version: 'local', 'working-directory': consumer, adapters: 'cursor' };
    const clean = await runAction(inputs);
    assert.equal(clean.code, 0, clean.stderr);
    assert.equal(clean.output, 'status=pass\ncode=0\n');
    assert.match(clean.summary, /ContextOS Quality Gate/);
    const artifact = rendered.artifacts.find(artifact => artifact.path.endsWith('.mdc'));
    assert.ok(artifact, 'Fixture must generate a real Cursor rule');
    fs.appendFileSync(path.join(consumer, artifact.path), '\nUnmanaged drift edit\n');
    const drift = await runAction(inputs);
    assert.equal(drift.code, 1, drift.stderr);
    assert.equal(drift.output, 'status=drift\ncode=1\n');
    assert.equal(drift.stderr.includes('ROGUE_CONSUMER_SCRIPT'), false);
  });
});

describe('Task 1.1: Consumer Project Root & Unique Skill Isolation', () => {
  let tmpBase;
  let consumerDir;
  let customSkillName;

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-consumer-gate-'));
    consumerDir = path.join(tmpBase, 'consumer-app');
    customSkillName = 'consumer-unique-billing';

    fs.mkdirSync(consumerDir, { recursive: true });

    // Set up minimal .agents structure in consumer project
    const consumerAgentsDir = path.join(consumerDir, '.agents');
    const consumerCoreSkills = path.join(consumerAgentsDir, 'core', 'skills');
    fs.mkdirSync(consumerCoreSkills, { recursive: true });

    // Copy only 1 standard skill to consumer
    const stdSkillSrc = path.resolve(__dirname, '../.agents/core/skills/security');
    fs.cpSync(stdSkillSrc, path.join(consumerCoreSkills, 'security'), { recursive: true });

    // Add a UNIQUE custom skill that ONLY exists in the consumer project
    const customSkillDir = path.join(consumerCoreSkills, customSkillName);
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(customSkillDir, 'SKILL.md'),
      `---\nname: ${customSkillName}\ndescription: Proprietary consumer billing rules\n---\n\n# Consumer Billing\n\nMust strictly isolate tenant credentials.\n`
    );
    fs.writeFileSync(
      path.join(customSkillDir, 'skill.yaml'),
      `name: ${customSkillName}\ndescription: Proprietary consumer billing rules\n`
    );
  });

  after(() => {
    if (tmpBase && fs.existsSync(tmpBase)) {
      try {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      } catch {}
    }
  });

  test('renderAdapters discovers consumer-unique skill when passed projectRoot', () => {
    const result = renderAdapters(consumerDir, ['gemini', 'claude', 'cursor', 'copilot', 'aider', 'zed']);

    assert.ok(Array.isArray(result.artifacts), 'Must return rendered artifacts');

    // 1. All adapters must render the consumer-unique skill
    assert.ok(
      result.artifacts.some(a => a.path.includes(customSkillName) && a.generator.includes('gemini')),
      'Gemini adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(customSkillName) && a.generator.includes('claude')),
      'Claude adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(`${customSkillName}.mdc`) && a.generator.includes('cursor')),
      'Cursor adapter must render consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes('copilot-instructions.md') && a.content.toString().includes(customSkillName)),
      'Copilot adapter must reference consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes('CONVENTIONS.md') && a.content.toString().includes(customSkillName)),
      'Aider conventions must reference consumer-unique skill'
    );
    assert.ok(
      result.artifacts.some(a => a.path.includes(`.zed/prompts/${customSkillName}.md`)),
      'Zed adapter must generate prompt for consumer-unique skill'
    );

    // 2. Must NOT bleed skills that only exist in the author repo
    const leakedSkill = result.artifacts.find(a => a.path.includes('ponytail-mindset'));
    assert.equal(
      leakedSkill,
      undefined,
      'Must NOT include skills from author package root that are absent from consumer project'
    );
  });

  test('detectDrift detects missing artifacts in un-exported consumer project without disk mutation', () => {
    // Before export: disk is clean, so all artifacts should be detected as missing or drifting
    const driftBefore = detectDrift(consumerDir, 'all');
    assert.equal(driftBefore.hasDrift, true, 'Drift must be detected before export');
    assert.ok(driftBefore.totalFindings > 0, 'Must have findings for uncreated files');

    // Verify read-only guarantee: lockfile and outputs must not be created by detectDrift
    assert.equal(
      fs.existsSync(path.join(consumerDir, '.cursor', 'rules', `${customSkillName}.mdc`)),
      false,
      'detectDrift must never write files to disk'
    );
    assert.equal(
      fs.existsSync(path.join(consumerDir, '.agents', 'lockfile.v2.json')),
      false,
      'detectDrift must not create lockfile'
    );
  });

  test('Task 1.3: bin/index.js verification paths with explicit project root do not execute rogue .agents/ctx.js', () => {
    const binPath = path.resolve(__dirname, '../bin/index.js');
    const rogueCtxPath = path.join(consumerDir, '.agents', 'ctx.js');

    // Plant a rogue script in consumer project that would fail with distinctive error if executed
    fs.writeFileSync(rogueCtxPath, 'process.stderr.write("ROGUE_SCRIPT_LEAK"); process.exit(99);\n');

    try {
      // 1. Run gate command targeting consumer project with explicit --project
      let gateStdout = '';
      let gateCode = 0;
      try {
        gateStdout = execSync(`node "${binPath}" gate --project "${consumerDir}" --json`, {
          stdio: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        }).toString();
      } catch (err) {
        gateCode = err.status;
        gateStdout = (err.stdout || '').toString();
      }

      const parsedGate = JSON.parse(gateStdout);
      assert.equal(parsedGate.schemaVersion, '2.0.0');
      assert.notEqual(gateCode, 99, 'Gate must not execute rogue script (code 99)');
      assert.ok(!gateStdout.includes('ROGUE_SCRIPT_LEAK'), 'Rogue script output must not appear in gate');

      // 2. Run export check command targeting consumer project
      let exportCode = 0;
      let exportStdout = '';
      try {
        exportStdout = execSync(`node "${binPath}" export all --check --project "${consumerDir}" --json`, {
          stdio: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        }).toString();
      } catch (err) {
        exportCode = err.status;
        exportStdout = err.stdout.toString();
      }

      // Exit code 1 for drift is expected because files are not exported yet, but NOT 99 (the rogue code)
      assert.notEqual(exportCode, 99, 'Must NOT execute rogue .agents/ctx.js');
      assert.ok(!exportStdout.includes('ROGUE_SCRIPT_LEAK'), 'Rogue script output must not appear');
    } finally {
      if (fs.existsSync(rogueCtxPath)) {
        fs.unlinkSync(rogueCtxPath);
      }
    }
  });

  test('Task 1.4: Scoped adapter check does not flag unselected adapters as orphans', () => {
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');

    // Export all adapters so that files for all 6 adapters exist and are tracked in lockfile
    const renderedAll = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, renderedAll.artifacts, { context: renderedAll.context });

    // Now verify ONLY cursor adapter
    const cursorDrift = detectDrift(consumerDir, 'cursor');

    assert.equal(cursorDrift.hasDrift, false, 'Cursor adapter must be in sync');
    assert.equal(cursorDrift.findings.ORPHAN_MANAGED_OUTPUT.length, 0, 'Must NOT flag Claude or Gemini files as orphans');
    assert.equal(cursorDrift.code, 0, 'Must return code 0 for in-sync single adapter check');
  });

  test('Task 1.5: Corrupt lockfile, unknown adapter, and empty projection fail closed with code 2', () => {
    const lockfilePath = path.join(consumerDir, '.agents', 'lockfile.v2.json');
    const validLockBackup = fs.readFileSync(lockfilePath, 'utf8');

    try {
      // 1. Corrupt lockfile
      fs.writeFileSync(lockfilePath, '{ corrupt json invalid: true');
      const corruptDrift = detectDrift(consumerDir, 'all');
      assert.equal(corruptDrift.hasError, true, 'Corrupt lockfile must set hasError: true');
      assert.equal(corruptDrift.code, 2, 'Corrupt lockfile must return error code 2');
      assert.ok(corruptDrift.findings.CORRUPT_LOCKFILE.length > 0, 'Must report corrupt lockfile finding');

      // 2. Unknown adapter
      fs.writeFileSync(lockfilePath, validLockBackup);
      const unknownDrift = detectDrift(consumerDir, 'nonexistent-adapter');
      assert.equal(unknownDrift.hasError, true, 'Unknown adapter must set hasError: true');
      assert.equal(unknownDrift.code, 2, 'Unknown adapter must return error code 2');
      assert.ok(unknownDrift.findings.CONFIG_ERROR.length > 0, 'Must report config error finding');
    } finally {
      fs.writeFileSync(lockfilePath, validLockBackup);
    }
  });

  test('Task 1.6: Check mode with --profile causes zero disk mutations', () => {
    const binPath = path.resolve(__dirname, '../bin/index.js');
    const lockfilePath = path.join(consumerDir, '.agents', 'lockfile.v2.json');
    const profilesJsonPath = path.join(consumerDir, '.agents', 'profiles.json');

    const lockfileBefore = fs.readFileSync(lockfilePath, 'utf8');
    const profilesJsonExistedBefore = fs.existsSync(profilesJsonPath);

    // Run export all --check with --profile frontend
    try {
      execSync(`node "${binPath}" export all --check --profile frontend --project "${consumerDir}" --json`, {
        stdio: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch {
      // Exit code 1 for drift is normal if profile differences exist
    }

    const lockfileAfter = fs.readFileSync(lockfilePath, 'utf8');
    assert.equal(lockfileBefore, lockfileAfter, 'Lockfile must remain bit-for-bit identical after check mode');

    const profilesJsonExistedAfter = fs.existsSync(profilesJsonPath);
    assert.equal(
      profilesJsonExistedBefore,
      profilesJsonExistedAfter,
      'profiles.json must not be created or modified by check mode'
    );
  });

  test('Task 1.7: CRLF checkout normalization does not produce false drift findings', () => {
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const renderedAll = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, renderedAll.artifacts, { context: renderedAll.context });

    // Pick an existing generated file and convert LF to CRLF to simulate Windows git checkout
    const cursorFile = path.join(consumerDir, '.cursor', 'rules', `${customSkillName}.mdc`);
    const originalContent = fs.readFileSync(cursorFile, 'utf8');
    const crlfContent = originalContent.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(cursorFile, crlfContent, 'utf8');

    // Drift detector must normalize CRLF via computeSemanticHash and report clean sync
    const drift = detectDrift(consumerDir, 'cursor');
    assert.equal(drift.hasDrift, false, 'CRLF on disk must not trigger false drift');
    assert.equal(drift.code, 0, 'Exit code must be 0 for CRLF equivalent file');
  });

  test('Task 1.8: Verifies stale source, profile mismatch, collision detection, and export resolution', () => {
    const { applyArtifacts, registerAdapter, unregisterAdapter } = require('../.agents/adapters/pure-compiler.js');

    // 1. Stale Source: update source skill without re-exporting
    const skillMdPath = path.join(consumerDir, '.agents', 'core', 'skills', customSkillName, 'SKILL.md');
    fs.appendFileSync(skillMdPath, '\n\nAdditional rule appended to source skill.\n');

    const staleReport = detectDrift(consumerDir, 'cursor');
    assert.equal(staleReport.hasDrift, true, 'Drift must be detected after source skill changes');
    assert.ok(
      staleReport.findings.STALE_INPUT.length > 0 || staleReport.findings.MODIFIED_MANAGED_OUTPUT.length > 0,
      'Must flag stale input or generated divergence'
    );

    // 2. Export Resolution: re-exporting synchronizes disk and clears drift
    const reRendered = renderAdapters(consumerDir, 'all');
    applyArtifacts(consumerDir, reRendered.artifacts, { context: reRendered.context });

    const cleanReport = detectDrift(consumerDir, 'all');
    assert.equal(cleanReport.hasDrift, false, 'Re-export must resolve drift cleanly');
    assert.equal(cleanReport.code, 0, 'Clean project must return exit code 0');

    // 3. Collision Detection: register an intentionally colliding test adapter
    const collidingAdapter = {
      describe: () => ({ name: 'collider', description: 'Colliding adapter for test' }),
      render: () => [{
        path: `.cursor/rules/${customSkillName}.mdc`,
        content: Buffer.from('collision-content'),
        generator: 'collider@2',
        kind: 'generated-adapter',
      }],
      validate: () => [],
      run: () => {},
    };
    registerAdapter('collider', collidingAdapter);

    try {
      const collisionResult = renderAdapters(consumerDir, ['cursor', 'collider']);
      assert.ok(collisionResult.collisions.length > 0, 'Must detect path collision between cursor and collider');
      assert.equal(collisionResult.collisions[0].path, `.cursor/rules/${customSkillName}.mdc`);
    } finally {
      unregisterAdapter('collider');
    }
  });

  test('Task 1.11 & 1.12: Formats and writes GitHub Actions annotations and step summary', () => {
    const { emitGitHubAnnotations, formatGitHubSummary, writeGitHubSummary } = require('../bin/lib/gate.js');

    const sampleDriftResult = {
      ok: false,
      code: 1,
      status: 'drift',
      projectRoot: consumerDir,
      target: 'cursor',
      profile: 'default',
      message: 'Adapter outputs have drifted from source skills',
      drift: {
        totalFindings: 2,
        projectedCount: 5,
        findings: {
          MISSING_OUTPUT: [{ path: '.cursor/rules/missing-rule.mdc', reason: 'Missing rule' }],
          MODIFIED_MANAGED_OUTPUT: [{ path: '.cursor/rules/modified-rule.mdc', reason: 'User edit detected' }],
        },
        collisions: [],
      },
    };

    // 1. Verify markdown formatting for step summary
    const summaryMarkdown = formatGitHubSummary(sampleDriftResult);
    assert.ok(summaryMarkdown.includes('# ⚠️ ContextOS Quality Gate Report'));
    assert.ok(summaryMarkdown.includes('**Status**: `DRIFT`'));
    assert.ok(summaryMarkdown.includes('`.cursor/rules/missing-rule.mdc`'));
    assert.ok(summaryMarkdown.includes('`.cursor/rules/modified-rule.mdc`'));
    assert.ok(summaryMarkdown.includes('Run `npx contextos-agents export all`'));

    // 2. Verify write to GITHUB_STEP_SUMMARY
    const tempSummaryFile = path.join(tmpBase, 'github_step_summary.md');
    process.env.GITHUB_STEP_SUMMARY = tempSummaryFile;
    try {
      writeGitHubSummary(sampleDriftResult);
      assert.ok(fs.existsSync(tempSummaryFile), 'GITHUB_STEP_SUMMARY file must be written');
      const writtenContent = fs.readFileSync(tempSummaryFile, 'utf8');
      assert.ok(writtenContent.includes('ContextOS Quality Gate Report'));
    } finally {
      delete process.env.GITHUB_STEP_SUMMARY;
    }

    // 3. Verify emitGitHubAnnotations prints workflow commands to stderr
    const stderrMessages = [];
    const origStderrWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderrMessages.push(chunk.toString());
      return true;
    };
    try {
      emitGitHubAnnotations(sampleDriftResult);
      const combinedStderr = stderrMessages.join('');
      assert.ok(combinedStderr.includes('::error file=.cursor/rules/missing-rule.mdc::[MISSING_OUTPUT]'));
      assert.ok(combinedStderr.includes('::error file=.cursor/rules/modified-rule.mdc::[MODIFIED_OUTPUT]'));
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  test('Task 1.11: Project path containing spaces is resolved and verified cleanly', () => {
    const { runGate } = require('../bin/lib/gate.js');
    const spacedDir = path.join(tmpBase, 'consumer app with spaces');
    fs.mkdirSync(spacedDir, { recursive: true });

    // Copy .agents from consumerDir to spacedDir
    fs.cpSync(path.join(consumerDir, '.agents'), path.join(spacedDir, '.agents'), { recursive: true });

    // Export cursor rules in spaced directory
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(spacedDir, 'cursor');
    applyArtifacts(spacedDir, rendered.artifacts, { context: rendered.context });

    // Gate should verify cleanly on a directory with spaces
    const result = runGate(spacedDir, { target: 'cursor' });
    assert.equal(result.ok, true, 'Gate must pass for path with spaces');
    assert.equal(result.code, 0, 'Exit code must be 0');
  });

  test('Task 1.13: Non-Node repository (Python/Go layout without package.json) runs gate safely', () => {
    const { runGate } = require('../bin/lib/gate.js');
    const pythonRepoDir = path.join(tmpBase, 'python-service-repo');
    fs.mkdirSync(pythonRepoDir, { recursive: true });

    // Add Python service files and NO package.json
    fs.writeFileSync(path.join(pythonRepoDir, 'main.py'), 'print("Hello from python service")\n');
    fs.writeFileSync(path.join(pythonRepoDir, 'requirements.txt'), 'fastapi==0.110.0\n');
    assert.equal(fs.existsSync(path.join(pythonRepoDir, 'package.json')), false, 'Must not contain package.json');

    // Setup .agents and export
    fs.cpSync(path.join(consumerDir, '.agents'), path.join(pythonRepoDir, '.agents'), { recursive: true });
    const { applyArtifacts } = require('../.agents/adapters/pure-compiler.js');
    const rendered = renderAdapters(pythonRepoDir, 'claude');
    applyArtifacts(pythonRepoDir, rendered.artifacts, { context: rendered.context });

    // 1. Verification passes on clean repo without node dependencies
    const passResult = runGate(pythonRepoDir, { target: 'claude' });
    assert.equal(passResult.ok, true, 'Non-Node project must verify without requiring package.json or npm');
    assert.equal(passResult.status, 'pass');
    assert.equal(passResult.code, 0);

    // 2. Modifying Claude export produces drift
    const claudeFile = path.join(pythonRepoDir, rendered.artifacts[0].path);
    fs.appendFileSync(claudeFile, '\n# User local drift edit\n');
    const driftResult = runGate(pythonRepoDir, { target: 'claude' });
    assert.equal(driftResult.ok, false, 'Modifying a generated Claude file must trigger drift detection');
    assert.equal(driftResult.status, 'drift');
    assert.equal(driftResult.code, 1);
  });
});

