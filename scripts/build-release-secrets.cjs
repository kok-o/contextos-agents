'use strict';

// Generate a self-contained release scanner from the core-owned scanner source.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'scripts/check-release-secrets.cjs');
const mode = process.argv[2] || '--check';
if (!['--check', '--write'].includes(mode)) throw new Error('Expected --check or --write');
const result = esbuild.buildSync({ absWorkingDir: root, entryPoints: ['scripts/check-secrets.js'],
  bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: output, write: false });
const bytes = Buffer.from(result.outputFiles[0].contents);
if (mode === '--write') fs.writeFileSync(output, bytes);
else if (!fs.existsSync(output) || !fs.readFileSync(output).equals(bytes)) throw new Error('Release scanner is stale; run npm run build:release-secrets');
console.log(`Release scanner ${mode === '--write' ? 'generated' : 'reproduced'}`);
