'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
if (path.relative(root, output) !== 'dist') throw new Error('Build output escapes package root');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('Refusing to clean a symlinked build output');
}
fs.rmSync(output, { recursive: true, force: true });
