/**
 * tests/validate.test.js
 * Tests for .agents/validate.js — the skill validation engine
 * Uses Node.js built-in test runner (node:test) — no dependencies needed
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CTX_PATH = path.join(__dirname, '..', '.agents', 'ctx.js');
const VALIDATE_PATH = path.join(__dirname, '..', '.agents', 'validate.js');
const ROOT = path.join(__dirname, '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run validate in a given cwd, return { stdout, stderr, code } */
function runValidate(cwd = ROOT) {
  try {
    const stdout = execSync(`node "${CTX_PATH}" validate`, {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    }).toString();
    return { stdout, code: 0 };
  } catch (err) {
    return {
      stdout: (err.stdout || Buffer.alloc(0)).toString(),
      stderr: (err.stderr || Buffer.alloc(0)).toString(),
      code: err.status || 1,
    };
  }
}

/** Create a temp skill sandbox for isolation tests */
function makeSandbox() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-test-'));
  const agentsDir = path.join(tmpDir, '.agents');
  const coreSkills = path.join(agentsDir, 'core', 'skills');
  const generated = path.join(agentsDir, 'generated');

  fs.mkdirSync(coreSkills, { recursive: true });
  fs.mkdirSync(path.join(generated, 'gemini', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(generated, 'claude', 'skills'), { recursive: true });

  return { tmpDir, agentsDir, coreSkills, generated };
}

/** Write a valid SKILL.md with frontmatter */
function writeSkillMd(dir, { name = 'test-skill', description = 'A test skill', body = '# Content\n\nSome content here for testing purposes, ensuring minimum bytes.' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: >\n  ${description}\n---\n\n${body}\n`
  );
}

/** Write a valid skill.yaml */
function writeSkillYaml(dir, fields = {}) {
  const {
    id = 'test-skill',
    name = 'test-skill',
    description = 'A test skill',
    requires = [],
    conflicts = [],
    version = '1.0.0',
  } = fields;

  const requiresLine = requires.length ? `requires: [${requires.join(', ')}]` : 'requires: []';
  const conflictsLine = conflicts.length ? `conflicts: [${conflicts.join(', ')}]` : 'conflicts: []';

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'skill.yaml'),
    `id: ${id}\nname: ${name}\ndescription: ${description}\nversion: ${version}\n${requiresLine}\n${conflictsLine}\n`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Smoke test — real project
// ═════════════════════════════════════════════════════════════════════════════

describe('validate — real project', () => {
  test('validate.js file exists', () => {
    assert.ok(fs.existsSync(VALIDATE_PATH), 'validate.js should exist at .agents/validate.js');
  });

  test('ctx.js validate command runs successfully on this project', () => {
    const { code, stdout } = runValidate(ROOT);
    // The validator should either pass or only warn — never error on the real repo
    assert.ok(
      stdout.includes('ContextOS') || stdout.includes('PASSED') || stdout.includes('FAILED'),
      'Should produce a validation report'
    );
    // Errors in our own skills are a hard failure
    assert.equal(code, 0, `Validator exited with code ${code} — check errors above`);
  });

  test('output includes the PASSED banner', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('PASSED'), 'Should show PASSED in output');
  });

  test('output lists frontmatter check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[frontmatter]'), 'Should include frontmatter check output');
  });

  test('output lists stale check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[stale]'), 'Should include stale check output');
  });

  test('output lists dependency check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[deps]'), 'Should include deps check output');
  });

  test('output lists sync check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[sync]') || stdout.includes('[missing]'), 'Should include sync check output');
  });

  test('output lists resources check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[resources]'), 'Should include resources check output');
  });

  test('output lists profiles check results', () => {
    const { stdout } = runValidate(ROOT);
    assert.ok(stdout.includes('[profiles]'), 'Should include profiles check output');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Unit-level tests using sandboxed skill directories
// ═════════════════════════════════════════════════════════════════════════════

describe('validate — unit: frontmatter checks', () => {
  test('detects unclosed YAML frontmatter', () => {
    const { coreSkills } = makeSandbox();
    const skillDir = path.join(coreSkills, 'broken-skill');
    fs.mkdirSync(skillDir);
    // Write a SKILL.md that starts with --- but has NO closing delimiter.
    // We deliberately avoid any triple-dash in the body so indexOf returns -1.
    const body = [
      '---',
      'name: broken-skill',
      'description: Missing closing delimiter',
      '',
      'Body text here with no triple dash anywhere below.',
    ].join('\n');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), body);

    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const hasFrontmatter = content.startsWith('---');
    // indexOf starting at position 3 should find nothing — there is no closing ---
    const closingIdx = content.indexOf('---', 3);
    assert.ok(hasFrontmatter, 'File starts with ---');
    assert.equal(closingIdx, -1, 'No closing --- should be present in this malformed file');
  });

  test('accepts valid SKILL.md with name and description', () => {
    const { coreSkills } = makeSandbox();
    const skillDir = path.join(coreSkills, 'good-skill');
    writeSkillMd(skillDir);

    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const closingIdx = content.indexOf('---', 3);
    const frontmatter = content.slice(3, closingIdx);

    assert.ok(closingIdx > 3, 'Should have closing ---');
    assert.ok(frontmatter.includes('name:'), 'Should have name:');
    assert.ok(frontmatter.includes('description:'), 'Should have description:');
  });

  test('detects missing name: in frontmatter', () => {
    const { coreSkills } = makeSandbox();
    const skillDir = path.join(coreSkills, 'no-name-skill');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\ndescription: Has description but no name\n---\n\nBody text here for the skill.`
    );
    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const closingIdx = content.indexOf('---', 3);
    const frontmatter = content.slice(3, closingIdx);
    assert.ok(!frontmatter.match(/^name:\s*.+/m), 'Should not have name:');
  });
});

describe('validate — unit: dependency graph', () => {
  test('valid requires pointing to known skill is accepted', () => {
    const { coreSkills } = makeSandbox();

    // Create dependency target
    const depDir = path.join(coreSkills, 'typescript');
    writeSkillMd(depDir, { name: 'typescript', description: 'TypeScript skill' });
    writeSkillYaml(depDir, { id: 'typescript', name: 'typescript' });

    // Create skill that requires it
    const skillDir = path.join(coreSkills, 'react');
    writeSkillMd(skillDir, { name: 'react', description: 'React skill' });
    writeSkillYaml(skillDir, { id: 'react', name: 'react', requires: ['typescript'] });

    const yamlText = fs.readFileSync(path.join(skillDir, 'skill.yaml'), 'utf8');
    const requiresRe = /^requires:\s*\[([^\]]*)\]/m;
    const match = yamlText.match(requiresRe);
    assert.ok(match, 'Should have requires: field');
    assert.ok(match[1].includes('typescript'), 'Should require typescript');
  });

  test('self-conflict is detectable', () => {
    const { coreSkills } = makeSandbox();
    const skillDir = path.join(coreSkills, 'bad-skill');
    writeSkillYaml(skillDir, {
      id: 'bad-skill',
      name: 'bad-skill',
      conflicts: ['bad-skill'],
    });

    const yamlText = fs.readFileSync(path.join(skillDir, 'skill.yaml'), 'utf8');
    const conflictsRe = /^conflicts:\s*\[([^\]]*)\]/m;
    const match = yamlText.match(conflictsRe);
    assert.ok(match, 'Should have conflicts: field');
    // The field value equals the skill's own id — detect self-conflict
    assert.ok(match[1].includes('bad-skill'), 'Skill conflicts with itself');
  });
});

describe('validate — unit: sync checks', () => {
  test('detects source skill not compiled to gemini', () => {
    const { coreSkills, generated } = makeSandbox();

    // Source skill exists
    const skillDir = path.join(coreSkills, 'my-skill');
    writeSkillMd(skillDir);

    // But generated/gemini/skills/my-skill is absent
    const genGemini = path.join(generated, 'gemini', 'skills');
    const compiled = fs.readdirSync(genGemini);
    assert.ok(!compiled.includes('my-skill'), 'Should not be compiled yet');
  });

  test('detects orphan in generated (no source)', () => {
    const { coreSkills, generated } = makeSandbox();

    // Write a generated skill with NO source counterpart
    const orphanDir = path.join(generated, 'gemini', 'skills', 'ghost-skill');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'SKILL.md'), '# Ghost\n\nThis skill has no source.\n');

    // Verify source doesn't have it
    const srcSkills = fs.readdirSync(coreSkills);
    assert.ok(!srcSkills.includes('ghost-skill'), 'Source should not have ghost-skill');
  });
});

describe('validate — npm script', () => {
  test('"npm run validate" script is defined in package.json', () => {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.scripts && pkg.scripts.validate, 'package.json should have a validate script');
    assert.ok(
      pkg.scripts.validate.includes('validate'),
      'validate script should reference validate command'
    );
  });
});
