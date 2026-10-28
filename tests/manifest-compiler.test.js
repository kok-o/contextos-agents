/**
 * tests/manifest-compiler.test.js
 * Unit and integration tests for ContextOS ManifestCompiler & Registry v2
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ManifestCompiler, CODES, parseYaml } = require('../.agents/compiler/manifest-compiler.js');

for (const collision of ['security', 'shared-alias', 'Security', 'Shared-Alias']) {
  test(`F04 compiler diagnoses alias collision with ${collision}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-alias-collision-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const [id, aliases] of [['aaa-security-note', [collision]], ['security', [collision.toLowerCase()]]]) {
      const dir = path.join(root, '.agents/core/skills', id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n`);
      fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify({ id, signals: { aliases } }));
    }
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.registry, null);
    assert.ok(result.diagnostics.some(d => d.code === CODES.DUPLICATE_ALIAS && d.path === '/signals/aliases' && d.message.toLowerCase().includes(collision.toLowerCase())), JSON.stringify(result.diagnostics));
  });
}

const malformedManifests = [
  [{ dependencies: { requires: 'missing-prerequisite' } }, '/dependencies/requires'],
  [{ signals: { keywords: [{ value: 42, weight: 40 }] } }, '/signals/keywords/0/value'],
  [{ requires: 'missing-prerequisite' }, '/requires'],
  [{ optional: [42] }, '/optional/0'],
  [{ conflicts: {} }, '/conflicts'],
  [{ dependencies: [] }, '/dependencies'],
  [{ dependencies: { requires: [null] } }, '/dependencies/requires/0'],
  [{ dependencies: { optional: 'note' } }, '/dependencies/optional'],
  [{ dependencies: { conflicts: false } }, '/dependencies/conflicts'],
  [{ dependencies: { typo: [] } }, '/dependencies/typo'],
  [{ signals: [] }, '/signals'],
  [{ signals: { aliases: 'security' } }, '/signals/aliases'],
  [{ signals: { aliases: [false] } }, '/signals/aliases/0'],
  [{ signals: { keywords: [null] } }, '/signals/keywords/0'],
  [{ signals: { keywords: [{ value: 'word' }] } }, '/signals/keywords/0/weight'],
  [{ signals: { keywords: [{ value: 'word', weight: 101 }] } }, '/signals/keywords/0/weight'],
  [{ signals: { keywords: [{ value: 'word', weight: 40, locale: 'bad' }] } }, '/signals/keywords/0/locale'],
  [{ signals: { keywords: [{ value: 'word', weight: 40, typo: true }] } }, '/signals/keywords/0/typo'],
  [{ signals: { fileGlobs: [{ value: false, weight: 40 }] } }, '/signals/fileGlobs/0/value'],
  [{ signals: { packages: [{ ecosystem: 'npm', name: 42, weight: 40 }] } }, '/signals/packages/0/name'],
  [{ signals: { packages: [{ ecosystem: 'bad', name: 'pkg', weight: 40 }] } }, '/signals/packages/0/ecosystem'],
  [{ signals: { typo: [] } }, '/signals/typo'],
  [{ context: { priority: '100' } }, '/context/priority'],
  [{ context: { priority: 101 } }, '/context/priority'],
  [{ context: { estimatedTokens: -1 } }, '/context/estimatedTokens'],
  [{ context: { typo: true } }, '/context/typo'],
  [{ resources: [null] }, '/resources/0'],
  [{ resources: [{ path: 'SKILL.md', mode: 'bad' }] }, '/resources/0'],
  [{ resources: [{ path: 'SKILL.md', typo: true }] }, '/resources/0'],
  [{ rules: 'rule' }, '/rules'],
  [{ rules: [null] }, '/rules/0'],
  [{ rules: [{ id: 'RULE', level: 'must', enforcement: 'reference', summary: 42 }] }, '/rules/0/summary'],
  [{ rules: [{ id: 'RULE', level: 'must', enforcement: 'reference', summary: 'Rule', tokenCost: -1 }] }, '/rules/0/tokenCost'],
  [{ deprecated: 'false' }, '/deprecated'],
  [{ canonical: 42 }, '/canonical'],
  [{ description: 42 }, '/description'],
  [{ displayName: false }, '/displayName'],
  [{ version: true }, '/version'],
  [{ schemaVersion: 3 }, '/schemaVersion'],
  [{ category: 'bad' }, '/category'],
  [{ weight: '9' }, '/weight'],
  [{ entrypoint: false }, '/entrypoint'],
  [{ unknown: true }, '/unknown'],
];
for (const [invalid, diagnosticPath] of malformedManifests) {
  test(`F05 rejects raw manifest ${JSON.stringify(invalid)}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-raw-manifest-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/core/skills/alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Alpha\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify({ id: 'alpha', ...invalid }));
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.registry, null);
    assert.ok(result.diagnostics.some(d => d.code === CODES.SCHEMA_ERROR && d.path === diagnosticPath), JSON.stringify(result.diagnostics));
  });
}

for (const dependency of ['constructor', '__proto__', 'toString']) {
  test(`F05 unknown dependency ${dependency} produces a controlled diagnostic`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-unknown-dependency-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/core/skills/alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Alpha\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify({ id: 'alpha', dependencies: { requires: [dependency] } }));
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.ok(result.diagnostics.some(d => d.code === CODES.UNKNOWN_DEPENDENCY && d.message.includes(dependency)), JSON.stringify(result.diagnostics));
  });
}

for (const raw of ['false', '0', 'null', '[]', 'alpha']) {
  test(`F05 rejects non-object YAML documents before normalization: ${raw}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-raw-document-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/core/skills/alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Alpha\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), raw);
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.ok(result.diagnostics.some(d => d.code === CODES.SCHEMA_ERROR), JSON.stringify(result.diagnostics));
  });
}

test('F05 valid raw nested fields survive compilation and actual resolution', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-valid-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = {
    schemaVersion: 2, id: 'alpha', displayName: 'Alpha', version: '1.2.3', description: 'Policy',
    type: 'instruction-only', category: 'general', entrypoint: 'SKILL.md', activation: 'auto',
    signals: { aliases: ['alpha-note'], keywords: [{ value: 'widget', weight: 40, locale: 'en' }],
      fileGlobs: [{ value: 'src/**/*.example', weight: 30 }], packages: [{ ecosystem: 'npm', name: 'pkg', weight: 35 }] },
    dependencies: { requires: ['beta'], optional: ['note'], conflicts: ['other'] },
    context: { priority: 80, estimatedTokens: 999 }, resources: [{ path: 'SKILL.md', mode: 'eager' }],
    deprecated: false, rules: [{ id: 'ALPHA_RULE', level: 'should', enforcement: 'reference', summary: 'Policy rule', tokenCost: 10 }],
  };
  for (const id of ['alpha', 'beta']) {
    const dir = path.join(root, '.agents/core/skills', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n`);
    fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify(id === 'alpha' ? manifest : { id, resources: ['SKILL.md'] }));
  }
  const compiler = new ManifestCompiler({ rootDir: root });
  const result = compiler.compile();
  assert.strictEqual(result.success, true, JSON.stringify(result.diagnostics));
  const compiled = result.registry.skills.alpha;
  assert.deepStrictEqual(compiled.dependencies, manifest.dependencies);
  assert.deepStrictEqual(compiled.signals.keywords, manifest.signals.keywords);
  assert.deepStrictEqual(compiled.signals.fileGlobs, manifest.signals.fileGlobs);
  assert.deepStrictEqual(compiled.signals.packages, manifest.signals.packages);
  assert.deepStrictEqual(compiled.resources, manifest.resources);
  assert.deepStrictEqual(compiled.rules, manifest.rules);
  assert.strictEqual(compiled.context.priority, 80);
  const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver.js');
  const resolved = new CanonicalResolver({ rootDir: root, registry: result.registry }).resolve({ task: 'Adjust widget', installedOnly: true });
  assert.deepStrictEqual(new Set(resolved.skills), new Set(['alpha', 'beta']));
});

for (const category of ['engineering', 'design']) {
  test(`F05 preserves the existing catalog authoring category ${category}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-legacy-category-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, '.agents/core/skills/alpha');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Alpha\n');
    fs.writeFileSync(path.join(dir, 'skill.yaml'), JSON.stringify({ schemaVersion: 2, name: 'alpha', category }));
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, true, JSON.stringify(result.diagnostics));
    assert.strictEqual(result.registry.skills.alpha.category, category);
  });
}

test('compiled registry honors its closed top-level schema without requiring a timestamp', () => {
  const schema = require('../registry.v2.schema.json');
  const result = new ManifestCompiler({ rootDir: path.resolve(__dirname, '..') }).compile();
  assert.strictEqual(result.success, true);
  for (const key of schema.required) assert.ok(Object.hasOwn(result.registry, key), `Missing schema-required field: ${key}`);
  for (const key of Object.keys(result.registry)) assert.ok(Object.hasOwn(schema.properties, key), `Undeclared field in closed schema: ${key}`);
});

test('compiler and adapters share activation, glob and manifest precedence', t => {
  const { resolveActivation } = require('../.agents/adapters/shared.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-activation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team rule\nactivation: auto\n---\nTeam policy');
  fs.writeFileSync(path.join(dir, 'skill.yaml'), 'id: team\nactivation: invalid\n');
  const v2 = path.join(dir, 'skill.v2.yaml');
  fs.writeFileSync(v2, 'id: team\nactivation: globs\nglobs: ["src/**/*.{ts,tsx}"]\n');
  const result = new ManifestCompiler({ rootDir: root }).compile();
  assert.strictEqual(result.success, true, JSON.stringify(result.diagnostics));
  assert.deepStrictEqual(result.registry.skills.team.activation, resolveActivation(dir));
  fs.writeFileSync(v2, 'id: team\nactivation: globs\n');
  const invalid = new ManifestCompiler({ rootDir: root }).compile();
  assert.strictEqual(invalid.success, false);
  assert.ok(invalid.diagnostics.some(d => d.code === CODES.SCHEMA_ERROR));
  fs.unlinkSync(v2);
  fs.unlinkSync(path.join(dir, 'skill.yaml'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\nactivation: globs\nglobs: [false]\n---\nTeam policy');
  assert.strictEqual(new ManifestCompiler({ rootDir: root }).compile().success, false);
  assert.throws(() => resolveActivation(dir), /globs/);
});

test('compiler rejects entrypoint and resource junctions outside a skill before reading them', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-manifest-paths-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '.agents/project/skills/team');
  const sibling = dir + '-outside';
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, 'outside.md'), '---\ninvalid: [\n---\nMust not be parsed');
  fs.symlinkSync(sibling, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const manifest of ['id: team\nentrypoint: linked/outside.md\n', 'id: team\nresources: [linked/outside.md]\n']) {
    fs.writeFileSync(path.join(dir, 'skill.yaml'), manifest);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Team policy');
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.ok(result.diagnostics.some(d => d.code === CODES.INVALID_PATH), JSON.stringify(result.diagnostics));
  }
});

for (const upstreamManifest of [true, false]) {
  test(`manifestless plugin duplicates fail compilation (upstream manifest: ${upstreamManifest})`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-manifest-duplicate-'));
    t.after(() => { assert.strictEqual(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }); });
    for (const rel of ['core/skills/team', 'plugins/thirdparty/skills/team']) {
      const dir = path.join(root, '.agents', rel);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: team\ndescription: Team rules\n---\nTeam policy');
    }
    if (upstreamManifest) fs.writeFileSync(path.join(root, '.agents/core/skills/team/skill.yaml'), 'id: team\nname: team\n');
    const result = new ManifestCompiler({ rootDir: root }).compile();
    assert.strictEqual(result.success, false);
    assert.ok(result.diagnostics.some(d => d.code === CODES.DUPLICATE_ID));
    assert.strictEqual(result.registry, null);
  });
}

test('ManifestCompiler — YAML Parser', async (t) => {
  await t.test('parses scalars and booleans correctly', () => {
    const yaml = `
id: my-skill
name: "My Skill"
version: 1.2.3
enabled: true
priority: 50
ratio: 3.14
`;
    const parsed = parseYaml(yaml);
    assert.strictEqual(parsed.id, 'my-skill');
    assert.strictEqual(parsed.name, 'My Skill');
    assert.strictEqual(parsed.version, '1.2.3');
    assert.strictEqual(parsed.enabled, true);
    assert.strictEqual(parsed.priority, 50);
    assert.strictEqual(parsed.ratio, 3.14);
  });

  await t.test('parses inline and block arrays', () => {
    const yaml = `
requires: [react, typescript]
optional:
  - tailwind
  - prisma
`;
    const parsed = parseYaml(yaml);
    assert.deepStrictEqual(parsed.requires, ['react', 'typescript']);
    assert.deepStrictEqual(parsed.optional, ['tailwind', 'prisma']);
  });

  await t.test('parses nested objects and list of objects', () => {
    const yaml = `
signals:
  aliases: [foo, bar]
  keywords:
    - value: "app router"
      weight: 10
    - value: "server actions"
      weight: 15
`;
    const parsed = parseYaml(yaml);
    assert.ok(parsed.signals);
    assert.deepStrictEqual(parsed.signals.aliases, ['foo', 'bar']);
    assert.strictEqual(parsed.signals.keywords.length, 2);
    assert.strictEqual(parsed.signals.keywords[0].value, 'app router');
    assert.strictEqual(parsed.signals.keywords[0].weight, 10);
    assert.strictEqual(parsed.signals.keywords[1].value, 'server actions');
    assert.strictEqual(parsed.signals.keywords[1].weight, 15);
  });

  await t.test('parser conformance fixtures', async (t) => {
    const fixturesDir = path.join(__dirname, 'fixtures', 'manifests');
    const readFixture = (name) => fs.readFileSync(path.join(fixturesDir, name), 'utf8');

    await t.test('quoted-hash', () => {
      const parsed = parseYaml(readFixture('quoted-hash.yaml'));
      assert.strictEqual(parsed.name, 'Name with # hash');
      assert.strictEqual(parsed.description, 'Another # hash');
    });

    await t.test('colon-in-string', () => {
      const parsed = parseYaml(readFixture('colon-in-string.yaml'));
      assert.strictEqual(parsed.name, 'Name with : colon');
      assert.strictEqual(parsed.url, 'https://example.com');
    });

    await t.test('empty-collections', () => {
      const parsed = parseYaml(readFixture('empty-collections.yaml'));
      assert.deepStrictEqual(parsed.requires, []);
      assert.deepStrictEqual(parsed.metadata, {});
    });

    await t.test('escaped-quotes', () => {
      const parsed = parseYaml(readFixture('escaped-quotes.yaml'));
      assert.strictEqual(parsed.name, 'Name with "escaped" quotes');
      assert.strictEqual(parsed.description, "Name with 'escaped' quotes");
    });

    await t.test('multiline', () => {
      const parsed = parseYaml(readFixture('multiline.yaml'));
      assert.strictEqual(parsed.description, 'This is a multiline\nstring.\n');
      assert.strictEqual(parsed.summary, 'This is a folded string.\n');
    });

    await t.test('anchors-aliases', () => {
      const parsed = parseYaml(readFixture('anchors-aliases.yaml'));
      assert.strictEqual(parsed.env.version, '1.0.0');
      assert.strictEqual(parsed.env.name, 'prod');
    });

    await t.test('malformed-indentation', () => {
      // In YAML 1.2, this is actually parsed as a single multiline plain scalar
      const parsed = parseYaml(readFixture('malformed-indentation.yaml'));
      assert.deepStrictEqual(parsed.requires, ['alpha - beta']);
    });

    await t.test('duplicate-keys', () => {
      assert.throws(() => parseYaml(readFixture('duplicate-keys.yaml')));
    });
  });
});

test('ManifestCompiler — Production Repository Compilation', async (t) => {
  const compiler = new ManifestCompiler({ rootDir: path.resolve(__dirname, '..') });
  const result = compiler.compile();

  await t.test('compiles all repository skills with zero errors', () => {
    assert.strictEqual(result.success, true, `Diagnostics: ${JSON.stringify(result.diagnostics)}`);
    assert.ok(result.registry);
    const skillCount = Object.keys(result.registry.skills).length;
    assert.ok(skillCount >= 7, `Expected at least 7 skills, found ${skillCount}`);
  });

  await t.test('produces deterministic sourceGraphHash', () => {
    const secondRun = compiler.compile();
    assert.strictEqual(result.registry.sourceGraphHash, secondRun.registry.sourceGraphHash);
    assert.ok(result.registry.sourceGraphHash.startsWith('sha256:'));
  });

  await t.test('enriches v1 manifests with rich signals and dependencies', () => {
    const wf = result.registry.skills['engineering-workflow'];
    assert.ok(wf);
    assert.strictEqual(wf.id, 'engineering-workflow');
    assert.ok(wf.entrypointHash.startsWith('sha256:'));
    assert.ok(wf.estimatedTokens > 0);
  });

  await t.test('correctly registers aliases and packageMap in registry', () => {
    assert.ok(result.registry.skills['engineering-workflow']);
  });
});

test('ManifestCompiler — Security & Guardrail Validations', async (t) => {
  // Helper to create an isolated mock workspace
  function createMockWorkspace() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-compiler-test-'));
    const coreSkills = path.join(tmp, '.agents', 'core', 'skills');
    fs.mkdirSync(coreSkills, { recursive: true });
    return { tmp, coreSkills };
  }

  function addMockSkill(coreSkills, id, yamlContent, skillMdContent = null) {
    const sDir = path.join(coreSkills, id);
    fs.mkdirSync(sDir, { recursive: true });
    fs.writeFileSync(path.join(sDir, 'skill.yaml'), yamlContent, 'utf8');
    fs.writeFileSync(path.join(sDir, 'SKILL.md'), skillMdContent || `---\nname: ${id}\ndescription: Test skill\n---\n# ${id}\n`, 'utf8');
    return sDir;
  }

  await t.test('catches self-dependency with CTX_MANIFEST_SELF_DEPENDENCY', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [alpha]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.SELF_DEPENDENCY));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches dependency cycle with CTX_MANIFEST_CYCLE_DETECTED', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [beta]\n');
    addMockSkill(coreSkills, 'beta', 'id: beta\nname: beta\nrequires: [gamma]\n');
    addMockSkill(coreSkills, 'gamma', 'id: gamma\nname: gamma\nrequires: [alpha]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.CYCLE_DETECTED));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches unknown dependency with CTX_MANIFEST_UNKNOWN_DEPENDENCY', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [non-existent-skill]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.UNKNOWN_DEPENDENCY));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches conflict violation with CTX_MANIFEST_CONFLICT_VIOLATION', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [beta]\nconflicts: [beta]\n');
    addMockSkill(coreSkills, 'beta', 'id: beta\nname: beta\nrequires: []\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.CONFLICT_VIOLATION));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches directory traversal in entrypoint with CTX_MANIFEST_INVALID_PATH', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nentrypoint: ../../../etc/passwd\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.INVALID_PATH));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches missing entrypoint on disk with CTX_MANIFEST_MISSING_ENTRYPOINT', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    const sDir = path.join(coreSkills, 'alpha');
    fs.mkdirSync(sDir, { recursive: true });
    fs.writeFileSync(path.join(sDir, 'skill.yaml'), 'id: alpha\nname: alpha\nentrypoint: NON_EXISTENT.md\n', 'utf8');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.MISSING_ENTRYPOINT));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('catches missing declared resource with CTX_MANIFEST_MISSING_RESOURCE', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nresources: [missing-file.md]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    const res = compiler.compile();

    assert.strictEqual(res.success, false);
    assert.ok(res.diagnostics.some(d => d.code === CODES.MISSING_RESOURCE));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await t.test('formats diagnostics as valid SARIF 2.1.0', () => {
    const { tmp, coreSkills } = createMockWorkspace();
    addMockSkill(coreSkills, 'alpha', 'id: alpha\nname: alpha\nrequires: [ghost]\n');

    const compiler = new ManifestCompiler({ rootDir: tmp });
    compiler.compile();
    const sarif = compiler.formatSarif();

    assert.strictEqual(sarif.version, '2.1.0');
    assert.strictEqual(sarif.runs.length, 1);
    assert.strictEqual(sarif.runs[0].tool.driver.name, 'contextos-manifest-compiler');
    assert.ok(sarif.runs[0].results.length > 0);
    assert.strictEqual(sarif.runs[0].results[0].ruleId, CODES.UNKNOWN_DEPENDENCY);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
