'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler.js');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
const { renderAdapters } = require('../.agents/adapters/pure-compiler.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-focused-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ctx-focused-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, '.git'));
  fs.cpSync(path.join(__dirname, '../.agents/core'), path.join(root, '.agents/core'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../.agents/AGENTS.md'), path.join(root, '.agents/AGENTS.md'));
  const result = new ManifestCompiler({ rootDir: root }).compileAndWrite();
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  return { root, resolver: new CanonicalResolver({ rootDir: root }) };
}

test('routine context fits 1000 estimated tokens without loading implementation or role manuals', t => {
  const { resolver } = fixture(t);
  const result = resolver.resolve({ task: 'Fix typo in README', contextBudgetTokens: 1000 });
  assert.ok(result.skills.includes('engineering-workflow'));
  assert.equal(result.skills.includes('ponytail-mindset'), false);
  assert.equal(result.skills.includes('gstack-roles'), false);
  assert.equal(result.skills.includes('gemini-precision'), false);
  assert.ok(result.totalEstimatedTokens <= 1000);
});

test('authentication guidance survives a small soft budget with explicit overflow diagnostics', t => {
  const { resolver } = fixture(t);
  const result = resolver.resolve({ task: 'Review authentication JWT session security', contextBudgetTokens: 100 });
  assert.ok(result.skills.includes('security'));
  assert.ok(result.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'));
});

test('English and Russian safety tasks keep guidance despite exclusions and budget pressure', t => {
  const { root, resolver } = fixture(t);
  fs.writeFileSync(path.join(root, '.agents/profile.json'), JSON.stringify({ name: 'restricted', exclude_skills: ['security'] }));
  const cases = [
    ['Удали таблицу users', 'destructive'], ['Удалить файл cache.json', 'destructive'],
    ['Очисти базу данных', 'destructive'], ['Drop table users', 'destructive'],
    ['Delete files in cache', 'destructive'], ['Исправь авторизацию пользователей', 'high'],
    ['Удалить все файлы проекта', 'destructive'], ['Удалить все старые файлы', 'destructive'],
    ['Сотри выбранную папку build', 'destructive'], ['Очисти эту папку', 'destructive'],
    ['Remove all files in build directory', 'destructive'], ['Delete the old files', 'destructive'],
    ['Remove these folders', 'destructive'], ['Drop the database', 'destructive'],
    ['Delete all tables', 'destructive'], ['git clean -fdx', 'destructive'],
    ['git push -f origin main', 'destructive'], ['rm -fr build', 'destructive'],
    ['Исправь проверку доступа к чужим документам', 'high'], ['Добавь платежи', 'high'],
    ['Fix IDOR in document deletion', 'high'], ['Fix access control for documents', 'high'],
    ['Implement a payment webhook', 'high'],
  ];
  for (const [task, expectedRisk] of cases) {
    const result = resolver.resolve({ task, contextBudgetTokens: 100 });
    assert.equal(result.risk.value, expectedRisk, task);
    assert.ok(result.skills.includes('security'), task);
    assert.ok(result.warnings.some(w => w.code === 'CTX_REQUIRED_SECURITY_PROFILE_CONFLICT'), task);
    assert.ok(result.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'), task);
  }
});

test('routine Russian edits and accessibility do not become destructive or authentication work', t => {
  const { resolver } = fixture(t);
  for (const task of ['Исправь опечатку в README', 'Поправь документацию']) {
    const result = resolver.resolve({ task, contextBudgetTokens: 1000 });
    assert.equal(result.risk.value, 'routine', task);
    assert.deepEqual(result.skills, ['engineering-workflow']);
  }
  const result = resolver.resolve({ task: 'Улучши доступность кнопки' });
  assert.equal(result.risk.value, 'standard');
  assert.equal(result.skills.includes('security'), false);
  for (const task of ['Remove unused imports from files', 'Delete the unused variable', 'Удали неиспользуемый импорт из файла']) {
    assert.equal(resolver.resolve({ task }).risk.value, 'standard', task);
  }
  for (const [task, phase] of [['Спланируй новую функцию', 'Plan'], ['Проверь код модуля', 'Review'], ['Добавь тесты', 'Verify']]) {
    assert.equal(resolver.resolve({ task }).phase.value, phase, task);
  }
});

test('migration and destructive tasks preserve safety even when a profile excludes security', t => {
  const { root, resolver } = fixture(t);
  fs.writeFileSync(path.join(root, '.agents/profile.json'), JSON.stringify({ name: 'restricted', exclude_skills: ['security'] }));
  for (const task of ['Apply database schema migration', 'Drop table users']) {
    const result = resolver.resolve({ task, contextBudgetTokens: 100 });
    assert.ok(result.skills.includes('security'));
    assert.ok(result.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'));
    assert.ok(result.warnings.some(w => w.code === 'CTX_REQUIRED_SECURITY_PROFILE_CONFLICT'));
  }
});

test('only the compact bootstrap is always applied by default Cursor exports', t => {
  const { root } = fixture(t);
  const artifacts = renderAdapters(root, 'cursor').artifacts;
  const always = artifacts.filter(a => a.path.endsWith('.mdc') && /alwaysApply: true/.test(a.content.toString()));
  assert.deepEqual(always.map(a => a.path), ['.cursor/rules/00-project-rules.mdc']);
  assert.ok(always.reduce((sum, a) => sum + a.content.toString().length, 0) <= 6000);
  assert.ok(fs.readFileSync(path.join(root, '.agents/AGENTS.md'), 'utf8').length <= 4800);
});

test('resolve argument parsing excludes option values from the task and rejects invalid budgets', () => {
  const { parseResolveArgs } = require('../.agents/resolver/resolve-args.js');
  assert.deepEqual(parseResolveArgs(['Fix typo', '--files', 'src/auth.ts', '--phase', 'Review', '--budget', '1000', '--json']), {
    task: 'Fix typo', files: ['src/auth.ts'], explicitPhase: 'Review', contextBudgetTokens: 1000, json: true, explain: false,
  });
  for (const budget of ['0', '-1', 'NaN', '100x', '1.2']) {
    assert.throws(() => parseResolveArgs(['task', '--budget', budget]), /positive integer/);
  }
});
