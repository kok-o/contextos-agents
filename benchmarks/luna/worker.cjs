'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const os = require('node:os');
const assert = require('node:assert/strict');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; if (input.length > 250000) process.exit(2); });
process.stdin.on('end', () => {
  try {
    const { fixture, file, files, dataRoot, oracle } = JSON.parse(input);
    const allowed = new Set(files.map(name => path.resolve(fixture, name)));
    const cache = new Map();
    const builtins = { fs, path, crypto, os };
    function load(absolute) {
      if (!allowed.has(absolute)) throw new Error('Dependency is outside the fixture allowlist');
      if (cache.has(absolute)) return cache.get(absolute).exports;
      const module = { exports: {} }; cache.set(absolute, module);
      const safeRequire = name => {
        const builtin = name.replace(/^node:/, '');
        if (Object.hasOwn(builtins, builtin)) return builtins[builtin];
        if (name.startsWith('./') || name.startsWith('../')) return load(path.resolve(path.dirname(absolute), name));
        throw new Error(`Module is not allowed: ${name}`);
      };
      const context = vm.createContext({
        Buffer, console: Object.freeze({ log() {}, warn() {}, error() {} }),
        process: Object.freeze({ platform: process.platform, versions: Object.freeze({ node: process.versions.node }), cwd: () => dataRoot }),
      }, { codeGeneration: { strings: false, wasm: false } });
      const source = fs.readFileSync(absolute, 'utf8');
      const wrapper = new vm.Script(`(function(require, module, exports, __filename, __dirname) { 'use strict';\n${source}\n})`, { filename: absolute });
      wrapper.runInContext(context, { timeout: 1000 })(safeRequire, module, module.exports, absolute, path.dirname(absolute));
      return module.exports;
    }
    const subject = load(path.resolve(fixture, file));
    const crossRealmAssert = Object.assign({}, assert, {
      deepEqual: (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))),
    });
    const context = vm.createContext({ subject, assert: crossRealmAssert, fs, path, dataRoot }, { codeGeneration: { strings: false, wasm: false } });
    new vm.Script(oracle, { filename: 'private-acceptance-oracle' }).runInContext(context, { timeout: 2000 });
    process.stdout.write(JSON.stringify({ passed: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ passed: false, infrastructureError: error.code === 'ERR_ACCESS_DENIED', error: String(error.stack || error.message).slice(0, 2000) }));
  }
});
