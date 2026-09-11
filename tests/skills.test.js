/**
 * tests/skills.test.js
 * Tests for .agents/core/skills/ — validates skill source files
 * Uses Node.js built-in test runner (node:test) — no dependencies needed
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CORE_SKILLS_PATH = path.join(__dirname, '..', '.agents', 'core', 'skills');

const REQUIRED_SKILLS = [
  'gstack-roles',
  'engineering-workflow',
  'ponytail-mindset',
  'gemini-precision',
  'context-os',
  'context-manager',
  'security',
];

describe('core/skills/ — skill source validation', () => {
  test('core/skills/ directory exists', () => {
    assert.ok(fs.existsSync(CORE_SKILLS_PATH), 'core/skills/ directory should exist');
  });

  test('all required skills are present', () => {
    const skills = fs.readdirSync(CORE_SKILLS_PATH);
    for (const required of REQUIRED_SKILLS) {
      assert.ok(
        skills.includes(required),
        `Required skill '${required}' is missing from core/skills/`
      );
    }
  });

  test('each skill directory contains SKILL.md', () => {
    const skills = fs.readdirSync(CORE_SKILLS_PATH);
    const missing = [];
    for (const skill of skills) {
      const skillPath = path.join(CORE_SKILLS_PATH, skill);
      if (!fs.statSync(skillPath).isDirectory()) continue;
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        missing.push(skill);
      }
    }
    assert.deepEqual(missing, [], `Skills missing SKILL.md: ${missing.join(', ')}`);
  });

  test('SKILL.md files are not empty (> 100 bytes)', () => {
    const skills = fs.readdirSync(CORE_SKILLS_PATH);
    for (const skill of skills) {
      const skillPath = path.join(CORE_SKILLS_PATH, skill);
      if (!fs.statSync(skillPath).isDirectory()) continue;
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const size = fs.statSync(skillMd).size;
      assert.ok(size > 100, `${skill}/SKILL.md is too small (${size} bytes) — may be empty`);
    }
  });

  test('SKILL.md files with frontmatter have valid YAML block', () => {
    const skills = fs.readdirSync(CORE_SKILLS_PATH);
    for (const skill of skills) {
      const skillPath = path.join(CORE_SKILLS_PATH, skill);
      if (!fs.statSync(skillPath).isDirectory()) continue;
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---')) continue;
      const closingIndex = content.indexOf('---', 3);
      assert.ok(
        closingIndex > 3,
        `${skill}/SKILL.md has unclosed YAML frontmatter block`
      );
    }
  });

  test('SKILL.md files with frontmatter contain required name and description fields', () => {
    const skills = fs.readdirSync(CORE_SKILLS_PATH);
    for (const skill of skills) {
      const skillPath = path.join(CORE_SKILLS_PATH, skill);
      if (!fs.statSync(skillPath).isDirectory()) continue;
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---')) continue;
      const frontmatterEnd = content.indexOf('---', 3);
      const frontmatter = content.slice(0, frontmatterEnd);
      assert.ok(
        frontmatter.includes('name:'),
        `${skill}/SKILL.md frontmatter missing 'name:' field`
      );
      assert.ok(
        frontmatter.includes('description:'),
        `${skill}/SKILL.md frontmatter missing 'description:' field`
      );
    }
  });

  test('skills.json is valid JSON', () => {
    const skillsJsonPath = path.join(__dirname, '..', '.agents', 'skills.json');
    assert.ok(fs.existsSync(skillsJsonPath), 'skills.json should exist');
    const raw = fs.readFileSync(skillsJsonPath, 'utf8');
    assert.doesNotThrow(
      () => JSON.parse(raw),
      'skills.json should be valid JSON'
    );
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.entries), 'skills.json should have an entries array');
    assert.ok(parsed.entries.length > 0, 'skills.json entries should not be empty');
  });
});
