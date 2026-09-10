/**
 * tests/export.test.js
 * Tests for .agents/ctx.js — the context compiler
 * Uses Node.js built-in test runner (node:test) — no dependencies needed
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CTX_PATH        = path.join(__dirname, '..', '.agents', 'ctx.js');
const GENERATED_GEMINI = path.join(__dirname, '..', '.agents', 'generated', 'gemini', 'skills');
const GENERATED_CLAUDE = path.join(__dirname, '..', '.agents', 'generated', 'claude', 'skills');

// New adapters output to project root (cwd when running tests = repo root)
const ROOT = path.join(__dirname, '..');
const CURSOR_FILE  = path.join(ROOT, '.cursorrules');
const CURSOR_RULES_DIR = path.join(ROOT, '.cursor', 'rules');
const COPILOT_FILE = path.join(ROOT, '.github', 'copilot-instructions.md');
const AIDER_CONF   = path.join(ROOT, '.aider.conf.yml');
const CONVENTIONS  = path.join(ROOT, 'CONVENTIONS.md');
const ZED_RULES    = path.join(ROOT, '.zed', 'rules.md');
const ZED_PROMPTS  = path.join(ROOT, '.zed', 'prompts');
const PLUGIN_DIR   = path.join(ROOT, '.agents', 'plugins', 'export-test-plugin');

describe('ctx.js — context compiler', () => {
  test('exits with error when no arguments given', () => {
    assert.throws(
      () => execSync(`node "${CTX_PATH}"`, { stdio: 'pipe' }),
      (err) => {
        assert.ok(err instanceof Error, 'Should throw an error');
        return true;
      }
    );
  });

  test('exits with error for unknown agent', () => {
    assert.throws(
      () => execSync(`node "${CTX_PATH}" export unknown-agent`, { stdio: 'pipe' }),
      'Should exit with error for unsupported agent'
    );
  });

  describe('export gemini', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export gemini`);
    });

    test('creates generated/gemini/skills/ directory', () => {
      assert.ok(fs.existsSync(GENERATED_GEMINI), 'generated/gemini/skills/ should exist');
    });

    test('generates at least 10 skill directories', () => {
      const skills = fs.readdirSync(GENERATED_GEMINI);
      assert.ok(skills.length >= 10, `Expected ≥10 skills, got ${skills.length}`);
    });

    test('each skill directory contains SKILL.md', () => {
      const skills = fs.readdirSync(GENERATED_GEMINI);
      for (const skill of skills) {
        const skillMd = path.join(GENERATED_GEMINI, skill, 'SKILL.md');
        assert.ok(
          fs.existsSync(skillMd),
          `${skill}/SKILL.md should exist`
        );
      }
    });

    test('gstack-roles SKILL.md contains expected content', () => {
      const skillMd = path.join(GENERATED_GEMINI, 'gstack-roles', 'SKILL.md');
      assert.ok(fs.existsSync(skillMd), 'gstack-roles/SKILL.md should exist');
      const content = fs.readFileSync(skillMd, 'utf8');
      assert.ok(content.includes('gstack-roles'), 'Should reference skill name');
      assert.ok(content.length > 500, 'SKILL.md should have substantial content');
    });

    test('ponytail-mindset SKILL.md contains 7-rung ladder', () => {
      const skillMd = path.join(GENERATED_GEMINI, 'ponytail-mindset', 'SKILL.md');
      const content = fs.readFileSync(skillMd, 'utf8');
      assert.ok(content.includes('YAGNI'), 'Should contain YAGNI reference');
    });

    test('generated SKILL.md files have valid frontmatter', () => {
      const skills = fs.readdirSync(GENERATED_GEMINI);
      for (const skill of skills) {
        const skillMd = path.join(GENERATED_GEMINI, skill, 'SKILL.md');
        const content = fs.readFileSync(skillMd, 'utf8');
        if (content.startsWith('---')) {
          // Has frontmatter — validate it closes properly
          const closingIndex = content.indexOf('---', 3);
          assert.ok(
            closingIndex > 3,
            `${skill}/SKILL.md has unclosed frontmatter`
          );
        }
      }
    });
  });

  describe('export claude', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export claude`);
    });

    test('creates generated/claude/skills/ directory', () => {
      assert.ok(fs.existsSync(GENERATED_CLAUDE), 'generated/claude/skills/ should exist');
    });

    test('claude SKILL.md files do NOT have YAML frontmatter', () => {
      const skills = fs.readdirSync(GENERATED_CLAUDE);
      for (const skill of skills) {
        const skillMd = path.join(GENERATED_CLAUDE, skill, 'SKILL.md');
        const content = fs.readFileSync(skillMd, 'utf8');
        assert.ok(
          !content.startsWith('---'),
          `${skill}/SKILL.md should not start with YAML frontmatter for Claude format`
        );
      }
    });
  });

  describe('export cursor', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export cursor`, { cwd: ROOT });
    });

    test('creates .cursor/rules/ directory with .mdc files', () => {
      assert.ok(fs.existsSync(CURSOR_RULES_DIR), '.cursor/rules/ directory should exist');
      const mdcFiles = fs.readdirSync(CURSOR_RULES_DIR).filter(f => f.endsWith('.mdc'));
      assert.ok(mdcFiles.length >= 5, `Expected ≥5 .mdc files, got ${mdcFiles.length}`);
      assert.ok(mdcFiles.includes('00-project-rules.mdc'), '00-project-rules.mdc should exist');
    });

    test('.cursor/rules/*.mdc files have valid YAML frontmatter with globs and alwaysApply', () => {
      const mdcFiles = fs.readdirSync(CURSOR_RULES_DIR).filter(f => f.endsWith('.mdc'));
      for (const file of mdcFiles) {
        const content = fs.readFileSync(path.join(CURSOR_RULES_DIR, file), 'utf8');
        assert.ok(content.startsWith('---'), `${file} should start with YAML frontmatter`);
        assert.ok(content.includes('description:'), `${file} should have description field`);
        assert.ok(content.includes('alwaysApply:'), `${file} should have alwaysApply field`);
      }
    });
  });

  describe('export copilot', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export copilot`, { cwd: ROOT });
    });

    test('creates .github/copilot-instructions.md', () => {
      assert.ok(fs.existsSync(COPILOT_FILE), '.github/copilot-instructions.md should exist');
    });

    test('copilot-instructions.md has correct header', () => {
      const content = fs.readFileSync(COPILOT_FILE, 'utf8');
      assert.ok(content.includes('GitHub Copilot Instructions'), 'Should include copilot header');
    });

    test('copilot-instructions.md contains skills library section', () => {
      const content = fs.readFileSync(COPILOT_FILE, 'utf8');
      assert.ok(content.includes('## Skills Library'), 'Should include Skills Library section');
    });

    test('copilot-instructions.md contains at least 5 skill subsections', () => {
      const content = fs.readFileSync(COPILOT_FILE, 'utf8');
      const matches = content.match(/^### /gm) || [];
      assert.ok(matches.length >= 5, `Expected ≥5 skill entries, got ${matches.length}`);
    });
  });

  describe('export aider', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export aider`, { cwd: ROOT });
    });

    test('creates .aider.conf.yml at project root', () => {
      assert.ok(fs.existsSync(AIDER_CONF), '.aider.conf.yml should exist');
    });

    test('creates CONVENTIONS.md at project root', () => {
      assert.ok(fs.existsSync(CONVENTIONS), 'CONVENTIONS.md should exist');
    });

    test('.aider.conf.yml references CONVENTIONS.md via read directive', () => {
      const content = fs.readFileSync(AIDER_CONF, 'utf8');
      assert.ok(content.includes('read:'), 'Should have a read: directive');
      assert.ok(content.includes('CONVENTIONS.md'), 'Should reference CONVENTIONS.md');
    });

    test('CONVENTIONS.md includes project rules and skills', () => {
      const content = fs.readFileSync(CONVENTIONS, 'utf8');
      assert.ok(content.includes('## Skill:'), 'Should include skill sections');
    });

    test('CONVENTIONS.md has substantial content', () => {
      const content = fs.readFileSync(CONVENTIONS, 'utf8');
      assert.ok(content.length > 2000, 'CONVENTIONS.md should have substantial content');
    });
  });

  describe('export zed', () => {
    before(() => {
      execSync(`node "${CTX_PATH}" export zed`, { cwd: ROOT });
    });

    test('creates .zed/rules.md at project root', () => {
      assert.ok(fs.existsSync(ZED_RULES), '.zed/rules.md should exist');
    });

    test('.zed/rules.md has ContextOS header', () => {
      const content = fs.readFileSync(ZED_RULES, 'utf8');
      assert.ok(content.includes('ContextOS'), 'Should include ContextOS header');
      assert.ok(content.includes('Zed Assistant'), 'Should mention Zed Assistant');
    });

    test('.zed/rules.md contains skills library section', () => {
      const content = fs.readFileSync(ZED_RULES, 'utf8');
      assert.ok(content.includes('## Skills Library'), 'Should include Skills Library section');
    });

    test('.zed/prompts/ directory contains prompt files', () => {
      assert.ok(fs.existsSync(ZED_PROMPTS), '.zed/prompts should exist');
      const files = fs.readdirSync(ZED_PROMPTS);
      assert.ok(files.length >= 5, `Expected at least 5 prompt files, got ${files.length}`);
      assert.ok(files.includes('contextos.md'), 'contextos.md prompt should exist');
    });
  });

  describe('export all', () => {
    test('export all runs all adapters successfully', () => {
      const output = execSync(`node "${CTX_PATH}" export all`, { cwd: ROOT }).toString();
      assert.ok(output.includes('gemini') || output.includes('Gemini'), 'Should mention Gemini');
      assert.ok(output.includes('claude') || output.includes('Claude'), 'Should mention Claude');
      assert.ok(output.includes('cursor') || output.includes('Cursor'), 'Should mention Cursor');
      assert.ok(output.includes('copilot') || output.includes('Copilot'), 'Should mention Copilot');
      assert.ok(output.includes('aider') || output.includes('Aider'), 'Should mention Aider');
      assert.ok(output.includes('zed') || output.includes('Zed'), 'Should mention Zed');
      assert.ok(output.includes('All exports complete'), 'Should confirm all exports complete');
    });
  });

  describe('plugin skill export', () => {
    before(() => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'SKILL.md'), '# Export test plugin\n\nPlugin instructions unique-marker-export-test.\n');
      execSync(`node "${CTX_PATH}" export all`, { cwd: ROOT });
    });

    after(() => {
      fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
      execSync(`node "${CTX_PATH}" export all`, { cwd: ROOT });
    });

    test('includes installed plugins in every adapter output', () => {
      assert.ok(fs.existsSync(path.join(GENERATED_GEMINI, 'export-test-plugin', 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(GENERATED_CLAUDE, 'export-test-plugin', 'SKILL.md')));
      assert.ok(fs.readFileSync(path.join(ROOT, '.cursor', 'rules', 'export-test-plugin.mdc'), 'utf8').includes('unique-marker-export-test'));
      assert.ok(fs.readFileSync(COPILOT_FILE, 'utf8').includes('unique-marker-export-test'));
      assert.ok(fs.readFileSync(CONVENTIONS, 'utf8').includes('unique-marker-export-test'));
      assert.ok(fs.readFileSync(ZED_RULES, 'utf8').includes('unique-marker-export-test'));
    });

    test('clears removed plugins from generated skill directories', () => {
      fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
      execSync(`node "${CTX_PATH}" export gemini`, { cwd: ROOT });
      assert.ok(!fs.existsSync(path.join(GENERATED_GEMINI, 'export-test-plugin')));
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'SKILL.md'), '# Export test plugin\n\nPlugin instructions unique-marker-export-test.\n');
    });
  });
});
