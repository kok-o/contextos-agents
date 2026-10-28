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
    if (args[0] === 'access') return JSON.stringify(Object.fromEntries(pair.map(pkg => [pkg.name, 'read-write'])));
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
      if (args[0] === 'access') return JSON.stringify({ [name]: 'read-write' });
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
  await assert.rejects(publishPair(pair, { inspect: async () => null, runNpm: args => {
    if (args[0] === 'whoami') return '"publisher"';
    assert.equal(args[0], 'access'); return '{"contextos-agents":"read-write"}';
  } }), /read-write access/);
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
