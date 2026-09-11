/**
 * .agents/validate.js
 * ContextOS — Skill Validation & Sync Checker
 *
 * Checks:
 *   1. Frontmatter  — every SKILL.md with --- has name + description
 *   2. Stale        — generated files older than their source
 *   3. Orphans      — generated skills with no source counterpart
 *   4. Missing      — source skills never compiled
 *   5. Dependencies — requires: / conflicts: point to real skill IDs
 *   6. Conflicts    — a skill does not conflict with itself
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { collectAllSkillDirs } = require('./plugins.js');

const ROOT        = process.cwd();
const AGENTS_DIR  = path.join(ROOT, '.agents');
const CORE_SKILLS = path.join(AGENTS_DIR, 'core', 'skills');
const CORE_PROFILES = path.join(AGENTS_DIR, 'core', 'profiles');
const GENERATED   = path.join(AGENTS_DIR, 'generated');

// Adapters that compile to generated/<name>/skills/
const COMPILED_ADAPTERS = ['gemini', 'claude'];

// Well-known external frameworks/tools valid in conflicts/optional/profiles but not internal ContextOS skills
const EXTERNAL_NAMES = new Set([
  'vue', 'angular', 'svelte', 'remix', 'express', 'koa', 'hapi', 'sails',
  'tailwind', 'prisma', 'drizzle', 'mongoose', 'sequelize', 'typeorm',
  'next-auth', 'react-query', 'zustand', 'redux', 'mobx', 'jotai', 'valtio',
  'vitest', 'jest', 'mocha', 'cypress', 'playwright', 'storybook',
  'graphql', 'trpc', 'apollo', 'relay', 'urql',
  'sqlite', 'simple-auth', 'kubernetes', 'monitoring', 'cicd', 'cqrs',
  'redis', 'postgres', 'postgresql', 'jwt', 'auth'
]);

// ── Tiny ANSI helpers (no deps) ───────────────────────────────────────────────
const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const c = {
  red:    (s) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
  green:  (s) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
};

// ── Result accumulator ────────────────────────────────────────────────────────
const results = {
  errors:   [],  // must-fix problems
  warnings: [],  // stale / missing optional metadata
  info:     [],  // informational passes
};

function error(msg)   { results.errors.push(msg); }
function warn(msg)    { results.warnings.push(msg); }
function info(msg)    { results.info.push(msg); }

// ── Minimal YAML field extractor (no deps) ────────────────────────────────────
/**
 * Extracts top-level scalar YAML fields.
 * Supports both `field: value` and `field: >` (block scalar) patterns.
 * Returns null if field is absent.
 */
function yamlField(text, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const m  = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Extracts an inline YAML list: `field: [a, b, c]`
 * Returns [] if absent or empty.
 */
function yamlList(text, field) {
  const re = new RegExp(`^${field}:\\s*\\[([^\\]]*)]`, 'm');
  const m  = text.match(re);
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map(s => s.replace(/\s*#.*$/, '').trim()).filter(Boolean);
}

/**
 * Extracts a block YAML list:
 *   field:
 *     - item1
 *     - item2
 */
function yamlBlockList(text, field) {
  const re = new RegExp(`^${field}:\\s*\\n((?:[ \\t]+-[^\\n]*\\n?)+)`, 'm');
  const m  = text.match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map(l => l.replace(/^[ \t]+-\s*/, '').replace(/\s*#.*$/, '').trim())
    .filter(Boolean);
}

// ── Parse SKILL.md frontmatter ────────────────────────────────────────────────
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('---', 3);
  if (end === -1) return { raw: null, malformed: true };
  return { raw: content.slice(3, end), malformed: false };
}

// ── Parse skill.yaml ──────────────────────────────────────────────────────────
function parseSkillYaml(yamlText) {
  return {
    id:          yamlField(yamlText, 'id') || yamlField(yamlText, 'name'),
    name:        yamlField(yamlText, 'name'),
    description: yamlField(yamlText, 'description'),
    version:     yamlField(yamlText, 'version'),
    type:        yamlField(yamlText, 'type'),
    resources:   yamlList(yamlText, 'resources').concat(yamlBlockList(yamlText, 'resources')),
    requires:    yamlList(yamlText, 'requires').concat(yamlBlockList(yamlText, 'requires')),
    conflicts:   yamlList(yamlText, 'conflicts').concat(yamlBlockList(yamlText, 'conflicts')),
    optional:    yamlList(yamlText, 'optional').concat(yamlBlockList(yamlText, 'optional')),
  };
}

// ── Collect all source skills ─────────────────────────────────────────────────
function collectSourceSkills() {
  const skills = {};
  if (!fs.existsSync(CORE_SKILLS)) return skills;

  for (const dir of collectAllSkillDirs()) {
    const name = path.basename(dir);

    const skillMdPath = path.join(dir, 'SKILL.md');
    const yamlPath    = path.join(dir, 'skill.yaml');

    skills[name] = {
      name,
      dir,
      skillMdPath,
      yamlPath,
      hasSkillMd: fs.existsSync(skillMdPath),
      hasYaml:    fs.existsSync(yamlPath),
      mtime:      fs.existsSync(skillMdPath)
        ? fs.statSync(skillMdPath).mtimeMs
        : (fs.existsSync(yamlPath) ? fs.statSync(yamlPath).mtimeMs : 0),
    };
  }
  return skills;
}

// ── Collect generated skills per adapter ─────────────────────────────────────
function collectGenerated(adapter) {
  const base = path.join(GENERATED, adapter, 'skills');
  if (!fs.existsSync(base)) return {};
  const out = {};
  for (const name of fs.readdirSync(base)) {
    const dir      = path.join(base, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const skillMd  = path.join(dir, 'SKILL.md');
    out[name] = {
      mtime: fs.existsSync(skillMd) ? fs.statSync(skillMd).mtimeMs : 0,
    };
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 1 — SKILL.md Frontmatter Validation
// ═════════════════════════════════════════════════════════════════════════════
function checkFrontmatter(sourceSkills) {
  let pass = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasSkillMd) continue;

    const content = fs.readFileSync(skill.skillMdPath, 'utf8');
    const fm      = parseFrontmatter(content);

    if (!fm) {
      // No frontmatter — only a warning if it also has no skill.yaml
      if (!skill.hasYaml) {
        warn(`[frontmatter] ${name}/SKILL.md — no frontmatter and no skill.yaml`);
      }
      continue;
    }

    if (fm.malformed) {
      error(`[frontmatter] ${name}/SKILL.md — unclosed YAML frontmatter (missing closing ---)`);
      continue;
    }

    if (!fm.raw.match(/^name:\s*.+/m)) {
      error(`[frontmatter] ${name}/SKILL.md — frontmatter missing required 'name:' field`);
    }
    if (!fm.raw.match(/^description:/m)) {
      error(`[frontmatter] ${name}/SKILL.md — frontmatter missing required 'description:' field`);
    }

    pass++;
  }

  info(`[frontmatter] ${pass} SKILL.md files with valid frontmatter`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 2 — skill.yaml Validation
// ═════════════════════════════════════════════════════════════════════════════
function checkSkillYaml(sourceSkills) {
  let pass = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasYaml) continue;

    const text   = fs.readFileSync(skill.yamlPath, 'utf8');
    const parsed = parseSkillYaml(text);

    if (!parsed.name) {
      error(`[yaml] ${name}/skill.yaml — missing 'name:' field`);
      continue;
    }
    const VALID_TYPES = new Set(['instruction-only', 'compiler', 'runtime', 'experimental']);
    if (!parsed.type) {
      error(`[yaml] ${name}/skill.yaml — missing 'type:' field (expected instruction-only | compiler | runtime | experimental)`);
    } else if (!VALID_TYPES.has(parsed.type)) {
      error(`[yaml] ${name}/skill.yaml — invalid type '${parsed.type}' (expected instruction-only | compiler | runtime | experimental)`);
    }
    if (false && !parsed.description) {
      // Some skills use block scalars — allow it, just warn
      warn(`[yaml] ${name}/skill.yaml — 'description:' not found or uses multiline block (check manually)`);
    }
    pass++;
  }

  info(`[yaml] ${pass} skill.yaml files validated`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 3 — Stale Generated Files
// ═════════════════════════════════════════════════════════════════════════════
function checkStale(sourceSkills) {
  let staleCount = 0;

  for (const adapter of COMPILED_ADAPTERS) {
    const generated = collectGenerated(adapter);

    for (const [name, gen] of Object.entries(generated)) {
      const src = sourceSkills[name];
      if (!src) continue; // orphan — handled in CHECK 4

      if (src.mtime > gen.mtime + 1000) { // +1s tolerance
        warn(`[stale] ${adapter}/${name} — source is newer than compiled output (run: node .agents/ctx.js export ${adapter})`);
        staleCount++;
      }
    }
  }

  if (staleCount === 0) {
    info('[stale] All compiled skills are up-to-date');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 4 — Orphan & Missing Skills
// ═════════════════════════════════════════════════════════════════════════════
function checkSync(sourceSkills) {
  for (const adapter of COMPILED_ADAPTERS) {
    const generated = collectGenerated(adapter);
    const genNames  = new Set(Object.keys(generated));
    const srcNames  = new Set(Object.keys(sourceSkills).filter(n => sourceSkills[n].hasSkillMd));

    // Orphans: compiled but no longer in source
    for (const name of genNames) {
      if (!srcNames.has(name)) {
        warn(`[orphan] generated/${adapter}/${name} — no source skill found (deleted? renamed?)`);
      }
    }

    // Missing: source skill never compiled to this adapter
    const missing = [];
    for (const name of srcNames) {
      if (!genNames.has(name)) missing.push(name);
    }
    if (missing.length > 0) {
      warn(`[missing] ${adapter} — ${missing.length} source skills not compiled: ${missing.join(', ')}`);
      warn(`          Run: node .agents/ctx.js export ${adapter}`);
    } else {
      info(`[sync] ${adapter} — all source skills compiled`);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 5 — Dependency Graph (requires: / conflicts:)
// ═════════════════════════════════════════════════════════════════════════════
function checkDependencies(sourceSkills) {
  // knownIds = every directory name in core/skills/ plus any `id:` declared in skill.yaml
  const knownIds = new Set();
  for (const [name, skill] of Object.entries(sourceSkills)) {
    knownIds.add(name); // directory name is always a valid reference
    if (skill.hasYaml) {
      const text = fs.readFileSync(skill.yamlPath, 'utf8');
      const id   = yamlField(text, 'id');
      if (id) knownIds.add(id);
    }
  }

  let depChecked = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasYaml) continue;

    const text   = fs.readFileSync(skill.yamlPath, 'utf8');
    const parsed = parseSkillYaml(text);

    // requires: — must point to a known internal skill
    for (const dep of parsed.requires) {
      if (EXTERNAL_NAMES.has(dep)) continue; // external — allowed
      if (!knownIds.has(dep)) {
        error(`[deps] ${name}/skill.yaml — requires: '${dep}' does not match any known skill`);
      }
    }

    // conflicts: — must point to a known internal skill OR be an external name
    for (const dep of parsed.conflicts) {
      if (EXTERNAL_NAMES.has(dep)) continue; // external framework conflict — valid
      if (dep === name || dep === parsed.id) {
        error(`[deps] ${name}/skill.yaml — conflicts with itself ('${dep}')`);
      } else if (!knownIds.has(dep)) {
        // Only flag as error if the name looks internal (no dots, short, matches slug pattern)
        const looksInternal = /^[a-z][a-z0-9-]{0,40}$/.test(dep);
        if (looksInternal) {
          error(`[deps] ${name}/skill.yaml — conflicts: '${dep}' does not match any known skill`);
        }
      }
    }

    depChecked++;
  }

  info(`[deps] ${depChecked} skill.yaml dependency graphs validated`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 6 — Minimum Content Quality
// ═════════════════════════════════════════════════════════════════════════════
function checkContentQuality(sourceSkills) {
  const MIN_BYTES = 100;
  let pass = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasSkillMd) {
      if (!skill.hasYaml && name !== 'profiles') {
        warn(`[content] ${name} — no SKILL.md and no skill.yaml (empty placeholder?)`);
      }
      continue;
    }

    const size = fs.statSync(skill.skillMdPath).size;
    if (size < MIN_BYTES) {
      warn(`[content] ${name}/SKILL.md is only ${size} bytes — may be incomplete`);
    } else {
      pass++;
    }
  }

  info(`[content] ${pass} SKILL.md files meet minimum size requirement (≥${MIN_BYTES}B)`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 7 — COSTAR Structure
// ═════════════════════════════════════════════════════════════════════════════
function checkCostarHeaders(sourceSkills) {
  let pass = 0;
  const requiredHeaders = [
    '## Overview',
    '## When to Use',
    '## Rules & Patterns',
    '## Code Examples',
    '## Validation Checklist',
    '## Common Mistakes',
    '## Integration Notes'
  ];

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasSkillMd) continue;

    const content = fs.readFileSync(skill.skillMdPath, 'utf8');
    let missing = [];
    for (const header of requiredHeaders) {
      if (!content.includes(header)) missing.push(header);
    }
    
    if (missing.length > 0) {
      warn(`[costar] ${name}/SKILL.md is missing required headers: ${missing.join(', ')}`);
    } else {
      pass++;
    }
  }
  
  info(`[costar] ${pass} SKILL.md files follow the COSTAR template`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 8 — VALIDATION.json
// ═════════════════════════════════════════════════════════════════════════════
function checkValidationJson(sourceSkills) {
  let pass = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    const valPath = path.join(skill.dir, 'VALIDATION.json');
    if (!fs.existsSync(valPath)) {
      warn(`[validation] ${name}/VALIDATION.json is missing`);
      continue;
    }

    try {
      JSON.parse(fs.readFileSync(valPath, 'utf8'));
      pass++;
    } catch (e) {
      error(`[validation] ${name}/VALIDATION.json is invalid JSON: ${e.message}`);
    }
  }

  info(`[validation] ${pass} VALIDATION.json files are valid`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 9 — MCP Bundle Synchronization
// ═════════════════════════════════════════════════════════════════════════════
function checkMcpBundleSync() {
  const mcpSrcDir = path.join(ROOT, 'contextos-mcp', 'src');
  const bundlePath = path.join(AGENTS_DIR, 'mcp', 'server.mjs');

  if (!fs.existsSync(mcpSrcDir)) {
    return;
  }

  if (!fs.existsSync(bundlePath)) {
    warn(`[mcp-sync] Missing compiled MCP server bundle at .agents/mcp/server.mjs. Run: cd contextos-mcp && npm run build:bundle`);
    return;
  }

  const bundleStat = fs.statSync(bundlePath);
  const bundleMtime = bundleStat.mtimeMs;

  let newestSrcFile = null;
  let newestSrcMtime = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > newestSrcMtime) {
          newestSrcMtime = stat.mtimeMs;
          newestSrcFile = path.relative(ROOT, full);
        }
      }
    }
  }

  walk(mcpSrcDir);

  if (newestSrcMtime > bundleMtime) {
    warn(`[mcp-sync] Compiled MCP bundle (.agents/mcp/server.mjs) is older than source file ${newestSrcFile}. Run: cd contextos-mcp && npm run build:bundle`);
  } else {
    info(`[mcp-sync] Compiled MCP bundle (.agents/mcp/server.mjs) is up to date with contextos-mcp/src/`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 10 — Resources Manifest Integrity
// ═════════════════════════════════════════════════════════════════════════════
function checkResourcesManifest(sourceSkills) {
  let totalResources = 0;
  let skillsWithResources = 0;

  for (const [name, skill] of Object.entries(sourceSkills)) {
    if (!skill.hasYaml) continue;

    const text   = fs.readFileSync(skill.yamlPath, 'utf8');
    const parsed = parseSkillYaml(text);

    if (!parsed.resources || parsed.resources.length === 0) {
      warn(`[resources] ${name}/skill.yaml — no resource files declared in manifest`);
      continue;
    }

    skillsWithResources++;
    for (const res of parsed.resources) {
      const fullPath = path.join(skill.dir, res);
      if (!fs.existsSync(fullPath)) {
        error(`[resources] ${name}/skill.yaml — declared resource not found on disk: '${res}'`);
      } else {
        totalResources++;
      }
    }
  }

  info(`[resources] ${totalResources} resource files verified across ${skillsWithResources} skills`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 11 — Profiles Integrity
// ═════════════════════════════════════════════════════════════════════════════
function checkProfilesIntegrity(sourceSkills) {
  if (!fs.existsSync(CORE_PROFILES)) return;

  const knownIds = new Set();
  for (const [name, skill] of Object.entries(sourceSkills)) {
    knownIds.add(name);
    if (skill.hasYaml) {
      const text = fs.readFileSync(skill.yamlPath, 'utf8');
      const id   = yamlField(text, 'id');
      if (id) knownIds.add(id);
    }
  }

  let profilesValidated = 0;
  const files = fs.readdirSync(CORE_PROFILES).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const profiles = require('./profiles.js');
  const mockRegistry = { skills: Object.fromEntries(Array.from(knownIds).map(id => [id, true])) };

  for (const file of files) {
    const filePath = path.join(CORE_PROFILES, file);
    const text = fs.readFileSync(filePath, 'utf8');

    try {
      const parsed = profiles.parseYamlProfile(text);
      profiles.validateProfile(parsed, mockRegistry);
    } catch (err) {
      error(`[profiles] ${file} — validation failed: ${err.message}`);
    }

    const referenced = [
      ...yamlList(text, 'skills'),
      ...yamlBlockList(text, 'skills'),
      ...yamlList(text, 'prefer_skills'),
      ...yamlBlockList(text, 'prefer_skills'),
      ...yamlList(text, 'exclude_skills'),
      ...yamlBlockList(text, 'exclude_skills'),
    ];

    for (const skillName of referenced) {
      if (!knownIds.has(skillName) && !EXTERNAL_NAMES.has(skillName)) {
        error(`[profiles] ${file} — references unknown skill '${skillName}'`);
      }
    }
    profilesValidated++;
  }

  info(`[profiles] ${profilesValidated} core profiles validated against skill registry`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  REPORT
// ═════════════════════════════════════════════════════════════════════════════
function printReport() {
  const { errors, warnings, info: infos } = results;

  console.log('');
  console.log(c.bold('══════════════════════════════════════════'));
  console.log(c.bold('  ContextOS — Skill Validation Report'));
  console.log(c.bold('══════════════════════════════════════════'));
  console.log('');

  // Info (passes)
  for (const msg of infos) {
    console.log(`  ${c.green('✓')} ${c.dim(msg)}`);
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('');
    console.log(c.bold(c.yellow(`  ⚠  ${warnings.length} warning(s):`)));
    for (const msg of warnings) {
      console.log(`  ${c.yellow('▲')} ${msg}`);
    }
  }

  // Errors
  if (errors.length > 0) {
    console.log('');
    console.log(c.bold(c.red(`  ✗  ${errors.length} error(s):`)));
    for (const msg of errors) {
      console.log(`  ${c.red('✗')} ${msg}`);
    }
  }

  console.log('');
  console.log(c.bold('──────────────────────────────────────────'));

  const status = errors.length === 0
    ? c.green(c.bold('  ✓ PASSED'))
    : c.red(c.bold('  ✗ FAILED'));

  console.log(`  ${status}  ${c.bold(String(errors.length))} error(s)  ${c.bold(String(warnings.length))} warning(s)`);
  console.log(c.bold('──────────────────────────────────────────'));
  console.log('');

  return errors.length === 0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CHECK 12 — Compiled Registry v2 Validation
// ═════════════════════════════════════════════════════════════════════════════
function checkRegistryV2() {
  const { ManifestCompiler } = require('./compiler/manifest-compiler.js');
  const compiler = new ManifestCompiler();
  const res = compiler.compile();

  if (!res.success) {
    for (const d of res.diagnostics) {
      error(`[registry-v2] ${d.file}: ${d.message} (${d.code})`);
    }
    return;
  }

  const compiledFile = path.join(AGENTS_DIR, 'compiled', 'registry.v2.json');
  if (!fs.existsSync(compiledFile)) {
    warn('[registry-v2] .agents/compiled/registry.v2.json does not exist (run: node .agents/ctx.js compile)');
    return;
  }

  try {
    const onDisk = JSON.parse(fs.readFileSync(compiledFile, 'utf8'));
    if (onDisk.sourceGraphHash !== res.registry.sourceGraphHash) {
      warn('[registry-v2] Compiled registry is stale (hash mismatch, run: node .agents/ctx.js compile)');
    } else {
      info(`[registry-v2] Compiled registry v2 verified (${Object.keys(res.registry.skills).length} skills, hash ${res.registry.sourceGraphHash.slice(0, 20)}...)`);
    }
  } catch (err) {
    error(`[registry-v2] Corrupt registry.v2.json: ${err.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════
function run() {
  console.log(c.cyan('\nContextOS Validator — scanning skills...\n'));

  if (!fs.existsSync(CORE_SKILLS)) {
    console.error(c.red('[ERROR] .agents/core/skills/ not found. Run from your project root.'));
    process.exit(1);
  }

  const sourceSkills = collectSourceSkills();
  const total        = Object.keys(sourceSkills).length;
  console.log(c.dim(`  Source: ${AGENTS_DIR} (core + plugins)`));
  console.log(c.dim(`  Skills found: ${total}\n`));

  checkFrontmatter(sourceSkills);
  checkSkillYaml(sourceSkills);
  checkStale(sourceSkills);
  checkSync(sourceSkills);
  checkDependencies(sourceSkills);
  checkContentQuality(sourceSkills);
  checkCostarHeaders(sourceSkills);
  checkValidationJson(sourceSkills);
  // checkMcpBundleSync();
  checkResourcesManifest(sourceSkills);
  checkProfilesIntegrity(sourceSkills);
  checkRegistryV2();

  const passed = printReport();
  process.exit(passed ? 0 : 1);
}

module.exports = { run };

// Allow direct execution: node .agents/validate.js
if (require.main === module) {
  run();
}
