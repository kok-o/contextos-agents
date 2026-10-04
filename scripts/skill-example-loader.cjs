'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

// Reviewed local blocks only. This is a test harness, not an OS sandbox.
function loadNamedExample(file, id, source = fs.readFileSync(file, 'utf8')) {
  const marker = `<!-- example: ${id} -->`;
  if (source.split(marker).length !== 2) throw new Error(`Expected one example ${id} in ${file}`);
  const match = source.slice(source.indexOf(marker) + marker.length)
    .match(/^\s*```(javascript|typescript)\r?\n([\s\S]*?)\r?\n```/);
  if (!match) throw new Error(`Executable example ${id} missing in ${file}`);
  const compiled = transformSync(match[2], {
    loader: match[1] === 'typescript' ? 'ts' : 'js', format: 'cjs', target: 'node22',
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL, Buffer,
    require(name) {
      if (name === 'node:crypto') return require('node:crypto');
      throw new Error(`Example import not permitted: ${name}`);
    },
  }, { filename: `${file}#${id}`, timeout: 1000 });
  return module.exports;
}

module.exports = { loadNamedExample };
