'use strict';

/**
 * A team's own rules have no authored routing signals. The resolver routes on
 * what a rule says about itself, and can be limited to what is installed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');

const rootDir = path.resolve(__dirname, '..');

test('project-only initialization resolves its own exported rules without package skill fallback', t => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-project-resolver-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const cli = path.join(rootDir, 'bin', 'index.js');
  const run = args => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--project', project, '--json'], { encoding: 'utf8' }));
  run(['init']);
  const empty = run(['resolve', 'Adjust behavior', '--installed-only']);
  assert.deepEqual(empty.skills, [], 'an empty project must not inherit installed package skills');
  const skillDir = path.join(project, '.agents/project/skills/team-payments');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: team-payments\ndescription: Team payments rules.\n---\n# Payments\nNever log credit card details.\n');
  run(['export', 'gemini']);
  assert.ok(fs.existsSync(path.join(project, '.agents/skills/team-payments/SKILL.md')));
  const result = run(['resolve', 'Use @team-payments', '--installed-only']);
  assert.deepEqual(result.skills, ['team-payments']);
  assert.ok(!result.warnings.some(warning => warning.skillId === 'team-payments'));
  assert.equal(fs.existsSync(path.join(project, '.agents/compiled/registry.v2.json')), false, 'resolution compiles in memory');
});

test('progressive index paths identify real manifest and manifestless entrypoints', t => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-index-resolver-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const cases = [
    { id: 'manifest-v1', manifest: 'skill.yaml', entrypoint: 'SKILL.md' },
    { id: 'manifest-v2', manifest: 'skill.v2.yaml', entrypoint: 'docs/POLICY.md' },
    { id: 'manifestless', manifest: null, entrypoint: 'SKILL.md' },
  ];
  for (const item of cases) {
    const skillDir = path.join(project, '.agents/project/skills', item.id);
    const entrypoint = path.join(skillDir, item.entrypoint);
    fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
    fs.writeFileSync(entrypoint, `---\nname: ${item.id}\ndescription: Fixture rules.\n---\n# Policy\n`);
    if (item.manifest) fs.writeFileSync(path.join(skillDir, item.manifest), JSON.stringify({ schemaVersion: item.manifest === 'skill.v2.yaml' ? 2 : 1, id: item.id, entrypoint: item.entrypoint }));
  }
  const resolver = new CanonicalResolver({ rootDir: project });
  const index = resolver.buildSkillIndex();
  assert.equal(index.length, cases.length);
  for (const item of cases) {
    const entry = index.find(skill => skill.name === item.id);
    assert.equal(entry.path, `.agents/project/skills/${item.id}/${item.entrypoint}`);
    assert.ok(fs.statSync(path.resolve(project, entry.path)).isFile());
  }
  execFileSync(process.execPath, [path.join(rootDir, 'bin/index.js'), 'index', '--project', project], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, '.agents/skills-index.json'), 'utf8')).skills, index);
});

test('public index refuses junction escapes and respects the project writer lock', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-index-safety-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = path.join(base, 'project');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'skills-index.json'), 'outside sentinel\n');
  fs.symlinkSync(outside, path.join(project, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  const cli = path.join(rootDir, 'bin/index.js');
  assert.throws(() => execFileSync(process.execPath, [cli, 'index', '--project', project], { encoding: 'utf8', stdio: 'pipe' }), error => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /symlink|junction|outside|escape/i);
    return true;
  });
  assert.equal(fs.readFileSync(path.join(outside, 'skills-index.json'), 'utf8'), 'outside sentinel\n');
  assert.equal(fs.existsSync(path.join(outside, '.contextos')), false);

  const lockedProject = path.join(base, 'locked');
  fs.mkdirSync(path.join(lockedProject, '.agents/project/skills'), { recursive: true });
  const { ProjectMutationLock } = require('../.agents/filesystem/index.js');
  const lock = new ProjectMutationLock(lockedProject);
  const token = lock.acquire({ command: 'test-index-lock' });
  try {
    assert.throws(() => execFileSync(process.execPath, [cli, 'index', '--project', lockedProject], { encoding: 'utf8', stdio: 'pipe' }), error => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /busy|locked|another/i);
      return true;
    });
    assert.equal(fs.existsSync(path.join(lockedProject, '.agents/skills-index.json')), false);
  } finally {
    lock.release(token);
  }
});

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
