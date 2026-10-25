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

test('catalog skills are recommended by default and dropped with installedOnly', () => {
  const registry = registryWith({ 'team-auth': teamAuth });
  const defaults = new CanonicalResolver({ rootDir, registry }).resolve({ task: 'Add a Dockerfile for the service' });
  assert.ok(defaults.selected.some(skill => skill.id === 'docker'), 'catalog recommendation is part of the default contract');

  const installed = new CanonicalResolver({ rootDir, registry }).resolve({ task: 'Add a Dockerfile for the service', installedOnly: true });
  assert.ok(!installed.selected.some(skill => skill.id === 'docker'), 'docker is not installed in this project');
});
