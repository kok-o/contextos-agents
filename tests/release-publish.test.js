'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest, registryArchive, publishPair } = require('../scripts/publish-release-pair.cjs');
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
