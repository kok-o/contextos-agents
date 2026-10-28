'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { CORE_SKILLS, EXECUTABLE_EXAMPLES, coreSkillFiles, verifyCoreSkills } = require('../scripts/verify-core-skills.cjs');
const { extractSkillExamples } = require('../scripts/verify-skill-examples');
const { validateEvidenceReport, validateEvidenceSchema } = require('../.agents/validation-evidence');
const { RuleCatalog, ENFORCEMENT_LEVELS } = require('../.agents/rules/rule-catalog');
const ROOT = path.resolve(__dirname, '..');

test('instruction baseline and prepared scenarios have structural provenance, not model-result claims', () => {
  const evidenceDir = path.join(ROOT, 'docs/evidence');
  const baseline = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'gemini-flash-3-8-rules-baseline.json'), 'utf8'));
  const pack = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'gemini-flash-3-8-rules-scenarios.json'), 'utf8'));
  assert.equal(baseline.kind, 'instruction-baseline-not-model-results');
  assert.match(baseline.revision, /^[a-f0-9]{40}$/);
  assert.equal(new Set(baseline.files.map(f => f.path)).size, baseline.files.length);
  for (const file of baseline.files) {
    assert.equal(crypto.createHash('sha256').update(file.content).digest('hex'), file.sha256, file.path);
  }
  assert.equal(pack.kind, 'frozen-manual-behavior-scenarios-not-results');
  assert.equal(pack.protocol.status, 'prepared_not_run');
  assert.equal(pack.protocol.modelCallsAuthorized, false);
  assert.equal(pack.baseline, 'gemini-flash-3-8-rules-baseline.json');
  assert.equal(new Set(pack.scenarios.map(s => s.id)).size, pack.scenarios.length);
  assert.ok(pack.scenarios.some(s => s.id === 'discussion-control'));
  assert.ok(pack.scenarios.some(s => s.id === 'typo-control'));
  for (const scenario of pack.scenarios) {
    assert.ok(scenario.prompt && scenario.acceptance.length && scenario.forbiddenActions.length, scenario.id);
    assert.ok(Object.keys(scenario.initialFiles).length, scenario.id);
    for (const relative of Object.keys(scenario.initialFiles)) {
      assert.equal(path.isAbsolute(relative), false, relative);
      assert.equal(relative.split(/[\\/]/).includes('..'), false, relative);
    }
    if (scenario.oracle) assert.doesNotThrow(() => new vm.Script(scenario.oracle), scenario.id);
  }
});

test('all seven core bundles have original-source example or routing evidence with explicit scope', async () => {
  const results = await verifyCoreSkills();
  assert.deepEqual(results.filter(r => !r.passed), []);
  assert.deepEqual([...new Set(results.map(r => r.skillId))].sort(), [...CORE_SKILLS].sort());
  assert.ok(results.some(r => r.kind === 'behavioral-test'));
  assert.ok(results.some(r => r.kind === 'structural-contract'));
  const blocks = coreSkillFiles(ROOT).flatMap(extractSkillExamples);
  const runnable = blocks.filter(b => b.type === 'runnable');
  assert.deepEqual(runnable.map(b => b.exampleId).sort(), Object.keys(EXECUTABLE_EXAMPLES).sort());
  assert.deepEqual(blocks.filter(b => b.type === 'unverified'), []);
});

test('behavior checks detect broken original Markdown guards, not an unchanged copied implementation', async () => {
  const mutations = [
    ['security-ssrf', source => source.replace("  if (parsed.port && parsed.port !== '443') throw new Error('SSRF blocked: non-standard port');", '')],
    ['security-hmac', source => source.replace('crypto.timingSafeEqual(digest, received)', 'true')],
    ['ponytail-update', source => source.replace("keys.some(key => !['name', 'email'].includes(key))", 'false')],
    ['gemini-transfer', source => source.replace('!Number.isSafeInteger(tx.senderBalance)', 'false')],
  ];
  for (const [id, mutate] of mutations) {
    const [skill, relative] = EXECUTABLE_EXAMPLES[id];
    const original = fs.readFileSync(path.join(ROOT, '.agents/core/skills', skill, relative), 'utf8');
    const broken = mutate(original);
    assert.notEqual(broken, original, id);
    const results = await verifyCoreSkills({ sourceOverrides: { [id]: broken } });
    assert.ok(results.some(r => r.skillId === skill && !r.passed), `Mutation must fail: ${id}`);
  }
});

test('new core runnable blocks cannot silently acquire behavioral verification', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-unverified-block-'));
  t.after(() => {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('ctx-unverified-block-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const file = path.join(ROOT, '.agents/core/skills/security/SKILL.md');
  const candidate = path.join(temp, 'SKILL.md');
  fs.writeFileSync(candidate, fs.readFileSync(file, 'utf8') +
    '\n<!-- example: unregistered -->\n```javascript\nconst x = 1;\n```\n' +
    '\n```javascript\nconst y = 2;\n```\n' +
    '\n<!-- example: gemini-transfer -->\n```javascript\nconst z = 3;\n```\n' +
    '\n```js\nconst shortFence = 4;\n```\n');
  const blocks = extractSkillExamples({ id: 'security', file: candidate, isCore: true });
  // Copies and borrowed IDs cannot claim the evidence attached to original files.
  assert.equal(blocks.filter(b => b.type === 'unverified').length, 6);
  assert.equal(blocks.filter(b => b.type === 'runnable').length, 0);
});

test('evidence reports reject unsupported completion while preserving partial/unrun outcomes', () => {
  const check = { command: 'node --test', exitCode: 0, scope: 'authorization regression' };
  assert.deepEqual(validateEvidenceReport({ status: 'verified', checks: [check], limitations: ['No live client tested'] }), []);
  assert.deepEqual(validateEvidenceReport({ status: 'partial', checks: [{ ...check, exitCode: 1 }], limitations: ['Regression failed'] }), []);
  assert.deepEqual(validateEvidenceReport({ status: 'not_run', checks: [{ ...check, exitCode: null }], limitations: ['Environment unavailable'] }), []);
  for (const invalid of [
    { rules_followed: true },
    { status: 'verified', checks: [], limitations: [] },
    { status: 'verified', checks: [{ ...check, exitCode: 1 }], limitations: [] },
    { status: 'verified', checks: [{ ...check, exitCode: null }], limitations: [] },
    { status: 'partial', checks: [check], limitations: [] },
    { status: 'not_run', checks: [check], limitations: ['Not run'] },
    { status: 'verified', checks: [{ command: 'test', exitCode: 0 }], limitations: [] },
  ]) assert.ok(validateEvidenceReport(invalid).length, JSON.stringify(invalid));
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, '.agents/core/skills/security/VALIDATION.json'), 'utf8'));
  assert.deepEqual(validateEvidenceSchema(schema), []);
  schema.properties.status.enum.push('DONE');
  assert.ok(validateEvidenceSchema(schema).length);
});

test('completion evidence is guidance rather than falsely enforced by frontmatter validation', () => {
  const rule = new RuleCatalog().getRule('TEST-001');
  assert.equal(rule.enforcement, ENFORCEMENT_LEVELS.PROMPT_GUIDANCE);
  assert.equal(rule.checker, null);
});

test('example CLI exposes seven-core coverage and separates structural from behavioral checks', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-skill-examples.js', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.coverage.coreSkills, CORE_SKILLS);
  const structural = report.behavioralResults.filter(r => r.kind === 'structural-contract');
  assert.equal(structural.filter(r => r.id.startsWith('core:')).length, 7);
  assert.equal(report.stats.structuralChecksRun, structural.length);
  assert.equal(structural.filter(r => r.id.startsWith('web-accessibility:')).length, 3);
  assert.equal(structural.filter(r => r.id.startsWith('adapters:')).length, 2);
  assert.equal(report.stats.fixtureChecksRun, 3);
  assert.ok(report.stats.behavioralChecksRun > 0);
  assert.ok(report.coverage.limitations.length);
});
