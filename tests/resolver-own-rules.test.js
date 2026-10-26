'use strict';

/**
 * A team's own rules have no authored routing signals. The resolver routes on
 * what a rule says about itself, and can be limited to what is installed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');

const rootDir = path.resolve(__dirname, '..');

function registryWith(skills) {
  return { sourceGraphHash: 'sha256:test', dependencyGraph: {}, skills };
}

const teamAuth = {
  displayName: 'team-auth',
  description: 'Rules for authentication code: never log headers or tokens.',
  estimatedTokens: 200,
  source: '.agents/project/skills/team-auth/SKILL.md',
  signals: { aliases: ['team-auth'], keywords: [], fileGlobs: [], packages: [] },
  dependencies: { requires: [], conflicts: [] },
};

test('a word of the rule name found in the task selects the rule, and says why', () => {
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-auth': teamAuth }) });
  const result = resolver.resolve({ task: 'Fix the login handler that leaks Authorization data' });
  const selected = result.selected.find(skill => skill.id === 'team-auth');
  assert.ok(selected, `team-auth not selected: ${JSON.stringify(result.selected.map(s => s.id))}`);
  assert.match(selected.reasons.map(r => r.reason).join(' '), /word in the rule name "team-auth"/);
});

test('two words of the description select the rule when the name is not mentioned', () => {
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-auth': { ...teamAuth, displayName: 'team-sec' } }) });
  const result = resolver.resolve({ task: 'Stop logging request headers and session tokens' });
  assert.ok(result.selected.some(skill => skill.id === 'team-auth'));
});

test('an unrelated task does not select the rule', () => {
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-auth': teamAuth }) });
  const result = resolver.resolve({ task: 'Rename a CSS class in the footer' });
  assert.ok(!result.selected.some(skill => skill.id === 'team-auth'));
});

test('generic words such as team or rules never match on their own', () => {
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-auth': teamAuth }) });
  const result = resolver.resolve({ task: 'Update the team rules page' });
  assert.ok(!result.selected.some(skill => skill.id === 'team-auth'));
});

test('a similar word is not evidence for an authentication rule', () => {
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-auth': teamAuth }) });
  for (const task of ['Update author credits', 'Document the authority of a literary critic']) {
    const result = resolver.resolve({ task, installedOnly: true });
    assert.equal(result.skills.includes('team-auth'), false, task);
    assert.equal(result.risk.value, 'standard', task);
  }
});

test('catalog skills are recommended by default and dropped with installedOnly', () => {
  const registry = registryWith({ 'team-auth': teamAuth });
  const defaults = new CanonicalResolver({ rootDir, registry }).resolve({ task: 'Add a Dockerfile for the service' });
  assert.ok(defaults.selected.some(skill => skill.id === 'docker'), 'catalog recommendation is part of the default contract');

  const installed = new CanonicalResolver({ rootDir, registry }).resolve({ task: 'Add a Dockerfile for the service', installedOnly: true });
  assert.ok(!installed.selected.some(skill => skill.id === 'docker'), 'docker is not installed in this project');
});

test('installedOnly remains enabled for an empty registry, including safety-related tasks', () => {
  for (const task of ['Add a Dockerfile for the service', 'Implement authentication', 'Use @docker']) {
    const result = new CanonicalResolver({ rootDir, registry: registryWith({}) }).resolve({ task, installedOnly: true });
    assert.deepEqual(result.skills, []);
    if (task !== 'Add a Dockerfile for the service') assert.ok(result.warnings.some(w => w.code === 'CTX_REQUIRED_SKILL_UNAVAILABLE'));
  }
});

test('installed-only resolution reports missing prerequisites without selecting an incomplete root', () => {
  const registry = { ...registryWith({ 'team-auth': teamAuth }), dependencyGraph: { 'team-auth': ['team-policy'] } };
  const result = new CanonicalResolver({ rootDir, registry }).resolve({ explicitSkills: ['team-auth'], installedOnly: true });
  assert.deepEqual(result.skills, []);
  assert.ok(result.excluded.some(item => item.id === 'team-auth' && item.reasonCode === 'unavailable_dependency'));
  assert.ok(result.warnings.some(w => w.code === 'CTX_RESOLVER_DEPENDENCY_UNAVAILABLE'));
});

test('installedOnly also applies to architectural synergy suggestions', () => {
  const registry = registryWith({ database: { ...teamAuth, displayName: 'database', signals: { aliases: ['database'] } } });
  const result = new CanonicalResolver({ rootDir, registry }).resolve({ task: 'Use @database', installedOnly: true });
  assert.deepEqual(result.skills, ['database']);
});

test('explicit selection honors registered aliases without inventing an unavailable skill', () => {
  const registry = { ...registryWith({ 'team-auth': teamAuth }), aliases: { 'team-login': 'team-auth' } };
  const result = new CanonicalResolver({ rootDir, registry }).resolve({ explicitSkills: ['team-login'], installedOnly: true });
  assert.deepEqual(result.skills, ['team-auth']);
  assert.ok(result.selected[0].reasons.some(r => r.kind === 'explicit'));
  assert.equal(result.warnings.some(w => w.code === 'CTX_REQUIRED_SKILL_UNAVAILABLE'), false);
});

test('manifest glob signals match complete paths, including recursive directories', () => {
  const globRule = { ...teamAuth, displayName: 'team-paths', signals: { fileGlobs: [{ value: 'src/**/*.special', weight: 70 }] } };
  const resolver = new CanonicalResolver({ rootDir, registry: registryWith({ 'team-paths': globRule }) });
  for (const [file, expected] of [['src/module.special', true], ['src/deep/nested/module.special', true], ['other/src/module.special', false], ['src/module.special.backup', false]]) {
    const result = resolver.resolve({ task: 'Adjust behavior', files: [file], installedOnly: true });
    assert.equal(result.skills.includes('team-paths'), expected, file);
  }
});

test('soft skill limit emits one diagnostic for required instructions', () => {
  const skills = { 'rule-a': teamAuth, 'rule-b': { ...teamAuth, displayName: 'rule-b' } };
  const result = new CanonicalResolver({ rootDir, registry: registryWith(skills) }).resolve({ explicitSkills: ['rule-a', 'rule-b'], maxSkills: 1 });
  assert.deepEqual(result.skills.sort(), ['rule-a', 'rule-b']);
  assert.equal(result.warnings.filter(w => w.code === 'CTX_RESOLVER_SKILL_LIMIT_EXCEEDED').length, 1);
});
