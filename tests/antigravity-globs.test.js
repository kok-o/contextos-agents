'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antigravityGlobs, boundedWindowsGlobs } = require('../.agents/adapters/gemini/globs.js');

test('Antigravity Windows recursive trees retain their source and anchor native alternatives to the workspace', () => {
  assert.deepEqual(antigravityGlobs(['src/api/**/*.js', 'docs/**/*.test.md'], 'C:/work/demo'), [
    'src/api/**/*.js', 'docs/**/*.test.md',
    '[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\*.js',
    '[cC]:\\\\work\\\\demo\\\\docs\\\\*.test.md',
  ]);
  assert.deepEqual(antigravityGlobs(['src/api/**/*.js'], '/work/demo'), ['src/api/**/*.js']);
});

test('Antigravity does not broaden fixed-depth stars, wildcard directories or unsupported leaf patterns', () => {
  const globs = ['src/api/*.js', 'src/*/api/**/*.js', 'src/api/**/test*.js', '../api/**/*.js', 'C:/other/**/*.js', 'src/[A-z]pi/file?.js'];
  assert.deepEqual(antigravityGlobs(globs, 'C:/work/demo'), globs);
  assert.deepEqual(antigravityGlobs(['src/api/**/*.js'], 'C:/work/demo,other'), ['src/api/**/*.js']);
});

test('Antigravity expands nested alternatives before comma-separated serialization on every platform', () => {
  assert.deepEqual(antigravityGlobs(['src/{api,{lib,ui}}/**/*.{js,ts}', 'docs/**/*.md'], '/work/demo'), [
    'src/api/**/*.js', 'src/api/**/*.ts', 'src/lib/**/*.js', 'src/lib/**/*.ts', 'src/ui/**/*.js', 'src/ui/**/*.ts', 'docs/**/*.md',
  ]);
  assert.deepEqual(antigravityGlobs(['**/*.{test,spec}.{js,ts}'], '/work/demo'), [
    '**/*.test.js', '**/*.test.ts', '**/*.spec.js', '**/*.spec.ts',
  ]);
});

test('Antigravity finite Windows wildcards exclude backslashes and accept both character-class negations', () => {
  const output = antigravityGlobs(['src/a?i/invoice[!0-9].js', 'src/api/invoice[^0-9].js'], 'C:/work/demo');
  assert.ok(output.includes('[cC]:\\\\work\\\\demo\\\\src\\\\a[^\\\\]i\\\\invoice[!0-9\\\\].js'));
  assert.ok(output.includes('[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\invoice[^0-9\\\\].js'));
});

test('Antigravity guards the portable alternatives as well as the added Windows variants', () => {
  const globs = antigravityGlobs(['**/*?.js', '**/*[!0-9].js'], 'C:/work/demo');
  assert.deepEqual(globs.slice(0, 2), ['**/*[^\\\\].js', '**/*[!0-9\\\\].js']);
  assert.ok(!globs.includes('**/*?.js'));
  assert.ok(!globs.includes('**/*[!0-9].js'));
});

test('Antigravity expands zero-directory and recursive directory branches without enumerating files', () => {
  assert.deepEqual(antigravityGlobs(['**/src/api/**/*.js'], 'C:/work/demo'), [
    '**/src/api/**/*.js', '[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\*.js', '[cC]:\\\\work\\\\demo\\\\*\\\\src\\\\api\\\\*.js',
  ]);
});

test('Antigravity refuses unrepresentable commas, malformed braces, empty alternatives and excessive fan-out', () => {
  for (const glob of ['src/{api,lib/**/*.js', 'src/api}/**/*.js']) assert.throws(() => antigravityGlobs([glob], 'C:/work/demo'), /unmatched braces/);
  assert.throws(() => antigravityGlobs(['src/api/file[1,2].js'], 'C:/work/demo'), /literal comma/);
  assert.throws(() => antigravityGlobs(['{,}'], 'C:/work/demo'), /empty pattern/);
  assert.throws(() => antigravityGlobs(['{a,b}'.repeat(8)], 'C:/work/demo'), /exceeds 128 patterns/);
  assert.throws(() => antigravityGlobs(Array(129).fill('src/api/**/*.js'), 'C:/work/demo'), /exceeds 128 patterns/);
  assert.throws(() => antigravityGlobs(Array.from({length:60}, (_,i)=>`src/a${i}/**/*.js`), 'C:/' + 'x'.repeat(300)), /exceeds 16000 bytes/);
});

test('Antigravity escapes literal Windows workspace metacharacters rather than interpreting them as globs', () => {
  assert.deepEqual(antigravityGlobs(['src/api/**/*'], 'C:/work/[demo]'), [
    'src/api/**/*', '[cC]:\\\\work\\\\\\[demo\\]\\\\src\\\\api\\\\*',
  ]);
});

test('bounded Windows filename stars cover every permitted NTFS component length without expanding other scopes', () => {
  const root = 'C:/work/demo';
  const fixed = boundedWindowsGlobs(['src/api/*.js'], root);
  const recursive = boundedWindowsGlobs(['src/api/**/test*.js'], root);
  assert.equal(fixed.length, 253);
  assert.equal(recursive.length, 498);
  assert.ok(fixed.includes('[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\.js'));
  assert.ok(fixed.includes('[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\' + '[^\\\\]'.repeat(252) + '.js'));
  assert.ok(recursive.includes('[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\test.js'));
  assert.ok(recursive.includes('[cC]:\\\\work\\\\demo\\\\src\\\\api\\\\*\\\\test.js'));
  assert.deepEqual(boundedWindowsGlobs(['src/api/**/*.js', 'src/*/api/*.js'], root), []);
  assert.deepEqual(boundedWindowsGlobs(['src/api/*.js'], '/work/demo'), []);
  assert.throws(() => boundedWindowsGlobs(['src/api/*.js'], 'C:/work/demo,other'), /comma in the workspace path/);
  assert.throws(() => boundedWindowsGlobs(['src/api/' + 'a'.repeat(256) + '*'], root), /component limit/);
  assert.throws(() => boundedWindowsGlobs(Array.from({length:9}, (_,i)=>`src/api/test${i}*.js`), root), /2048 patterns/);
});
