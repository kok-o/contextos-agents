/**
 * bin/lib/gitignore.js
 * Keeps ContextOS's own working files out of version control.
 *
 * The block lists derived caches and transaction journals only. Rule sources,
 * generated agent files and the lockfile are meant to be committed.
 */

const fs = require('fs');
const path = require('path');
const { replaceManagedBlock, removeManagedBlock } = require('../../.agents/filesystem/managed-block.js');

const START = '# CONTEXTOS:START';
const END = '# CONTEXTOS:END';
const IGNORED = ['.agents/compiled/', '.agents/.contextos/'];

const BLOCK = [START, '# Derived caches and journals; regenerate with `contextos compile`.', ...IGNORED, END].join('\n');

/** New .gitignore text with the block added or refreshed. */
function withBlock(existing) {
  const replaced = replaceManagedBlock(existing, BLOCK, START, END, '.gitignore');
  if (replaced !== null) return replaced;
  if (!existing) return `${BLOCK}\n`;
  return `${existing}${existing.endsWith('\n') ? '' : '\n'}\n${BLOCK}\n`;
}

/** .gitignore text without the block; null content means the file held nothing else. */
function withoutBlock(existing) {
  const result = removeManagedBlock(existing, START, END, '.gitignore');
  return { found: result.found, content: result.content };
}

function readGitignore(projectDir) {
  const file = path.join(projectDir, '.gitignore');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

module.exports = { START, END, IGNORED, withBlock, withoutBlock, readGitignore };
