'use strict';

// Independent release path. RELEASE_TAG is mandatory even for preparation.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { releaseIdentity, verifyArchive } = require('./release-identity.cjs');
const { validatePackagePaths } = require('./release-package-surface.cjs');
const { publishPair, registryArchive } = require('./publish-release-pair.cjs');
const root = path.resolve(__dirname, '..');

function npm(args, cwd) {
  const nodeDir = path.dirname(process.execPath);
  const cli = [process.env.npm_execpath, path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'), path.resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js')].find(file => file && fs.existsSync(file));
  if (!cli) throw new Error('npm CLI unavailable');
  return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}

async function main(mode, kind, { projectRoot = root, releaseTag = process.env.RELEASE_TAG, runNpm = npm, publishOptions = {}, inspect = registryArchive } = {}) {
  if (!['prepare', 'verify', 'publish', 'download'].includes(mode)) throw new Error('Expected prepare, verify, publish or download');
  if (!releaseTag) throw new Error('RELEASE_TAG is required');
  const dir = path.join(projectRoot, 'scratch', mode === 'download' ? 'registry-release-candidate' : 'release-candidate');
  const pkg = releaseIdentity(kind, releaseTag, dir, projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  if (mode === 'prepare') {
    const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', dir], path.join(projectRoot, pkg.folder)))[0];
    const violations = validatePackagePaths(packed.files.map(file => file.path), pkg.kind);
    if (packed.name !== pkg.name || packed.version !== pkg.version || packed.filename !== pkg.file || violations.length) throw new Error(`${pkg.name}: invalid packed identity or surface: ${violations.join(', ')}`);
    verifyArchive(pkg);
    fs.writeFileSync(path.join(projectRoot, 'scratch/release-publish-prepared.json'), JSON.stringify(pkg, null, 2));
  } else if (mode === 'verify') {
    verifyArchive(pkg);
  } else if (mode === 'publish') {
    verifyArchive(pkg);
    const report = path.join(projectRoot, 'scratch/release-publish-result.json');
    fs.writeFileSync(report, JSON.stringify({ completed: [] }));
    await publishPair([pkg], { ...publishOptions, tag: pkg.tag, record: completed => fs.writeFileSync(report, JSON.stringify({ completed }, null, 2)) });
  } else {
    const bytes = await inspect(pkg);
    if (!bytes) throw new Error(`${pkg.name}@${pkg.version}: not published`);
    fs.writeFileSync(pkg.archive, bytes);
    verifyArchive(pkg);
  }
  console.log(`${mode}: ${pkg.name}@${pkg.version} (${pkg.sha256})`);
}
if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
