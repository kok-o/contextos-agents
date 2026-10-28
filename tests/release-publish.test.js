'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest, packages, corePrerelease, verifyLocal, registryArchive, publishPair } = require('../scripts/publish-release-pair.cjs');
const { releaseIdentity, verifyArchive } = require('../scripts/release-identity.cjs');
function npmCli() {
  const nodeDirectory = path.dirname(process.execPath);
  const cli = [process.env.npm_execpath,
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js')]
    .find(file => file && fs.existsSync(file));
  assert.ok(cli, 'Cannot locate npm-cli.js for the publisher fixtures');
  return cli;
}
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-release-publish-')));
  t.after(() => {
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ctx-release-publish-'));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
  });
  return ['contextos-agents', 'contextos-mcp'].map((name, index) => {
    const archive = path.join(directory, `${index}.tgz`);
    const bytes = Buffer.from(`verified archive ${index}`);
    fs.writeFileSync(archive, bytes);
    return { name, version: index ? '0.4.0' : '2.3.0', archive, sha256: digest(bytes), bytes };
  });
}
function runner(pair, publish) {
  return args => {
    if (args[0] === 'whoami') return '"publisher"';
    if (args[0] === 'access') {
      assert.deepEqual(args.slice(0, 3), ['access', 'list', 'collaborators']);
      assert.ok(pair.some(pkg => pkg.name === args[3]));
      return JSON.stringify({ publisher: 'read-write' });
    }
    assert.equal(args[0], 'publish');
    assert.ok(args.includes('--ignore-scripts'));
    publish(pair.find(pkg => pkg.archive === args[1]));
    return '';
  };
}

test('independent identities reject other tags, lockfiles and archive bytes', t => {
  const [tmp] = fixture(t);
  const root = path.dirname(tmp.archive);
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(data));
  };
  const make = (folder, name, version, kind, tag) => {
    write(`${folder}/package.json`, { name, version });
    write(`${folder}/package-lock.json`, { name, version, packages: { '': { name, version } } });
    const npm = npmCli();
    const packed = JSON.parse(require('node:child_process').execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', root], { cwd: path.join(root, folder), encoding: 'utf8' }))[0];
    const file = packed.filename;
    write(`docs/release-identities/${kind}-${version}.json`, { kind, name, version, file, sha256: digest(fs.readFileSync(path.join(root, file))) });
    const selected = releaseIdentity(kind, tag, root, root);
    verifyArchive(selected);
    return selected;
  };
  const core = make('.', 'contextos-agents', '7.1.0', 'core-stable', 'v7.1.0');
  const mcp = make('contextos-mcp', 'contextos-mcp', '1.2.0', 'mcp', 'mcp-v1.2.0');
  assert.throws(() => releaseIdentity('core-stable', 'mcp-v1.2.0', root, root), /identity mismatch/);
  assert.throws(() => releaseIdentity('mcp', 'v7.1.0', root, root), /identity mismatch/);
  write('contextos-mcp/package.json', { name: 'contextos-mcp', version: '1.3.0' });
  assert.deepEqual(releaseIdentity('core-stable', 'v7.1.0', root, root), core);
  assert.throws(() => releaseIdentity('mcp', 'mcp-v1.3.0', root, root), /identity mismatch/);
  write('contextos-mcp/package.json', { name: 'contextos-mcp', version: '1.2.0' });
  write('package.json', { name: 'contextos-agents', version: '7.2.0' });
  assert.deepEqual(releaseIdentity('mcp', 'mcp-v1.2.0', root, root), mcp);
  write('package.json', { name: 'contextos-agents', version: '07.1.0' });
  write('package-lock.json', { name: 'contextos-agents', version: '07.1.0', packages: { '': { name: 'contextos-agents', version: '07.1.0' } } });
  assert.throws(() => releaseIdentity('core-stable', 'v07.1.0', root, root), /identity mismatch/);
  fs.writeFileSync(mcp.archive, 'tampered');
  assert.throws(() => verifyArchive(mcp), /hash mismatch/);
  fs.copyFileSync(core.archive, mcp.archive);
  assert.throws(() => verifyArchive({ ...mcp, sha256: digest(fs.readFileSync(mcp.archive)) }), /archive package identity mismatch/);
});

test('single-package CLI prepares only the requested synthetic archive and rejects a bad tag', t => {
  const [tmp] = fixture(t);
  const root = path.dirname(tmp.archive);
  const repo = path.resolve(__dirname, '..');
  for (const file of ['scripts/publish-release.cjs', 'scripts/release-identity.cjs', 'scripts/publish-release-pair.cjs', 'scripts/release-package-surface.cjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(repo, file), path.join(root, file));
  }
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
  const pkg = { name: 'contextos-agents', version: '7.1.0', files: ['NOTICE', 'bin/index.js', '.agents'] };
  write('package.json', JSON.stringify(pkg));
  write('package-lock.json', JSON.stringify({ name: pkg.name, version: pkg.version, packages: { '': { name: pkg.name, version: pkg.version } } }));
  for (const file of ['README.md', 'LICENSE', 'NOTICE', 'bin/index.js', '.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js']) write(file, 'fixture\n');
  const destination = path.join(root, 'scratch/release-candidate');
  fs.mkdirSync(destination, { recursive: true });
  const npm = npmCli();
  require('node:child_process').execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: root });
  const file = `${pkg.name}-${pkg.version}.tgz`;
  write('docs/release-identities/core-stable-7.1.0.json', JSON.stringify({ kind: 'core-stable', ...pkg, file, sha256: digest(fs.readFileSync(path.join(destination, file))) }));
  const run = tag => require('node:child_process').spawnSync(process.execPath, ['scripts/publish-release.cjs', 'prepare', 'core-stable'], { cwd: root, env: { ...process.env, RELEASE_TAG: tag }, encoding: 'utf8' });
  const denied = run('mcp-v7.1.0');
  assert.equal(denied.status, 1);
  assert.match(denied.stderr, /identity mismatch/);
  const result = run('v7.1.0');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(destination), [file]);
});

test('MCP release preparation and secret scan run with release tooling but no core checkout', t => {
  const [tmp] = fixture(t);
  const root = path.dirname(tmp.archive);
  const repo = path.resolve(__dirname, '..');
  for (const file of ['scripts/publish-release.cjs', 'scripts/release-identity.cjs', 'scripts/publish-release-pair.cjs', 'scripts/release-package-surface.cjs', 'scripts/check-release-secrets.cjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(repo, file), path.join(root, file));
  }
  const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), data); };
  const name = 'contextos-mcp', version = '1.2.0', kind = 'mcp';
  write('contextos-mcp/package.json', JSON.stringify({ name, version, files: ['bin', 'dist'] }));
  write('contextos-mcp/package-lock.json', JSON.stringify({ name, version, packages: { '': { name, version } } }));
  for (const file of ['README.md', 'bin/mcp.mjs', 'dist/contextos/loader.js', 'dist/mcp/server.js']) write(`contextos-mcp/${file}`, 'fixture\n');
  const directory = path.join(root, 'scratch/release-candidate'); fs.mkdirSync(directory, { recursive: true });
  const npm = npmCli();
  const packed = JSON.parse(require('node:child_process').execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: path.join(root, 'contextos-mcp'), encoding: 'utf8' }))[0];
  const bytes = fs.readFileSync(path.join(directory, packed.filename));
  write(`docs/release-identities/${kind}-${version}.json`, JSON.stringify({ kind, name, version, file: packed.filename, sha256: digest(bytes) }));
  const run = (script, args, env = {}) => require('node:child_process').spawnSync(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  const prepare = run('scripts/publish-release.cjs', ['prepare', kind], { RELEASE_TAG: `mcp-v${version}` });
  assert.equal(prepare.status, 0, prepare.stderr);
  assert.equal(run('scripts/publish-release.cjs', ['verify', kind], { RELEASE_TAG: `mcp-v${version}` }).status, 0);
  fs.appendFileSync(path.join(directory, packed.filename), 'tamper');
  assert.notEqual(run('scripts/publish-release.cjs', ['verify', kind], { RELEASE_TAG: `mcp-v${version}` }).status, 0);
  fs.writeFileSync(path.join(directory, packed.filename), bytes);
  require('node:child_process').execFileSync('git', ['init', '-q'], { cwd: root });
  const scan = () => run('scripts/check-release-secrets.cjs', ['--all', '--mcp-only']);
  assert.equal(scan().status, 0);
  write('contextos-mcp/leak.js', `const token = '${'ghp_' + 'Q7'.repeat(18)}';\n`);
  assert.equal(scan().status, 1);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  assert.equal(fs.existsSync(path.join(root, 'bin')), false);
});

test('workflow publisher implementation publishes each selected identity once using controlled mocks', async t => {
  const [tmp] = fixture(t);
  const root = path.dirname(tmp.archive);
  const { main } = require('../scripts/publish-release.cjs');
  const npm = npmCli();
  const directory = path.join(root, 'scratch/release-candidate');
  fs.mkdirSync(directory, { recursive: true });
  const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(data)); };
  for (const [kind, folder, name, version, releaseTag, distTag] of [
    ['core-stable', '.', 'contextos-agents', '7.1.0', 'v7.1.0', 'latest'],
    ['core-rc', '.', 'contextos-agents', '7.2.0-rc.1', 'v7.2.0-rc.1', 'next'],
    ['mcp', 'contextos-mcp', 'contextos-mcp', '1.2.0', 'mcp-v1.2.0', 'latest'],
  ]) {
    write(`${folder}/package.json`, { name, version });
    write(`${folder}/package-lock.json`, { name, version, packages: { '': { name, version } } });
    const packed = JSON.parse(require('node:child_process').execFileSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: path.join(root, folder), encoding: 'utf8' }))[0];
    const bytes = fs.readFileSync(path.join(directory, packed.filename));
    write(`docs/release-identities/${kind}-${version}.json`, { kind, name, version, file: packed.filename, sha256: digest(bytes) });
    let uploaded = false; const calls = [];
    const inspect = async pkg => { assert.equal(pkg.name, name); assert.equal(pkg.version, version); return uploaded ? bytes : null; };
    const runNpm = args => {
      calls.push(args);
      if (args[0] === 'whoami') return '"publisher"';
      if (args[0] === 'access') {
        assert.deepEqual(args.slice(0, 4), ['access', 'list', 'collaborators', name]);
        return JSON.stringify({ publisher: 'read-write' });
      }
      assert.equal(args[0], 'publish');
      assert.equal(args[1], path.join(directory, packed.filename));
      assert.ok(args.includes('--ignore-scripts'));
      assert.deepEqual(args.slice(-2), ['--tag', distTag]);
      uploaded = true;
      return '';
    };
    await main('publish', kind, { projectRoot: root, releaseTag, publishOptions: { inspect, runNpm } });
    await main('publish', kind, { projectRoot: root, releaseTag, publishOptions: { inspect, runNpm: () => assert.fail('already published') } });
    assert.equal(calls.filter(args => args[0] === 'publish').length, 1);
    await assert.rejects(main('publish', kind, { projectRoot: root, releaseTag, publishOptions: { inspect: async () => { throw new Error('existing archive differs'); }, runNpm: () => assert.fail('mismatch') } }), /differs/);
    fs.appendFileSync(path.join(directory, packed.filename), 'tamper');
    await assert.rejects(main('publish', kind, { projectRoot: root, releaseTag, publishOptions: { inspect: () => assert.fail('network'), runNpm: () => assert.fail('npm') } }), /hash mismatch/);
    fs.writeFileSync(path.join(directory, packed.filename), bytes);
    await assert.rejects(main('publish', kind, { projectRoot: root, releaseTag: 'invalid', publishOptions: { inspect: () => assert.fail('network') } }), /identity mismatch/);
  }
});

test('the stable paired publisher rejects a core release candidate before reading MCP', t => {
  const pair = fixture(t);
  const root = path.dirname(pair[0].archive);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'contextos-agents', version: '3.0.0-rc.1' }));
  assert.throws(() => packages(root, root), /Expected a stable core release version/);
});

test('core RC publication requires matching versions, next tag and a reviewed hash without MCP', t => {
  const [archive] = fixture(t);
  const root = path.dirname(archive.archive);
  const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data));
  const pkg = { name: 'contextos-agents', version: '3.0.0-rc.1', publishConfig: { tag: 'next' } };
  const lock = { version: pkg.version, packages: { '': { version: pkg.version } } };
  fs.mkdirSync(path.join(root, 'docs'));
  const manifest = { version: pkg.version, file: `${pkg.name}-${pkg.version}.tgz`, sha256: archive.sha256 };
  write('package.json', pkg);
  write('package-lock.json', lock);
  write('docs/release-core-rc.json', manifest);
  fs.copyFileSync(archive.archive, path.join(root, manifest.file));
  assert.equal(corePrerelease(root, root).name, pkg.name);
  verifyLocal([corePrerelease(root, root)]);
  for (const invalid of [{ ...pkg, version: '3.0.0' }, { ...pkg, publishConfig: { tag: 'latest' } }, { ...pkg, name: 'contextos-mcp' }]) {
    write('package.json', invalid);
    assert.throws(() => corePrerelease(root, root), /matching core RC identity/);
  }
  write('package.json', pkg);
  write('package-lock.json', { ...lock, version: '2.3.2' });
  assert.throws(() => corePrerelease(root, root), /matching core RC identity/);
  write('package-lock.json', lock);
  write('docs/release-core-rc.json', { ...manifest, version: '3.0.0-rc.2' });
  assert.throws(() => corePrerelease(root, root), /reviewed archive identity/);
  write('docs/release-core-rc.json', { ...manifest, sha256: '0'.repeat(64) });
  assert.throws(() => verifyLocal([corePrerelease(root, root)]), /differs/);
});

test('Core RC explicitly publishes to next and retries without uploading an existing archive', async t => {
  const pair = fixture(t).slice(0, 1);
  pair[0].version = '3.0.0-rc.1';
  let published = false;
  const calls = [];
  const inspect = async () => published ? pair[0].bytes : null;
  await publishPair(pair, { tag: 'next', inspect, runNpm: args => {
    calls.push(args);
    return runner(pair, () => { published = true; })(args);
  } });
  const upload = calls.find(args => args[0] === 'publish');
  assert.deepEqual(upload.slice(-2), ['--tag', 'next']);
  assert.equal(calls.filter(args => args[0] === 'publish').length, 1);
  await publishPair(pair, { tag: 'next', inspect, runNpm: () => assert.fail('existing RC must not be uploaded again') });
});

test('single-package publication touches only its selected package and explicitly sets its tag', async t => {
  const pair = fixture(t);
  for (const [pkg, tag] of [[pair[0], 'latest'], [pair[1], 'latest'], [pair[0], 'next']]) {
    const calls = []; let uploaded = false;
    await publishPair([pkg], {
      tag,
      inspect: async item => { assert.equal(item, pkg); return uploaded ? pkg.bytes : null; },
      runNpm: args => { calls.push(args); return runner([pkg], item => { assert.equal(item, pkg); uploaded = true; })(args); },
    });
    const published = calls.filter(args => args[0] === 'publish');
    assert.equal(published.length, 1);
    assert.equal(published[0][1], pkg.archive);
    assert.deepEqual(published[0].slice(-2), ['--tag', tag]);
    await publishPair([pkg], { tag, inspect: async () => pkg.bytes, runNpm: () => assert.fail('retry must not publish again') });
  }
});

test('release workflow event gates and actual publisher commands select exactly one path', () => {
  const { parse } = require('yaml');
  const read = name => parse(fs.readFileSync(path.resolve(__dirname, '../.github/workflows', name), 'utf8'));
  const stable = read('publish.yml');
  const rc = read('publish-core-rc.yml');
  const workflows = [[stable, 'core-stable'], [rc, 'core-rc']];
  // Core release checks cannot depend on an optional companion workflow. The
  // MCP publisher still has synthetic identity, recovery and command fixtures
  // above; inspect its real workflow only in a checkout that provides it.
  const mcpWorkflow = path.resolve(__dirname, '../.github/workflows/publish-mcp.yml');
  const checkMcpWorkflow = process.env.CONTEXTOS_CORE_ONLY_TESTS !== '1' && fs.existsSync(mcpWorkflow);
  if (checkMcpWorkflow) workflows.push([read('publish-mcp.yml'), 'mcp']);
  function gate(expression, tag, prerelease) {
    const terms = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').split(/\s*&&\s*/);
    return terms.every(term => {
      const negate = term.startsWith('!');
      const input = negate ? term.slice(1) : term;
      let value;
      if (input === 'github.event.release.prerelease') value = prerelease;
      else {
        const match = /^(startsWith|contains)\(github\.event\.release\.tag_name, '([^']+)'\)$/.exec(input);
        assert.ok(match, `Unsupported workflow condition: ${term}`);
        value = match[1] === 'startsWith' ? tag.startsWith(match[2]) : tag.includes(match[2]);
      }
      return negate ? !value : value;
    });
  }
  for (const [workflow, kind] of workflows) {
    assert.equal(workflow.jobs.verify.needs, 'prepare');
    assert.deepEqual(workflow.jobs.publish.needs, ['prepare', 'verify']);
    assert.equal(workflow.jobs.registry.needs, 'publish');
    assert.equal(workflow.jobs.verify.steps.some(step => step.env?.NODE_AUTH_TOKEN), false);
    assert.equal(workflow.jobs.prepare.steps.some(step => step.env?.NODE_AUTH_TOKEN), false);
    assert.ok(workflow.jobs.prepare.steps.some(step => step.run === `node scripts/publish-release.cjs prepare ${kind}`));
    assert.ok(workflow.jobs.verify.steps.some(step => step.run === `node scripts/publish-release.cjs verify ${kind}`));
    const artifactName = workflow.jobs.prepare.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).with.name;
    for (const job of [workflow.jobs.verify, workflow.jobs.publish]) {
      assert.equal(job.steps.find(step => step.uses?.startsWith('actions/download-artifact@')).with.name, artifactName);
    }
    assert.equal(workflow.jobs.publish.steps.find(step => step.env?.NODE_AUTH_TOKEN).run, `node scripts/publish-release.cjs publish ${kind}`);
    assert.ok(workflow.jobs.registry.steps.some(step => step.run === `node scripts/publish-release.cjs download ${kind}`));
    if (kind !== 'mcp') assert.equal(workflow.jobs.verify.steps.some(step => step['working-directory']?.includes('contextos-mcp')), false);
    else assert.equal(workflow.jobs.verify.steps.some(step => step.run === 'npm run build' && !step['working-directory']), false);
  }
  for (const [tag, prerelease, expected] of [['v7.1.0', false, 'core-stable'], ['v7.1.0-rc.1', true, 'core-rc'], ['mcp-v1.2.0', false, 'mcp'], ['mcp-v1.2.0', true, null], ['v7.1.0-rc.1', false, null]]) {
    const active = workflows.filter(([workflow]) => gate(workflow.jobs.prepare.if, tag, prerelease)).map(([, kind]) => kind);
    const expectedActive = expected === 'mcp' && !checkMcpWorkflow ? null : expected;
    assert.deepEqual(active, expectedActive ? [expectedActive] : []);
  }
});

test('a patch release selects its own manifest and refuses stale identities', t => {
  const oldPair = fixture(t);
  const root = path.dirname(oldPair[0].archive);
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  };
  const versions = { core: '2.3.1', mcp: '0.4.1' };
  const archives = [];
  for (const [folder, name, version] of [['.', 'contextos-agents', versions.core], ['contextos-mcp', 'contextos-mcp', versions.mcp]]) {
    write(`${folder}/package.json`, { name, version });
    write(`${folder}/package-lock.json`, { version, packages: { '': { name, version } } });
    const file = `${name}-${version}.tgz`;
    const bytes = Buffer.from(`patch archive ${name}`);
    fs.writeFileSync(path.join(root, file), bytes);
    archives.push({ file, sha256: digest(bytes) });
  }
  write('docs/evidence/release-2.3.json', { versions: { core: '2.3.0', mcp: '0.4.0' }, archives: [] });
  // A historical manifest must not be used as fallback if patch evidence is missing.
  assert.throws(() => packages(root, root), /ENOENT/);
  write('docs/evidence/release-2.3.1.json', { versions, archives });
  const selected = packages(root, root);
  assert.deepEqual(selected.map(pkg => pkg.version), ['2.3.1', '0.4.1']);
  verifyLocal(selected);
  write('contextos-mcp/package-lock.json', { version: '0.4.0', packages: { '': { version: '0.4.0' } } });
  assert.throws(() => packages(root, root), /version\/identity mismatch/);
  fs.writeFileSync(selected[0].archive, oldPair[0].bytes);
  assert.throws(() => verifyLocal(selected), /differs/);
});
test('preflight inspects both archives before publishing, then verifies each upload', async t => {
  const pair = fixture(t); const events = []; const published = new Set();
  await publishPair(pair, {
    inspect: async pkg => { events.push(`inspect:${pkg.name}`); return published.has(pkg.name) ? pkg.bytes : null; },
    runNpm: runner(pair, pkg => { events.push(`publish:${pkg.name}`); published.add(pkg.name); })
  });
  assert.deepEqual(events.slice(0, 3), ['inspect:contextos-agents', 'inspect:contextos-mcp', 'publish:contextos-agents']);
  assert.equal(published.size, 2);
});
test('tampered local archive blocks all network and publication calls', async t => {
  const pair = fixture(t); fs.writeFileSync(pair[1].archive, 'changed');
  await assert.rejects(publishPair(pair, { inspect: () => assert.fail('network called'), runNpm: () => assert.fail('npm called') }), /differs/);
});
test('registry mismatch on second package blocks first publication', async t => {
  const pair = fixture(t);
  await assert.rejects(publishPair(pair, { inspect: async pkg => { if (pkg === pair[1]) throw new Error('existing archive differs'); return null; }, runNpm: () => assert.fail('npm called') }), /differs/);
});
test('missing write access on MCP blocks core publication', async t => {
  const pair = fixture(t);
  const checked = [];
  await assert.rejects(publishPair(pair, { inspect: async () => null, runNpm: args => {
    if (args[0] === 'whoami') return '"publisher"';
    assert.deepEqual(args.slice(0, 3), ['access', 'list', 'collaborators']);
    checked.push(args[3]);
    return JSON.stringify({ publisher: args[3] === pair[0].name ? 'read-write' : 'read-only' });
  } }), /read-write access/);
  assert.deepEqual(checked, pair.map(pkg => pkg.name), 'all selected package permissions are checked before the first publication');
});

test('publisher identity must be a valid JSON string before checking access or publishing', async t => {
  const pair = fixture(t).slice(0, 1);
  const sensitive = 'synthetic-private-diagnostic';
  for (const identity of [() => { throw new Error(sensitive); }, () => sensitive,
    () => 'null', () => '[]', () => '{}', () => '42', () => '""', () => '" publisher"', () => '"publisher\\n"']) {
    const calls = [];
    await assert.rejects(publishPair(pair, { inspect: async () => null, runNpm: args => {
      calls.push(args[0]);
      assert.equal(args[0], 'whoami', 'invalid identity must not reach package access or publication');
      return identity();
    } }), error => {
      assert.match(error.message, /identity check .*publication refused/);
      assert.equal(error.message.includes(sensitive), false);
      return true;
    });
    assert.deepEqual(calls, ['whoami']);
  }
});

test('another collaborator or a missing/read-only publisher never authorizes publication', async t => {
  const pair = fixture(t).slice(0, 1);
  for (const permissions of [{}, { publisher: 'read-only' }, { another: 'read-write' },
    { publisher: 'read-only', another: 'read-write' }, { publisher: 'write' }]) {
    const calls = [];
    await assert.rejects(publishPair(pair, { inspect: async () => null, runNpm: args => {
      calls.push(args[0]);
      if (args[0] === 'whoami') return '"publisher"';
      assert.deepEqual(args.slice(0, 4), ['access', 'list', 'collaborators', pair[0].name]);
      return JSON.stringify(permissions);
    } }), /read-write access not confirmed/);
    assert.deepEqual(calls, ['whoami', 'access']);
  }
});
test('unavailable or malformed access checks block publication without leaking diagnostics', async t => {
  const pair = fixture(t).slice(0, 1);
  const sensitive = 'synthetic-private-diagnostic';
  for (const access of [() => { throw new Error(sensitive); }, () => sensitive, () => 'null', () => '[]', () => '"unexpected"']) {
    const calls = [];
    await assert.rejects(publishPair(pair, {
      inspect: async () => null,
      runNpm: args => {
        calls.push(args[0]);
        if (args[0] === 'whoami') return '"publisher"';
        assert.equal(args[0], 'access', 'a failed access check must not reach publication');
        return access();
      },
    }), error => {
      assert.match(error.message, /access check .*publication refused/);
      assert.equal(error.message.includes(sensitive), false);
      return true;
    });
    assert.deepEqual(calls, ['whoami', 'access']);
  }
});
test('npm wrapper exposes only finite error categories and never credential-bearing diagnostics', t => {
  const pair = fixture(t).slice(0, 1);
  const root = path.dirname(pair[0].archive);
  const cli = path.join(root, 'controlled-npm.cjs');
  const commands = path.join(root, 'commands.jsonl');
  fs.writeFileSync(cli, `
    const fs = require('node:fs');
    const scenario = JSON.parse(process.env.CONTEXTOS_TEST_NPM_FAILURE);
    const command = process.argv[2];
    fs.appendFileSync(${JSON.stringify(commands)}, command + '\\n');
    if (command === scenario.phase) {
      process.stdout.write(scenario.stdout); process.stderr.write(scenario.stderr); process.exit(1);
    }
    if (command === 'whoami') process.stdout.write('"publisher"');
    else if (command === 'access') process.stdout.write('{"publisher":"read-write"}');
    else { process.stderr.write('UNEXPECTED MUTATION'); process.exit(97); }
  `);
  const sensitive = 'controlled-private-credential-do-not-print';
  const codes = ['E401', 'E403', 'E404', 'EUSAGE', 'ENEEDAUTH', 'EOTP', 'ETIMEDOUT', 'ESOCKETTIMEDOUT',
    'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'E500', 'E502', 'E503', 'E504'];
  const cases = codes.map(code => ({ phase: 'access', code,
    stdout: JSON.stringify({ error: { code, summary: sensitive } }), stderr: sensitive }));
  cases.push(
    { phase: 'whoami', code: 'E401', stdout: JSON.stringify({ error: { code: 'E401', summary: sensitive } }), stderr: sensitive },
    { phase: 'access', code: 'EOTP', stdout: sensitive, stderr: `npm ERR! code EOTP\n${sensitive}` },
    { phase: 'access', code: 'E403', stdout: sensitive, stderr: `npm error code E403\r\n${sensitive}` },
    { phase: 'access', code: null, stdout: JSON.stringify({ error: { code: `E403 ${sensitive}` } }), stderr: sensitive },
    { phase: 'access', code: null, stdout: JSON.stringify({ error: { code: 'E_UNTRUSTED_MARKER', detail: sensitive } }), stderr: sensitive },
    { phase: 'access', code: null, stdout: sensitive, stderr: `npm error code E403 ${sensitive}` },
  );
  const modulePath = path.resolve(__dirname, '../scripts/publish-release-pair.cjs');
  const program = `
    require(${JSON.stringify(modulePath)}).publishPair(${JSON.stringify(pair.map(({ name, version, archive, sha256 }) => ({ name, version, archive, sha256 })))}, {
      inspect: async () => null, tag: 'latest'
    }).then(() => { process.exitCode = 99; }).catch(error => { console.error(error.message); process.exitCode = 1; });
  `;
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:npm_config_|npm_execpath$|node_options$|node_auth_token$|npm_token$)/i.test(key)));
  for (const scenario of cases) {
    fs.writeFileSync(commands, '');
    const result = require('node:child_process').spawnSync(process.execPath, ['-e', program], {
      cwd: root, env: { ...cleanEnv, npm_execpath: cli, CONTEXTOS_TEST_NPM_FAILURE: JSON.stringify(scenario) },
      encoding: 'utf8', timeout: 10000, windowsHide: true,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const category = scenario.phase === 'whoami' ? 'publisher identity' : 'package access';
    assert.equal(result.stderr.trim(), `npm ${category} check unavailable${scenario.code ? ` [${scenario.code}]` : ''}; publication refused`);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(sensitive), false);
    assert.equal(result.stderr.includes('E_UNTRUSTED_MARKER'), false);
    assert.deepEqual(fs.readFileSync(commands, 'utf8').trim().split('\n'),
      scenario.phase === 'whoami' ? ['whoami'] : ['whoami', 'access'], 'classification must never permit publication');
  }
});

test('authorization carries only allowlisted npm classifications from a failing adapter', async t => {
  const pair = fixture(t).slice(0, 1);
  const sensitive = 'controlled-private-error-message';
  for (const code of ['E403', `E403\n${sensitive}`, 'E_UNTRUSTED_MARKER', { toString: () => sensitive }]) {
    await assert.rejects(publishPair(pair, { inspect: async () => null, runNpm: args => {
      if (args[0] === 'whoami') return '"publisher"';
      assert.equal(args[0], 'access', 'failure must not reach publication');
      throw Object.assign(new Error(sensitive), { npmErrorCode: code });
    } }), error => {
      assert.equal(error.message, `npm package access check unavailable${code === 'E403' ? ' [E403]' : ''}; publication refused`);
      assert.equal(error.message.includes(sensitive), false);
      return true;
    });
  }
});

test('real npm authorizes a personal package through collaborators when unrelated org inventory is forbidden', async t => {
  const { fork } = require('node:child_process');
  const { once } = require('node:events');
  let server;
  t.after(async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  });
  const pair = fixture(t).slice(0, 1);
  const root = path.dirname(pair[0].archive);
  const serverFile = path.join(root, 'registry.cjs');
  const requestsFile = path.join(root, 'requests.jsonl');
  fs.writeFileSync(serverFile, `
    const http = require('node:http'), fs = require('node:fs');
    const server = http.createServer((req, res) => {
      fs.appendFileSync(${JSON.stringify(requestsFile)}, JSON.stringify({ method: req.method, url: req.url }) + '\\n');
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"writes forbidden"}'); return; }
      if (req.url === '/-/whoami') { res.end('{"username":"publisher"}'); return; }
      if (req.url === '/-/org/publisher/package') {
        res.statusCode = 403; res.end('{"error":"unrelated org inventory is forbidden"}'); return;
      }
      if (req.url === '/-/package/contextos-agents/collaborators') {
        res.end('{"publisher":"write","another":"read"}'); return;
      }
      res.statusCode = 404; res.end('{"error":"unknown controlled endpoint"}');
    });
    server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  `);
  server = fork(serverFile, { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const { port } = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('controlled registry did not start')), 10000);
    server.once('message', message => { clearTimeout(timer); resolve(message); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const localRegistry = `http://127.0.0.1:${port}/`;
  const userConfig = path.join(root, 'user.npmrc');
  const globalConfig = path.join(root, 'global.npmrc');
  fs.writeFileSync(userConfig, `//127.0.0.1:${port}/:_authToken=controlled-synthetic-token\n`);
  fs.writeFileSync(globalConfig, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:npm_config_|node_options$|node_auth_token$|npm_token$)/i.test(key)));
  const cli = npmCli();
  const realNpm = args => {
    const localArgs = [...args];
    const registryIndex = localArgs.indexOf('--registry');
    assert.notEqual(registryIndex, -1);
    localArgs[registryIndex + 1] = localRegistry;
    return require('node:child_process').execFileSync(process.execPath, [cli, ...localArgs,
      '--userconfig', userConfig, '--globalconfig', globalConfig, '--cache', path.join(root, 'cache'),
      '--fetch-retries=0', '--fetch-timeout=3000', '--update-notifier=false'],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, windowsHide: true });
  };
  assert.throws(() => realNpm(['access', 'list', 'packages', 'publisher', '--json', '--registry', 'https://registry.npmjs.org']),
    error => error.status === 1 && JSON.parse(String(error.stdout)).error.code === 'E403',
    'passing a username cannot repair npm\'s org-first inventory probe');
  const before = fs.readFileSync(requestsFile, 'utf8').trim().split('\n').length;
  let published = false;
  const calls = [];
  const result = await publishPair(pair, {
    inspect: async pkg => published ? pkg.bytes : null,
    runNpm: args => {
      calls.push(args);
      if (args[0] !== 'publish') return realNpm(args);
      assert.equal(args[1], pair[0].archive);
      assert.deepEqual(args.slice(-2), ['--tag', 'latest']);
      published = true; // Publication remains a controlled mock; the server accepts GET only.
      return '';
    },
    tag: 'latest',
  });
  assert.equal(result[0].action, 'published-and-verified');
  assert.deepEqual(calls.slice(0, 2).map(args => args.slice(0, 4)), [
    ['whoami', '--json', '--registry', 'https://registry.npmjs.org'],
    ['access', 'list', 'collaborators', 'contextos-agents'],
  ]);
  const requests = fs.readFileSync(requestsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.ok(requests.every(request => request.method === 'GET'));
  assert.deepEqual(requests.slice(before).map(request => request.url), ['/-/whoami', '/-/package/contextos-agents/collaborators']);
});

test('partial publication is recorded; retry verifies core and publishes only MCP', async t => {
  const pair = fixture(t); const published = new Set(); const calls = []; const records = [];
  const inspect = async pkg => published.has(pkg.name) ? pkg.bytes : null;
  await assert.rejects(publishPair(pair, { inspect, record: value => records.push([...value]), runNpm: runner(pair, pkg => {
    calls.push(pkg.name); if (pkg === pair[1]) throw new Error('upload failed'); published.add(pkg.name);
  }) }), /upload failed/);
  assert.equal(records.at(-1).length, 1);
  calls.length = 0;
  const result = await publishPair(pair, { inspect, runNpm: runner(pair, pkg => { calls.push(pkg.name); published.add(pkg.name); }) });
  assert.deepEqual(calls, ['contextos-mcp']);
  assert.equal(result[0].action, 'verified-existing');
});
test('fully published identical pair needs no npm authentication or mutation', async t => {
  const pair = fixture(t);
  const result = await publishPair(pair, { inspect: async pkg => pkg.bytes, runNpm: () => assert.fail('npm called') });
  assert.ok(result.every(pkg => pkg.action === 'verified-existing'));
});
test('upload error after registry accepted bytes is recovered by identity check', async t => {
  const pair = fixture(t); const published = new Set();
  const result = await publishPair(pair, { inspect: async pkg => published.has(pkg.name) ? pkg.bytes : null,
    runNpm: runner(pair, pkg => { published.add(pkg.name); throw new Error('lost response'); }) });
  assert.equal(result.length, 2);
});
test('delayed registry visibility recovers without repeating an accepted upload', async t => {
  const pair = fixture(t); const uploaded = new Set(); const calls = [];
  const elapsed = new Map(pair.map(pkg => [pkg.name, 0]));
  let waitingFor;
  const result = await publishPair(pair, {
    inspect: async pkg => uploaded.has(pkg.name) && elapsed.get(pkg.name) >= 120000 ? pkg.bytes : null,
    runNpm: runner(pair, pkg => { calls.push(pkg.name); uploaded.add(pkg.name); waitingFor = pkg.name; }),
    wait: async ms => elapsed.set(waitingFor, elapsed.get(waitingFor) + ms),
  });
  assert.deepEqual(calls, pair.map(pkg => pkg.name));
  assert.ok(result.every(pkg => pkg.action === 'published-and-verified'));
});

test('registry visibility timeout is bounded and prevents publishing the second package', async t => {
  const pair = fixture(t); const calls = []; let elapsed = 0;
  await assert.rejects(publishPair(pair, {
    inspect: async () => null,
    runNpm: runner(pair, pkg => calls.push(pkg.name)),
    wait: async ms => { elapsed += ms; },
  }), /publication not visible/);
  assert.equal(elapsed, 300000);
  assert.deepEqual(calls, ['contextos-agents']);
});

test('registry distinguishes 404 from authentication/server failures', async () => {
  const pkg = { name: 'contextos-mcp', version: '0.4.0', sha256: '0'.repeat(64) };
  assert.equal(await registryArchive(pkg, async () => new Response('', { status: 404 })), null);
  for (const status of [401, 403, 500]) await assert.rejects(registryArchive(pkg, async () => new Response('', { status })), /HTTP/);
});
test('registry download checks package identity, origin and exact bytes', async () => {
  const bytes = Buffer.from('verified registry archive');
  const pkg = { name: 'contextos-mcp', version: '0.4.0', sha256: digest(bytes) };
  const fetcher = (tarball, data = bytes, identity = pkg) => async url => String(url).endsWith('.tgz')
    ? new Response(data) : Response.json({ name: identity.name, version: identity.version, dist: { tarball } });
  assert.deepEqual(await registryArchive(pkg, fetcher('https://registry.npmjs.org/mcp.tgz')), bytes);
  await assert.rejects(registryArchive(pkg, fetcher('https://example.com/mcp.tgz')), /origin/);
  await assert.rejects(registryArchive(pkg, fetcher('https://registry.npmjs.org/mcp.tgz', Buffer.from('changed'))), /differs/);
  await assert.rejects(registryArchive(pkg, fetcher('https://registry.npmjs.org/mcp.tgz', bytes, { ...pkg, version: '9.9.9' })), /identity/);
});


// Verify original acceptance and archive provenance before publication recovery.
const coreRecoveryVerifier = require('../scripts/verify-core-release-recovery.cjs');
function coreRecoveryFixture() {
  const r = coreRecoveryVerifier.RECOVERY;
  const steps = names => names.map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success' }));
  const prepare = ['Run npm ci --ignore-scripts', 'Run npm run build', 'Run git diff --exit-code',
    'Pack the reviewed core archive once', 'Run actions/upload-artifact@v4'];
  const accept = ['Run npm ci --ignore-scripts', 'Run npm run build', 'Run git diff --exit-code',
    'Run npm run validate', 'Run npm run validate:catalog', 'Run npm run check:secrets:core',
    'Run npm run test:core', 'Run node --test tests/release-publish.test.js', 'Run npm run test:skills',
    'Run npm run lint:md',
    'Run npx markdownlint docs/PRODUCT_BOUNDARIES.md docs/ARCHITECTURE.md docs/RELEASE_PROCESS.md docs/RELEASE_3.0.0-rc.1.md --config .markdownlint.json',
    'Run node .agents/ctx.js export all --check --json', 'Run npm run check:release-surface:core',
    'Run node scripts/publish-release.cjs verify core-stable',
    'Run npm run check:consumer:core -- scratch/release-candidate', 'Verify 2.x upgrade and checkpoint rollback',
    'Run node scripts/publish-release.cjs verify core-stable'];
  const names = ['prepare', ...['ubuntu-latest', 'windows-latest', 'macos-latest'].flatMap(os =>
    ['22', '24'].map(node => `Core stable acceptance (${os}, Node ${node})`))];
  const repo = { id: 1297199126, full_name: 'kok-o/contextos-agents' };
  return { repository: r.repository, ref: 'refs/heads/main', eventName: 'workflow_dispatch',
    sourceSha: r.sourceSha, tagSha: r.sourceSha,
    identity: { kind: 'core-stable', name: 'contextos-agents', version: '3.0.0', file: 'contextos-agents-3.0.0.tgz', sha256: r.archiveSha256 },
    run: { id: r.runId, run_attempt: 1, workflow_id: 311861436, path: '.github/workflows/publish.yml', event: 'release',
      head_branch: 'v3.0.0', head_sha: r.sourceSha, status: 'completed', conclusion: 'failure', repository: { ...repo }, head_repository: { ...repo } },
    jobs: names.map((name, index) => ({ id: 123021924971 + index, name, run_id: r.runId, run_attempt: 1,
      head_sha: r.sourceSha, status: 'completed', conclusion: 'success', steps: steps(index ? accept : prepare) })),
    artifact: { id: r.artifactId, name: r.artifactName, expired: false, digest: `sha256:${r.zipSha256}`,
      workflow_run: { id: r.runId, head_sha: r.sourceSha, repository_id: repo.id, head_repository_id: repo.id, head_branch: r.tag } } };
}

test('core recovery accepts only the original immutable v3.0.0 release and seven successful gates', () => {
  const expected = { tag: 'v3.0.0', sourceSha: '0ad9eeb7bf3bbe5d6c863fdf991c1f164edfc56f',
    archiveSha256: '72840e7e40e0e13373a91470c9b6943d6866566bb9152236d107e5aad559dbfd',
    runId: 40746599298, attempt: 1, artifactId: 12841148594, artifactName: 'core-stable-archive-attempt-1',
    zipSha256: '7f1204d4d2b8c3531d76a904777c7420d8080d9017ed39e532d705603272646e' };
  for (const [key, value] of Object.entries(expected)) assert.equal(coreRecoveryVerifier.RECOVERY[key], value);
  const accepted = coreRecoveryVerifier.validateRecoveryEvidence(coreRecoveryFixture());
  assert.equal(accepted.result, 'PASS'); assert.equal(accepted.verifiedJobs, 7);
  assert.equal(accepted.artifactId, expected.artifactId);
});

test('core recovery rejects another branch, fork, source identity, release event or run attempt', () => {
  const mutations = [x => { x.repository = 'attacker/contextos-agents'; }, x => { x.ref = 'refs/heads/feature'; },
    x => { x.eventName = 'pull_request'; }, x => { x.sourceSha = '1'.repeat(40); }, x => { x.tagSha = '2'.repeat(40); },
    x => { x.identity.version = '3.0.1'; }, x => { x.identity.sha256 = '0'.repeat(64); },
    x => { x.identity.kind = 'mcp'; }, x => { x.identity.file = '../contextos-agents-3.0.0.tgz'; },
    x => { x.run.id++; }, x => { x.run.run_attempt = 2; }, x => { x.run.workflow_id++; },
    x => { x.run.path = '.github/workflows/attacker.yml'; }, x => { x.run.event = 'workflow_dispatch'; },
    x => { x.run.head_sha = '3'.repeat(40); }, x => { x.run.status = 'in_progress'; },
    x => { x.run.head_branch = 'main'; }, x => { x.run.repository.id++; },
    x => { x.run.head_repository.full_name = 'attacker/contextos-agents'; }, x => { x.run.head_repository.id++; }];
  for (const mutate of mutations) { const value = coreRecoveryFixture(); mutate(value);
    assert.throws(() => coreRecoveryVerifier.validateRecoveryEvidence(value), /recovery refused/); }
});

test('core recovery requires each OS/Node gate and the actual ordered mandatory step evidence', () => {
  for (let index = 0; index < 7; index++) {
    for (const mutate of [x => { x.jobs.splice(index, 1); }, x => { x.jobs[index].conclusion = 'skipped'; },
      x => { x.jobs[index].run_attempt = 2; }, x => { x.jobs[index].head_sha = '0'.repeat(40); }]) {
      const value = coreRecoveryFixture(); mutate(value);
      assert.throws(() => coreRecoveryVerifier.validateRecoveryEvidence(value), /recovery refused/);
    }
  }
  for (const jobIndex of [0, 1]) {
    const count = coreRecoveryFixture().jobs[jobIndex].steps.length;
    for (let stepIndex = 0; stepIndex < count; stepIndex++) {
      const value = coreRecoveryFixture(); value.jobs[jobIndex].steps.splice(stepIndex, 1);
      assert.throws(() => coreRecoveryVerifier.validateRecoveryEvidence(value), /recovery refused/);
    }
  }
  for (const mutate of [x => { x.jobs.push(structuredClone(x.jobs[1])); },
    x => { x.jobs[1].steps[0].conclusion = 'skipped'; },
    x => { x.jobs[1].steps.at(-1).number = 1; },
    x => { x.jobs[1].steps[13].number = 18; x.jobs[1].steps.at(-1).number = 19; }]) {
    const value = coreRecoveryFixture(); mutate(value);
    assert.throws(() => coreRecoveryVerifier.validateRecoveryEvidence(value), /recovery refused/);
  }
});

test('core recovery rejects expired, replaced or foreign-run accepted artifacts', () => {
  for (const mutate of [x => { x.artifact.id++; }, x => { x.artifact.name += '-other'; },
    x => { x.artifact.expired = true; }, x => { x.artifact.digest = 'sha256:' + '0'.repeat(64); },
    x => { x.artifact.workflow_run.id++; }, x => { x.artifact.workflow_run.head_sha = '0'.repeat(40); },
    x => { x.artifact.workflow_run.repository_id++; }, x => { x.artifact.workflow_run.head_repository_id++; },
    x => { x.artifact.workflow_run.head_branch = 'main'; }]) {
    const value = coreRecoveryFixture(); mutate(value);
    assert.throws(() => coreRecoveryVerifier.validateRecoveryEvidence(value), /recovery refused/);
  }
});

function coreRecoveryApiMock(fixture, changes = {}) {
  return async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-github-token'); assert.equal(options.redirect, 'error');
    const route = parsed.pathname;
    let data;
    if (route.endsWith('/git/ref/tags/v3.0.0')) data = { object: { type: 'tag', sha: 'a'.repeat(40) } };
    else if (route.endsWith('/git/tags/' + 'a'.repeat(40))) data = { object: { type: 'commit', sha: fixture.tagSha } };
    else if (route.endsWith('/attempts/1/jobs')) data = { total_count: fixture.jobs.length,
      jobs: parsed.searchParams.get('page') === '1' ? fixture.jobs.slice(0, 3) : fixture.jobs.slice(3) };
    else if (route.endsWith('/artifacts')) data = { total_count: 1, artifacts: [fixture.artifact] };
    else if (route.endsWith('/actions/runs/40746599298')) data = fixture.run;
    else assert.fail('Unexpected recovery API route: ' + route);
    if (changes.change) data = changes.change(route, parsed, data);
    return new Response(JSON.stringify(data), { status: changes.status || 200 });
  };
}

test('core recovery fetches attempt-specific paginated jobs and peels an annotated tag', async () => {
  const fixture = coreRecoveryFixture();
  const evidence = await coreRecoveryVerifier.fetchRecoveryEvidence('synthetic-github-token', coreRecoveryApiMock(fixture));
  assert.equal(evidence.jobs.length, 7); assert.equal(evidence.tagSha, fixture.sourceSha);
  assert.equal(coreRecoveryVerifier.validateRecoveryEvidence({ ...fixture, ...evidence }).result, 'PASS');
});

test('core recovery rejects failed, truncated, ambiguous or changing GitHub API responses', async () => {
  const fixture = coreRecoveryFixture();
  const cases = [{ status: 503 }, { change: (route, parsed, data) => route.endsWith('/attempts/1/jobs') && parsed.searchParams.get('page') === '2'
    ? { ...data, jobs: [] } : data },
  { change: (route, parsed, data) => route.endsWith('/attempts/1/jobs') && parsed.searchParams.get('page') === '2'
    ? { ...data, total_count: 8 } : data },
  { change: (route, parsed, data) => route.endsWith('/artifacts') ? { total_count: 2, artifacts: [fixture.artifact, fixture.artifact] } : data },
  { change: (route, parsed, data) => route.endsWith('/git/tags/' + 'a'.repeat(40)) ? { object: { type: 'tree', sha: fixture.sourceSha } } : data }];
  for (const changes of cases) await assert.rejects(coreRecoveryVerifier.fetchRecoveryEvidence('synthetic-github-token',
    coreRecoveryApiMock(fixture, changes)), /recovery refused/);
});

test('core recovery never forwards GitHub credentials to signed artifact storage and rejects changed ZIP bytes', async () => {
  const calls = [];
  await assert.rejects(coreRecoveryVerifier.downloadRecoveryZip('synthetic-github-token', async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-github-token'); assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'https://example.blob.core.windows.net/artifact?sig=synthetic' } });
    }
    assert.equal(options.headers, undefined); assert.equal(options.redirect, 'error');
    return new Response('changed ZIP bytes');
  }), /downloaded ZIP bytes differ/);
  assert.equal(calls.length, 2);
});

test('core recovery blocks unsafe redirect hosts and oversized artifact downloads before accepting any ZIP', async () => {
  for (const location of ['http://example.blob.core.windows.net/a', 'https://user:pass@example.blob.core.windows.net/a',
    'https://api.github.com.evil.example/a', 'https://example.blob.core.windows.net:8443/a']) {
    let calls = 0;
    await assert.rejects(coreRecoveryVerifier.downloadRecoveryZip('synthetic-github-token', async () => {
      calls++; return new Response(null, { status: 302, headers: { location } });
    }), /recovery refused/);
    assert.equal(calls, 1, 'unsafe redirect must never receive a network request');
  }
  await assert.rejects(coreRecoveryVerifier.downloadRecoveryZip('synthetic-github-token', async () =>
    new Response('x', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } })), /size limit/);
  await assert.rejects(coreRecoveryVerifier.downloadRecoveryZip('synthetic-github-token', async () =>
    new Response(Buffer.alloc(10 * 1024 * 1024 + 1))), /size limit/);
});

test('core recovery workflow verifies accepted bytes before exposing npm credentials and checks the registry on all OSes', () => {
  const yaml = require('yaml');
  const workflow = yaml.parse(fs.readFileSync(path.resolve(__dirname, '../.github/workflows/publish-core-recovery.yml'), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.concurrency.group, 'npm-core-stable-v3.0.0');
  assert.equal(workflow.env.RELEASE_TAG, 'v3.0.0');
  const publish = workflow.jobs.publish;
  assert.equal(publish.if, "${{ github.repository == 'kok-o/contextos-agents' && github.ref == 'refs/heads/main' }}");
  const steps = publish.steps;
  const index = name => {
    const found = steps.findIndex(step => step.name === name);
    assert.ok(found >= 0, `Missing mandatory recovery step: ${name}`);
    return found;
  };
  const tests = index('Test permission checks, recovery provenance and publication retries');
  const checkout = index('Check out the immutable accepted source');
  const proof = index('Verify original acceptance and download its exact artifact');
  const extract = index('Extract the verified original artifact');
  const verify = index('Recheck archive bytes and identity against the original source');
  const auth = index('Configure npm authentication for publication');
  const upload = index('Publish only the accepted core archive');
  assert.ok(tests < checkout && checkout < proof && proof < extract && extract < verify && verify < auth && auth < upload);
  assert.equal(steps[0].with.ref, '${{ github.sha }}');
  assert.equal(steps[0].with['persist-credentials'], false);
  assert.equal(steps[checkout].with.ref, coreRecoveryVerifier.RECOVERY.sourceSha);
  assert.equal(steps[checkout].with.path, 'release-source');
  assert.equal(steps[checkout].with['persist-credentials'], false);
  assert.equal(steps[proof].run, 'node scripts/verify-core-release-recovery.cjs --download');
  assert.equal(steps[proof].env.GITHUB_TOKEN, '${{ github.token }}');
  assert.equal(steps[extract].run, 'unzip -q scratch/core-release-recovery.zip -d release-source/scratch');
  assert.match(steps[verify].run, /\.main\('verify', 'core-stable'/);
  assert.match(steps[upload].run, /\.main\('publish', 'core-stable'/);
  for (const selected of [verify, upload]) assert.match(steps[selected].run, /projectRoot: require\('node:path'\)\.resolve\('release-source'\)/);
  assert.deepEqual(steps.filter(step => step.env?.NODE_AUTH_TOKEN), [steps[upload]]);
  assert.equal(steps[upload].env.NODE_AUTH_TOKEN, '${{ secrets.NPM_TOKEN }}');
  assert.ok(!steps.some(step => /npm pack|npm publish/.test(step.run || '')));
  const registry = workflow.jobs.registry;
  assert.equal(registry.needs, 'publish');
  assert.deepEqual(registry.strategy.matrix.os, ['ubuntu-latest', 'windows-latest', 'macos-latest']);
  assert.equal(registry.steps[0].with.ref, coreRecoveryVerifier.RECOVERY.sourceSha);
  const commands = registry.steps.map(step => step.run || '').join('\n');
  assert.match(commands, /publish-release\.cjs download core-stable/);
  assert.match(commands, /check:consumer:core -- scratch\/registry-release-candidate/);
  assert.match(commands, /tags\.latest !== '3\.0\.0'/);
  assert.ok(!registry.steps.some(step => step.env?.NODE_AUTH_TOKEN));
});
