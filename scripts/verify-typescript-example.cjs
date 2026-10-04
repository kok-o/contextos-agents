'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadNamedExample } = require('./skill-example-loader.cjs');

function verifyTypescriptExample({ source } = {}) {
  const file = path.resolve(__dirname, '../catalog/skills/typescript/SKILL.md');
  const { isUser } = loadNamedExample(file, 'typescript-user-guard', source);
  const cases = [
    ['user', { id: 'u1', name: 'Ada', role: 'user' }, true],
    ['admin', { id: 'u2', name: 'Grace', role: 'admin' }, true],
    ['null', null, false],
    ['undefined', undefined, false],
    ['primitive', 'user', false],
    ['array', Object.assign([], { id: 'u1', name: 'Ada', role: 'user' }), false],
    ['missing-fields', { id: 'u1' }, false],
    ['numeric-id', { id: 1, name: 'Ada', role: 'user' }, false],
    ['numeric-name', { id: 'u1', name: 2, role: 'user' }, false],
    ['invalid-role', { id: 'u1', name: 'Ada', role: 'owner' }, false],
  ];
  return cases.map(([name, value, expected]) => {
    try {
      assert.equal(isUser(value), expected);
      return { id: `typescript:user-guard:${name}`, kind: 'behavioral-test', passed: true };
    } catch (err) {
      return { id: `typescript:user-guard:${name}`, kind: 'behavioral-test', passed: false, error: err.message };
    }
  });
}

module.exports = { verifyTypescriptExample };
