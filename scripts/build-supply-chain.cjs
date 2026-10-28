'use strict';

// Core owns these sources. MCP's copies are generated for standalone builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.agents/transaction-core/supply-chain-src');
const bundle = path.join(root, '.agents/transaction-core/plugin-supply-chain-bundle.js');
const mirror = path.join(root, 'contextos-mcp/src/plugins');
const mode = process.argv[2] || '--check';
const files = ['adapter.ts', 'core/archive.ts', 'core/digest.ts', 'core/grants.ts', 'core/index.ts', 'core/pinning.ts', 'core/types.ts', 'core/updater.ts'];
const generatedHeader = Buffer.from('// Generated from core-owned sources by scripts/build-supply-chain.cjs; do not edit this copy.\n');

if (mode === '--sync-mcp' || mode === '--check-mcp') {
  if (!fs.existsSync(path.join(mirror, 'loader.ts'))) throw new Error('MCP checkout is required for mirror verification');
  const expectedCore = files.filter(name => name.startsWith('core/')).map(name => path.basename(name)).sort();
  for (const dir of [path.join(source, 'core'), path.join(mirror, 'core')]) {
    const actual = fs.readdirSync(dir).filter(name => name.endsWith('.ts')).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expectedCore)) throw new Error(`Unexpected supply-chain source inventory: ${dir}`);
  }
  for (const name of files) {
    const original = Buffer.concat([generatedHeader, fs.readFileSync(path.join(source, name))]);
    const destination = path.join(mirror, name);
    if (mode === '--sync-mcp') fs.writeFileSync(destination, original);
    else if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(original)) throw new Error(`MCP generated copy differs: ${name}`);
  }
  const lock = Buffer.concat([generatedHeader, fs.readFileSync(path.join(root, '.agents/transaction-core/ipc-lock.js'))]);
  const mcpLock = path.join(root, 'contextos-mcp/src/runtime/ipc-lock.cjs');
  if (mode === '--sync-mcp') fs.writeFileSync(mcpLock, lock);
  else if (!fs.existsSync(mcpLock) || !fs.readFileSync(mcpLock).equals(lock)) throw new Error('MCP generated IPC lock differs from core');
  const records = [...files.map(name => `src/plugins/${name}`), 'src/runtime/ipc-lock.cjs'].sort().map(file => ({
    file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'contextos-mcp', file))).digest('hex'),
  }));
  const manifest = path.join(root, 'contextos-mcp/shared-sources.json');
  const expectedManifest = JSON.stringify({ schemaVersion: 1, files: records }, null, 2) + '\n';
  if (mode === '--sync-mcp') fs.writeFileSync(manifest, expectedManifest);
  else if (!fs.existsSync(manifest) || fs.readFileSync(manifest, 'utf8') !== expectedManifest) throw new Error('MCP generated-source manifest differs');
  console.log(`MCP generated source copies ${mode === '--sync-mcp' ? 'updated' : 'match core'}`);
} else if (mode === '--write' || mode === '--check') {
  const esbuild = require('esbuild');
  const result = esbuild.buildSync({ absWorkingDir: root, entryPoints: [path.relative(root, path.join(source, 'adapter.ts'))],
    bundle: true, platform: 'node', target: 'node20', format: 'cjs', banner: { js: '"use strict";' }, outfile: bundle, write: false });
  const bytes = Buffer.from(result.outputFiles[0].contents);
  if (mode === '--write') fs.writeFileSync(bundle, bytes);
  else if (!fs.existsSync(bundle) || !fs.readFileSync(bundle).equals(bytes)) throw new Error('Core supply-chain bundle is stale; run npm run build:supply-chain');
  console.log(`Core supply-chain bundle ${mode === '--write' ? 'generated' : 'reproduced'}`);
} else throw new Error('Expected --check, --write, --check-mcp or --sync-mcp');
