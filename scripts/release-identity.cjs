'use strict';

// A release identity selects exactly one package and its independently reviewed archive.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { digest, sameHash } = require('./publish-release-pair.cjs');

const paths = {
  'core-stable': { folder: '.', name: 'contextos-agents', prefix: 'v', tag: 'latest', version: /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/ },
  'core-rc': { folder: '.', name: 'contextos-agents', prefix: 'v', tag: 'next', version: /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-rc\.[1-9]\d*$/ },
  mcp: { folder: 'contextos-mcp', name: 'contextos-mcp', prefix: 'mcp-v', tag: 'latest', version: /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/ },
};

function releaseIdentity(kind, releaseTag, directory, root = path.resolve(__dirname, '..')) {
  const config = paths[kind];
  if (!config) throw new Error('Unknown release path');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const pkg = read(path.join(config.folder, 'package.json'));
  const lock = read(path.join(config.folder, 'package-lock.json'));
  if (pkg.name !== config.name || !config.version.test(pkg.version) || releaseTag !== config.prefix + pkg.version ||
      lock.name !== pkg.name || lock.version !== pkg.version || lock.packages?.['']?.name !== pkg.name || lock.packages?.['']?.version !== pkg.version) {
    throw new Error(`${kind}: tag, package or lockfile identity mismatch`);
  }
  const file = `${pkg.name}-${pkg.version}.tgz`;
  const evidence = read(`docs/release-identities/${kind}-${pkg.version}.json`);
  if (evidence.kind !== kind || evidence.name !== pkg.name || evidence.version !== pkg.version || evidence.file !== file || !/^[a-f0-9]{64}$/.test(evidence.sha256)) {
    throw new Error(`${kind}: reviewed archive identity mismatch`);
  }
  return { kind: kind === 'mcp' ? 'mcp' : 'core', releasePath: kind, folder: config.folder, name: pkg.name, version: pkg.version,
    file, archive: path.join(directory, file), sha256: evidence.sha256, tag: config.tag };
}

function verifyArchive(pkg) {
  const bytes = fs.readFileSync(pkg.archive);
  if (!sameHash(digest(bytes), pkg.sha256)) throw new Error(`${pkg.name}: archive hash mismatch`);
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', pkg.archive, 'package/package.json'], { encoding: 'utf8', windowsHide: true }));
  if (manifest.name !== pkg.name || manifest.version !== pkg.version) throw new Error(`${pkg.name}: archive package identity mismatch`);
}

module.exports = { releaseIdentity, verifyArchive };
