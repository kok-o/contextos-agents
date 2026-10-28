'use strict';

// Publish only revision-bound archives. Registry failures never mean "missing".
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validatePackagePaths } = require('./release-package-surface.cjs');
const root = path.resolve(__dirname, '..');
const registry = 'https://registry.npmjs.org';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function sameHash(actual, expected) {
  return /^[a-f0-9]{64}$/.test(actual) && /^[a-f0-9]{64}$/.test(expected)
    && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function npm(args, cwd = root) {
  const nodeDirectory = path.dirname(process.execPath);
  const cli = [process.env.npm_execpath,
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js')]
    .find(file => file && fs.existsSync(file));
  if (!cli) throw new Error('npm CLI not found; invoke through npm exec or use a standard Node installation');
  try {
    return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // Do not forward credential-bearing npm diagnostics into public artifacts.
    throw new Error(`npm ${args[0]} failed; check registry permissions, automation/2FA policy and connectivity`);
  }
}
function packages(directory, projectRoot = root) {
  const core = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json')));
  if (!/^\d+\.\d+\.\d+$/.test(core.version)) throw new Error('Expected a stable core release version');
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, `docs/evidence/release-${core.version}.json`)));
  return [['core', '.', 'contextos-agents'], ['mcp', 'contextos-mcp', 'contextos-mcp']].map(([kind, folder, name]) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, folder, 'package.json')));
    const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, folder, 'package-lock.json')));
    if (pkg.name !== name || pkg.version !== manifest.versions[kind] || lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error(`${kind}: version/identity mismatch`);
    const file = `${name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
    const expected = manifest.archives.find(a => a.file === file);
    if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error(`${kind}: missing reviewed archive identity`);
    return { kind, folder, name, version: pkg.version, file, archive: path.join(directory, file), sha256: expected.sha256 };
  });
}
function corePrerelease(directory, projectRoot = root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(projectRoot, file)));
  const pkg = read('package.json');
  const lock = read('package-lock.json');
  if (pkg.name !== 'contextos-agents' || !/^\d+\.\d+\.\d+-rc\.[1-9]\d*$/.test(pkg.version)
    || pkg.publishConfig?.tag !== 'next' || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('Expected a matching core RC identity with the next distribution tag');
  }
  const manifest = read('docs/release-core-rc.json');
  const file = `${pkg.name}-${pkg.version}.tgz`;
  if (manifest.version !== pkg.version || manifest.file !== file || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error('Core RC is missing its reviewed archive identity');
  }
  return { kind: 'core', folder: '.', name: pkg.name, version: pkg.version, file,
    archive: path.join(directory, file), sha256: manifest.sha256 };
}
function verifyLocal(pair) {
  for (const pkg of pair) {
    if (!sameHash(digest(fs.readFileSync(pkg.archive)), pkg.sha256)) throw new Error(`${pkg.name}: archive differs from reviewed release evidence`);
  }
}
async function registryArchive(pkg, fetcher = fetch) {
  const response = await fetcher(`${registry}/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${pkg.name}: registry metadata HTTP ${response.status}`);
  const metadata = await response.json();
  if (metadata.name !== pkg.name || metadata.version !== pkg.version) throw new Error(`${pkg.name}: registry identity mismatch`);
  const url = new URL(metadata.dist?.tarball);
  if (url.origin !== registry || url.username || url.password) throw new Error(`${pkg.name}: unexpected tarball origin`);
  const tarball = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!tarball.ok) throw new Error(`${pkg.name}: tarball HTTP ${tarball.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of tarball.body) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw new Error('Registry archive exceeds size limit');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (!sameHash(digest(bytes), pkg.sha256)) throw new Error(`${pkg.name}@${pkg.version}: existing registry archive differs; refusing to skip or overwrite`);
  return bytes;
}
function authorize(pair, runNpm = npm) {
  runNpm(['whoami', '--json', '--registry', registry]);
  let permissions;
  try {
    permissions = JSON.parse(runNpm(['access', 'list', 'packages', '--json', '--registry', registry]));
  } catch {
    // Unavailable checks cannot authorize a mutation. Keep npm diagnostics out
    // of the report because they may contain registry credentials.
    throw new Error('npm package access check unavailable; publication refused');
  }
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new Error('npm package access check returned an invalid result; publication refused');
  }
  for (const pkg of pair) {
    if (!Object.hasOwn(permissions, pkg.name) || permissions[pkg.name] !== 'read-write') {
      throw new Error(`${pkg.name}: read-write access not confirmed before publication`);
    }
  }
}
async function publishPair(pair, { inspect = registryArchive, runNpm = npm, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), record = () => {}, tag } = {}) {
  verifyLocal(pair);
  // Complete both checks and permission preflight before the first mutation.
  const present = [];
  for (const pkg of pair) present.push(Boolean(await inspect(pkg)));
  if (present.some(value => !value)) authorize(pair, runNpm);
  const results = [];
  for (let i = 0; i < pair.length; i++) {
    const pkg = pair[i];
    if (!present[i]) {
      // Recheck immediately before handing the archive to npm, including on a retry.
      verifyLocal([pkg]);
      try {
        runNpm(['publish', pkg.archive, '--ignore-scripts', '--access', 'public', '--registry', registry, ...(tag ? ['--tag', tag] : [])]);
      } catch (error) {
        // A network error can arrive after npm accepted the upload.
        if (!await inspect(pkg)) throw error;
      }
      let verified = false;
      // Registry propagation can take minutes after an accepted upload.
      // Allow five minutes of probe delays without repeating publication.
      for (let attempt = 0; attempt < 31; attempt++) {
        if (await inspect(pkg)) { verified = true; break; }
        if (attempt < 30) await wait(10000);
      }
      if (!verified) throw new Error(`${pkg.name}: publication not visible; rerun safely after checking registry`);
    }
    results.push({ name: pkg.name, version: pkg.version, sha256: pkg.sha256, action: present[i] ? 'verified-existing' : 'published-and-verified' });
    record(results);
  }
  return results;
}
async function main(mode) {
  const coreOnly = mode?.endsWith('-core-rc');
  if (coreOnly) mode = mode.slice(0, -'-core-rc'.length);
  const directory = path.join(root, 'scratch', mode === 'download' ? 'registry-release-candidate' : 'release-candidate');
  fs.mkdirSync(directory, { recursive: true });
  const pair = coreOnly ? [corePrerelease(directory)] : packages(directory);
  if (mode === 'prepare') {
    for (const pkg of pair) {
      const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', directory], path.join(root, pkg.folder)))[0];
      const violations = validatePackagePaths(packed.files.map(file => file.path), pkg.kind);
      if (packed.filename !== pkg.file || violations.length) throw new Error(`${pkg.name}: invalid packed surface`);
    }
    verifyLocal(pair);
    fs.writeFileSync(path.join(root, 'scratch/release-publish-prepared.json'), JSON.stringify(pair.map(({ name, version, file, sha256 }) => ({ name, version, file, sha256 })), null, 2));
    console.log('Selected archives match reviewed release evidence; ready for preflight');
  } else if (mode === 'publish') {
    const report = path.join(root, 'scratch/release-publish-result.json');
    const record = completed => fs.writeFileSync(report, JSON.stringify({ completed }, null, 2));
    record([]);
    console.log(JSON.stringify(await publishPair(pair, { record, ...(coreOnly ? { tag: 'next' } : {}) }), null, 2));
  } else if (mode === 'download') {
    for (const pkg of pair) {
      const bytes = await registryArchive(pkg);
      if (!bytes) throw new Error(`${pkg.name}@${pkg.version}: not published`);
      fs.writeFileSync(pkg.archive, bytes);
    }
    console.log('Selected registry archives match reviewed SHA-256 hashes');
  } else throw new Error('Expected prepare, publish or download');
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { digest, sameHash, packages, corePrerelease, verifyLocal, registryArchive, authorize, publishPair };
