/**
 * .agents/compiler/manifest-compiler.js
 * ContextOS — Manifest Compiler & Registry v2 Generator
 *
 * Compiles skill manifests (v1 and v2) into a unified, deterministic,
 * cryptographically verified registry (registry.v2.json) with:
 *   - Strict schema validation (fail-closed, additionalProperties: false)
 *   - Frontmatter parity enforcement between SKILL.md and manifest
 *   - Dependency closure, cycle detection, self-dependency and conflict validation
 *   - Resource tree verification & path traversal / symlink escape guards
 *   - SHA-256 content hashing (entrypointHash, resourceTreeHash, sourceGraphHash)
 *   - Standardized error contracts & SARIF 2.1.0 reporting
 *   - Zero install-time runtime dependencies (pure Node.js)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Standard error codes for manifest diagnostics
const CODES = {
  PARSE_ERROR: 'CTX_MANIFEST_PARSE_ERROR',
  SCHEMA_ERROR: 'CTX_MANIFEST_SCHEMA_ERROR',
  UNKNOWN_DEPENDENCY: 'CTX_MANIFEST_UNKNOWN_DEPENDENCY',
  CYCLE_DETECTED: 'CTX_MANIFEST_CYCLE_DETECTED',
  SELF_DEPENDENCY: 'CTX_MANIFEST_SELF_DEPENDENCY',
  CONFLICT_VIOLATION: 'CTX_MANIFEST_CONFLICT_VIOLATION',
  FRONTMATTER_MISMATCH: 'CTX_MANIFEST_FRONTMATTER_MISMATCH',
  MISSING_ENTRYPOINT: 'CTX_MANIFEST_MISSING_ENTRYPOINT',
  MISSING_RESOURCE: 'CTX_MANIFEST_MISSING_RESOURCE',
  INVALID_PATH: 'CTX_MANIFEST_INVALID_PATH',
  DUPLICATE_ID: 'CTX_MANIFEST_DUPLICATE_ID',
  DUPLICATE_ALIAS: 'CTX_MANIFEST_DUPLICATE_ALIAS',
  MISSING_RULE_CHECKER: 'CTX_MANIFEST_MISSING_RULE_CHECKER',
  INVALID_RULE: 'CTX_MANIFEST_INVALID_RULE',
};

// Default signals by skill ID (extracted from canonical resolver patterns for v1 backward compatibility)
const DEFAULT_SIGNALS = {
  nextjs: {
    aliases: ['next', 'next.js', 'nextjs'],
    keywords: [
      { value: 'next', weight: 40 },
      { value: 'next.js', weight: 40 },
      { value: 'app router', weight: 35 },
      { value: 'server actions', weight: 30 },
      { value: 'rsc', weight: 30 },
      { value: 'некст', locale: 'ru', weight: 35 },
    ],
    fileGlobs: [
      { value: 'app/**/*.{tsx,jsx,ts,js}', weight: 30 },
      { value: '**/next.config.{js,mjs,ts}', weight: 35 },
    ],
    packages: [{ ecosystem: 'npm', name: 'next', weight: 35 }],
  },
  react: {
    aliases: ['react', 'reactjs'],
    keywords: [
      { value: 'react', weight: 40 },
      { value: 'useOptimistic', weight: 30 },
      { value: 'component', weight: 20 },
      { value: 'hooks', weight: 25 },
      { value: 'компонент', locale: 'ru', weight: 30 },
      { value: 'хук', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [{ value: '**/*.{tsx,jsx}', weight: 25 }],
    packages: [{ ecosystem: 'npm', name: 'react', weight: 35 }],
  },
  typescript: {
    aliases: ['ts', 'typescript'],
    keywords: [
      { value: 'typescript', weight: 40 },
      { value: 'type-safe', weight: 30 },
      { value: 'generics', weight: 25 },
      { value: 'tsconfig', weight: 30 },
      { value: 'тайпскрипт', locale: 'ru', weight: 35 },
      { value: 'типизац', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/*.tsx?', weight: 20 },
      { value: '**/tsconfig.json', weight: 35 },
    ],
    packages: [{ ecosystem: 'npm', name: 'typescript', weight: 35 }],
  },
  security: {
    aliases: ['sec', 'auth', 'security'],
    keywords: [
      { value: 'security', weight: 40 },
      { value: 'auth', weight: 35 },
      { value: 'jwt', weight: 30 },
      { value: 'csrf', weight: 30 },
      { value: 'xss', weight: 30 },
      { value: 'безопасност', locale: 'ru', weight: 35 },
      { value: 'авториз', locale: 'ru', weight: 30 },
      { value: 'парол', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/*auth*', weight: 25 },
      { value: '**/*security*', weight: 25 },
    ],
    packages: [],
  },
  database: {
    aliases: ['db', 'database', 'sql'],
    keywords: [
      { value: 'database', weight: 40 },
      { value: 'sql', weight: 35 },
      { value: 'postgres', weight: 35 },
      { value: 'prisma', weight: 35 },
      { value: 'drizzle', weight: 35 },
      { value: 'migration', weight: 30 },
      { value: 'баз.*данн', locale: 'ru', weight: 35 },
      { value: 'миграц', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/*.prisma', weight: 35 },
      { value: '**/drizzle.config.*', weight: 35 },
      { value: '**/migrations/**/*.sql', weight: 30 },
    ],
    packages: [
      { ecosystem: 'npm', name: 'prisma', weight: 30 },
      { ecosystem: 'npm', name: 'drizzle-orm', weight: 30 },
    ],
  },
  testing: {
    aliases: ['test', 'tests', 'testing'],
    keywords: [
      { value: 'vitest', weight: 40 },
      { value: 'jest', weight: 40 },
      { value: 'playwright', weight: 40 },
      { value: 'tdd', weight: 35 },
      { value: 'bdd', weight: 30 },
      { value: 'тестирован', locale: 'ru', weight: 35 },
      { value: 'юнит', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/*.{test,spec}.{ts,js,tsx,jsx}', weight: 35 },
      { value: '**/vitest.config.*', weight: 35 },
      { value: '**/playwright.config.*', weight: 35 },
    ],
    packages: [],
  },
  'ui-ux-pro': {
    aliases: ['ui', 'ux', 'ui-ux'],
    keywords: [
      { value: 'ui', weight: 35 },
      { value: 'ux', weight: 35 },
      { value: 'tailwind', weight: 35 },
      { value: 'styling', weight: 30 },
      { value: 'дизайн', locale: 'ru', weight: 35 },
      { value: 'интерфейс', locale: 'ru', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/*.{css,scss,sass}', weight: 25 },
      { value: '**/tailwind.config.*', weight: 35 },
    ],
    packages: [{ ecosystem: 'npm', name: 'tailwindcss', weight: 30 }],
  },
  node: {
    aliases: ['nodejs', 'node'],
    keywords: [
      { value: 'node', weight: 35 },
      { value: 'nodejs', weight: 35 },
      { value: 'express', weight: 30 },
      { value: 'fastify', weight: 30 },
    ],
    fileGlobs: [{ value: '**/package.json', weight: 15 }],
    packages: [],
  },
  fastapi: {
    aliases: ['fastapi'],
    keywords: [
      { value: 'fastapi', weight: 45 },
      { value: 'pydantic', weight: 35 },
      { value: 'uvicorn', weight: 30 },
    ],
    fileGlobs: [
      { value: '**/main.py', weight: 20 },
      { value: '**/requirements.txt', weight: 15 },
    ],
    packages: [{ ecosystem: 'pypi', name: 'fastapi', weight: 40 }],
  },
  nestjs: {
    aliases: ['nestjs', 'nest'],
    keywords: [
      { value: 'nestjs', weight: 45 },
      { value: 'nest.js', weight: 40 },
      { value: 'injectable', weight: 25 },
    ],
    fileGlobs: [{ value: '**/nest-cli.json', weight: 40 }],
    packages: [{ ecosystem: 'npm', name: '@nestjs/core', weight: 40 }],
  },
  docker: {
    aliases: ['docker'],
    keywords: [
      { value: 'docker', weight: 45 },
      { value: 'dockerfile', weight: 45 },
      { value: 'compose', weight: 30 },
      { value: 'докер', locale: 'ru', weight: 40 },
      { value: 'container', weight: 5 },
      { value: 'контейнер', locale: 'ru', weight: 5 },
    ],
    fileGlobs: [
      { value: '**/Dockerfile*', weight: 40 },
      { value: '**/docker-compose*.yml', weight: 40 },
    ],
    packages: [],
  },
};

/**
 * Diagnostic error object.
 */
class DiagnosticError extends Error {
  /**
   * @param {Object} diag - Diagnostic payload
   */
  constructor(diag) {
    super(diag.message);
    this.name = 'DiagnosticError';
    this.diag = diag;
  }
}

const yaml = require('./vendor/yaml.js');

/**
 * Robust zero-dep YAML parser for skill manifests.
 * Handles scalars, inline arrays, block lists, nested maps, and quoted multiline strings.
 */
function parseYaml(yamlText) {
  if (typeof yamlText !== 'string' || !yamlText.trim()) return {};
  const doc = yaml.parseDocument(yamlText, { merge: true, strict: true, uniqueKeys: true });
  if (doc.errors && doc.errors.length > 0) {
    throw new DiagnosticError({
      message: `YAML Parse Error: ${doc.errors[0].message}`,
      code: CODES.PARSE_ERROR
    });
  }
  return doc.toJS() || {};
}

/**
 * ManifestCompiler class.
 */
class ManifestCompiler {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.agentsDir = options.agentsDir || path.join(this.rootDir, '.agents');
    this.coreSkillsDir = options.coreSkillsDir || path.join(this.agentsDir, 'core', 'skills');
    this.compiledDir = options.compiledDir || path.join(this.agentsDir, 'compiled');
    this.diagnostics = [];
  }

  addDiagnostic(code, message, options = {}) {
    const diag = {
      code,
      severity: options.severity || 'error',
      component: 'manifest-compiler',
      file: options.file || '',
      path: options.path || '',
      line: options.line,
      column: options.column,
      message,
      remediation: options.remediation || 'Correct the manifest according to the schema specification.',
    };
    this.diagnostics.push(diag);
    return diag;
  }

  /**
   * Reads and parses frontmatter from a markdown file.
   */
  readFrontmatter(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.startsWith('---')) return null;
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) return { malformed: true };
    const rawYaml = content.slice(3, endIdx).trim();
    const parsed = parseYaml(rawYaml);
    return {
      raw: rawYaml,
      parsed,
      contentWithoutFrontmatter: content.slice(endIdx + 3).trim(),
    };
  }

  /**
   * Normalizes a v1 or v2 manifest into canonical SkillManifestV2 format.
   */
  normalizeManifest(skillDir, rawYamlText) {
    const parsed = parseYaml(rawYamlText);
    const skillId = parsed.id || parsed.name || path.basename(skillDir);
    const displayName = parsed.displayName || parsed.name || skillId;
    const isV2 = parsed.schemaVersion === 2;

    const entrypoint = parsed.entrypoint || 'SKILL.md';
    const version = parsed.version ? String(parsed.version) : '1.0.0';
    const description = parsed.description || `ContextOS skill for ${displayName}`;
    const type = parsed.type || 'instruction-only';
    const category = parsed.category || 'general';

    // Normalizing dependencies
    const requires = Array.isArray(parsed.dependencies?.requires)
      ? parsed.dependencies.requires
      : (Array.isArray(parsed.requires) ? parsed.requires : []);
    const optional = Array.isArray(parsed.dependencies?.optional)
      ? parsed.dependencies.optional
      : (Array.isArray(parsed.optional) ? parsed.optional : []);
    const conflicts = Array.isArray(parsed.dependencies?.conflicts)
      ? parsed.dependencies.conflicts
      : (Array.isArray(parsed.conflicts) ? parsed.conflicts : []);

    // Read SKILL.md frontmatter name if present to ensure alias parity
    const discoveredAliases = [];
    const entrypointFile = path.join(skillDir, entrypoint);
    if (fs.existsSync(entrypointFile)) {
      const fm = this.readFrontmatter(entrypointFile);
      if (fm && fm.parsed && fm.parsed.name) {
        const fmSlug = String(fm.parsed.name).trim().toLowerCase().replace(/\s+/g, '-');
        discoveredAliases.push(fmSlug);
      }
    }

    // Normalizing signals (merge provided signals with default signals for known skills)
    const defaults = DEFAULT_SIGNALS[skillId] || {};
    const signals = {
      aliases: Array.from(new Set([
        ...(parsed.signals?.aliases || []),
        ...(defaults.aliases || []),
        ...discoveredAliases,
        skillId
      ])),
      keywords: parsed.signals?.keywords || defaults.keywords || [],
      fileGlobs: parsed.signals?.fileGlobs || defaults.fileGlobs || [],
      packages: parsed.signals?.packages || defaults.packages || [],
    };

    // Normalizing context
    const priority = parsed.context?.priority !== undefined
      ? parsed.context.priority
      : (parsed.weight !== undefined ? parsed.weight * 10 : 50);

    // Normalizing resources
    let resources = [];
    if (Array.isArray(parsed.resources)) {
      resources = parsed.resources.map(r => {
        if (typeof r === 'string') return { path: r, mode: 'on-demand' };
        return { path: r.path, mode: r.mode || 'on-demand' };
      });
    }

    const deprecated = Boolean(parsed.deprecated);
    const canonical = typeof parsed.canonical === 'string' ? parsed.canonical : null;
    const rules = Array.isArray(parsed.rules) ? parsed.rules : [];

    return {
      schemaVersion: 2,
      id: skillId,
      displayName,
      version,
      description,
      type,
      category,
      entrypoint,
      signals,
      dependencies: {
        requires: Array.from(new Set(requires)),
        optional: Array.from(new Set(optional)),
        conflicts: Array.from(new Set(conflicts)),
      },
      context: {
        priority,
        estimatedTokens: 0, // Calculated during compilation
      },
      resources,
      deprecated,
      canonical,
      rules,
      _raw: parsed,
      _isV2: isV2,
    };
  }

  /**
   * Validates a single manifest against strict security, schema and filesystem rules.
   */
  validateSingleManifest(skillDir, manifest, manifestFile) {
    const relManifestPath = path.relative(this.rootDir, manifestFile);

    // 0. Strict Schema Validation (additionalProperties: false)
    const allowedKeys = new Set([
      'schemaVersion', 'id', 'name', 'displayName', 'entrypoint', 'version', 
      'description', 'type', 'category', 'dependencies', 'requires', 'optional', 
      'conflicts', 'signals', 'context', 'weight', 'resources', 'deprecated', 
      'canonical', 'rules'
    ]);
    if (manifest._raw) {
      for (const key of Object.keys(manifest._raw)) {
        if (!allowedKeys.has(key)) {
          this.addDiagnostic(
            CODES.SCHEMA_ERROR,
            `Strict Schema Validation Failed: Unknown property '${key}' is not allowed in schemaVersion 2.`,
            { file: relManifestPath, path: `/${key}` }
          );
        }
      }
    }

    // 1. Check ID format
    if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
      this.addDiagnostic(
        CODES.SCHEMA_ERROR,
        `Invalid skill id '${manifest.id}'. Must contain only lowercase alphanumeric characters and hyphens.`,
        { file: relManifestPath, path: '/id' }
      );
    }

    // 2. Check entrypoint on disk
    if (manifest.entrypoint.includes('..') || manifest.entrypoint.startsWith('/') || manifest.entrypoint.startsWith('\\') || manifest.entrypoint.includes('\0')) {
      this.addDiagnostic(
        CODES.INVALID_PATH,
        `Entrypoint path '${manifest.entrypoint}' contains invalid characters or directory traversal.`,
        { file: relManifestPath, path: '/entrypoint' }
      );
    } else {
      const fullEntrypoint = path.join(skillDir, manifest.entrypoint);
      if (!fs.existsSync(fullEntrypoint)) {
        this.addDiagnostic(
          CODES.MISSING_ENTRYPOINT,
          `Required entrypoint file '${manifest.entrypoint}' does not exist on disk.`,
          { file: relManifestPath, path: '/entrypoint', remediation: `Create ${manifest.entrypoint} in ${path.relative(this.rootDir, skillDir)}` }
        );
      }
    }

    // 3. Frontmatter parity check with SKILL.md
    const skillMdPath = path.join(skillDir, manifest.entrypoint);
    if (fs.existsSync(skillMdPath)) {
      const fm = this.readFrontmatter(skillMdPath);
      if (fm && fm.parsed && fm.parsed.name) {
        const fmName = String(fm.parsed.name).trim().toLowerCase();
        const idMatches = manifest.id.toLowerCase() === fmName;
        const displayNameMatches = manifest.displayName.toLowerCase() === fmName;
        const aliasMatches = manifest.signals && Array.isArray(manifest.signals.aliases)
          ? manifest.signals.aliases.some(a => a.toLowerCase() === fmName || a.toLowerCase() === fmName.replace(/\s+/g, '-'))
          : false;

        if (!idMatches && !displayNameMatches && !aliasMatches) {
          this.addDiagnostic(
            CODES.FRONTMATTER_MISMATCH,
            `Frontmatter name '${fm.parsed.name}' in ${manifest.entrypoint} does not match manifest id '${manifest.id}', displayName '${manifest.displayName}', or registered aliases.`,
            { file: relManifestPath, path: '/displayName', remediation: `Update ${manifest.entrypoint} frontmatter name to match manifest displayName '${manifest.displayName}' or add '${fm.parsed.name}' to aliases.` }
          );
        }
      }
    }

    // 4. Resource paths validation
    const realSkillDir = fs.realpathSync(skillDir);
    for (let i = 0; i < manifest.resources.length; i++) {
      const res = manifest.resources[i];
      const resPath = res.path;
      if (!resPath || resPath.includes('..') || path.isAbsolute(resPath) || resPath.includes('\0')) {
        this.addDiagnostic(
          CODES.INVALID_PATH,
          `Resource path '${resPath}' is invalid or attempts path traversal.`,
          { file: relManifestPath, path: `/resources/${i}/path` }
        );
        continue;
      }

      const fullResPath = path.join(skillDir, resPath);
      if (!fs.existsSync(fullResPath)) {
        this.addDiagnostic(
          CODES.MISSING_RESOURCE,
          `Resource file '${resPath}' listed in manifest does not exist.`,
          { file: relManifestPath, path: `/resources/${i}/path`, remediation: `Create the file or remove it from resources.` }
        );
      } else {
        // Symlink escape check
        const realResPath = fs.realpathSync(fullResPath);
        if (!realResPath.startsWith(realSkillDir)) {
          this.addDiagnostic(
            CODES.INVALID_PATH,
            `Resource file '${resPath}' resolves outside skill directory (symlink escape).`,
            { file: relManifestPath, path: `/resources/${i}/path` }
          );
        }
      }
    }

    // 5. Check self-dependency
    if (manifest.dependencies.requires.includes(manifest.id)) {
      this.addDiagnostic(
        CODES.SELF_DEPENDENCY,
        `Skill '${manifest.id}' cannot require itself.`,
        { file: relManifestPath, path: '/dependencies/requires' }
      );
    }

    // 6. Validate declared rules and checkers
    if (Array.isArray(manifest.rules)) {
      const { AUTOMATED_CHECKERS } = require('../rules/rule-catalog.js');
      for (let i = 0; i < manifest.rules.length; i++) {
        const rule = manifest.rules[i];
        if (!rule.id || !/^[A-Z0-9_-]+$/.test(rule.id)) {
          this.addDiagnostic(
            CODES.SCHEMA_ERROR,
            `Rule [${i}] in '${manifest.id}' has invalid ID '${rule.id}'. Must match pattern ^[A-Z0-9_-]+$.`,
            { file: relManifestPath, path: `/rules/${i}/id` }
          );
        }
        if (!['must', 'should', 'may'].includes(rule.level)) {
          this.addDiagnostic(
            CODES.SCHEMA_ERROR,
            `Rule '${rule.id}' has invalid level '${rule.level}'. Must be 'must', 'should', or 'may'.`,
            { file: relManifestPath, path: `/rules/${i}/level` }
          );
        }
        if (!['runtime', 'linter', 'prompt-guidance', 'reference', 'example'].includes(rule.enforcement)) {
          this.addDiagnostic(
            CODES.SCHEMA_ERROR,
            `Rule '${rule.id}' has invalid enforcement '${rule.enforcement}'.`,
            { file: relManifestPath, path: `/rules/${i}/enforcement` }
          );
        }
        if (['runtime', 'linter'].includes(rule.enforcement)) {
          if (!rule.checker) {
            this.addDiagnostic(
              CODES.MISSING_RULE_CHECKER,
              `Rule '${rule.id}' marked enforcement '${rule.enforcement}' requires an automated checker, but none was provided.`,
              { file: relManifestPath, path: `/rules/${i}/checker` }
            );
          } else if (!AUTOMATED_CHECKERS[rule.checker]) {
            this.addDiagnostic(
              CODES.MISSING_RULE_CHECKER,
              `Rule '${rule.id}' references unknown automated checker '${rule.checker}'.`,
              { file: relManifestPath, path: `/rules/${i}/checker` }
            );
          }
        }
      }
    }
  }

  /**
   * Validates cross-skill dependency graph (closure, cycles, conflicts).
   */
  validateDependencyGraph(manifestsById) {
    const knownIds = new Set(Object.keys(manifestsById));

    // Well-known external frameworks (not internal skills)
    const EXTERNAL_NAMES = new Set([
      'vue', 'angular', 'svelte', 'remix', 'express', 'koa', 'hapi', 'sails',
      'tailwind', 'prisma', 'drizzle', 'mongoose', 'sequelize', 'typeorm',
      'next-auth', 'react-query', 'zustand', 'redux', 'mobx', 'jotai', 'valtio',
      'vitest', 'jest', 'mocha', 'cypress', 'playwright', 'storybook',
      'graphql', 'trpc', 'apollo', 'relay', 'urql',
      'sqlite', 'simple-auth', 'kubernetes', 'monitoring', 'cicd', 'cqrs',
      'redis', 'postgres', 'postgresql', 'jwt', 'auth'
    ]);

    // 1. Unknown dependencies & direct conflict violations
    for (const [id, m] of Object.entries(manifestsById)) {
      for (const req of m.dependencies.requires) {
        if (!knownIds.has(req)) {
          this.addDiagnostic(
            CODES.UNKNOWN_DEPENDENCY,
            `Skill '${id}' requires unknown skill '${req}'.`,
            { file: m.source, path: '/dependencies/requires', remediation: `Ensure skill '${req}' is present in .agents/core/skills.` }
          );
        }

        // Direct conflict violation
        if (m.dependencies.conflicts.includes(req)) {
          this.addDiagnostic(
            CODES.CONFLICT_VIOLATION,
            `Skill '${id}' both requires and conflicts with '${req}'.`,
            { file: m.source, path: '/dependencies/conflicts' }
          );
        }

        const reqManifest = manifestsById[req];
        if (reqManifest && reqManifest.dependencies.conflicts.includes(id)) {
          this.addDiagnostic(
            CODES.CONFLICT_VIOLATION,
            `Skill '${id}' requires '${req}', but '${req}' conflicts with '${id}'.`,
            { file: m.source, path: '/dependencies/requires' }
          );
        }
      }
    }

    // 2. Cycle detection via DFS
    const visited = new Map(); // id -> 'unvisited' | 'visiting' | 'visited'
    for (const id of knownIds) visited.set(id, 'unvisited');

    const checkCycle = (curr, stack) => {
      visited.set(curr, 'visiting');
      stack.push(curr);

      const m = manifestsById[curr];
      if (m) {
        for (const dep of m.dependencies.requires) {
          if (!knownIds.has(dep)) continue;
          const status = visited.get(dep);
          if (status === 'visiting') {
            const cyclePath = [...stack.slice(stack.indexOf(dep)), dep].join(' -> ');
            this.addDiagnostic(
              CODES.CYCLE_DETECTED,
              `Dependency cycle detected: ${cyclePath}`,
              { file: m.source, path: '/dependencies/requires' }
            );
          } else if (status === 'unvisited') {
            checkCycle(dep, stack);
          }
        }
      }

      stack.pop();
      visited.set(curr, 'visited');
    };

    for (const id of knownIds) {
      if (visited.get(id) === 'unvisited') {
        checkCycle(id, []);
      }
    }
  }

  /**
   * Computes sha256 hash for a file.
   */
  hashFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Computes sha256 hash for a string.
   */
  hashString(str) {
    return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  }

  /**
   * Compiles all skills in coreSkillsDir and plugins.
   * Generates deterministic CompiledRegistryV2 structure.
   */
  compile() {
    this.diagnostics = [];
    const manifestsById = {};
    const skillDirs = [];

    // 1. Discover skill directories
    if (fs.existsSync(this.coreSkillsDir)) {
      const entries = fs.readdirSync(this.coreSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          skillDirs.push(path.join(this.coreSkillsDir, entry.name));
        }
      }
    }

    // Also check plugins
    const pluginsDir = path.join(this.agentsDir, 'plugins');
    if (fs.existsSync(pluginsDir)) {
      const pluginEntries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      for (const pe of pluginEntries) {
        if (pe.isDirectory()) {
          const pSkills = path.join(pluginsDir, pe.name, 'skills');
          if (fs.existsSync(pSkills)) {
            const subs = fs.readdirSync(pSkills, { withFileTypes: true });
            for (const sub of subs) {
              if (sub.isDirectory()) skillDirs.push(path.join(pSkills, sub.name));
            }
          }
        }
      }
    }

    // Sort skill directories for determinism
    skillDirs.sort();

    // 2. Parse and normalize manifests
    for (const dir of skillDirs) {
      const v2File = path.join(dir, 'skill.v2.yaml');
      const v1File = path.join(dir, 'skill.yaml');
      const manifestFile = fs.existsSync(v2File) ? v2File : (fs.existsSync(v1File) ? v1File : null);

      if (!manifestFile) {
        // Synthesize minimal manifest from directory name & SKILL.md
        const id = path.basename(dir);
        const norm = this.normalizeManifest(dir, `id: ${id}\nname: ${id}\n`);
        norm.source = path.relative(this.rootDir, dir).replace(/\\/g, '/');
        manifestsById[id] = norm;
        continue;
      }

      try {
        const rawYaml = fs.readFileSync(manifestFile, 'utf8');
        const norm = this.normalizeManifest(dir, rawYaml);
        norm.source = path.relative(this.rootDir, manifestFile).replace(/\\/g, '/');

        if (manifestsById[norm.id]) {
          this.addDiagnostic(
            CODES.DUPLICATE_ID,
            `Duplicate skill id '${norm.id}' found in ${norm.source}`,
            { file: norm.source, path: '/id' }
          );
        }

        manifestsById[norm.id] = norm;
        this.validateSingleManifest(dir, norm, manifestFile);
      } catch (err) {
        this.addDiagnostic(
          err.diag ? err.diag.code : CODES.PARSE_ERROR,
          `Failed to parse manifest at ${path.relative(this.rootDir, manifestFile)}: ${err.message}`,
          { 
            file: path.relative(this.rootDir, manifestFile),
            line: err.diag ? err.diag.line : undefined,
            column: err.diag ? err.diag.column : undefined
          }
        );
      }
    }

    // 3. Cross-skill dependency graph validation
    this.validateDependencyGraph(manifestsById);

    // If any errors exist, stop and return diagnostics
    const hasErrors = this.diagnostics.some(d => d.severity === 'error');
    if (hasErrors) {
      return {
        success: false,
        diagnostics: this.diagnostics,
        registry: null,
      };
    }

    // 4. Compute hashes, estimated tokens, aliases and packageMap
    const compiledSkills = {};
    const aliases = {};
    const deprecatedAliases = {};
    const packageMap = {};
    const dependencyGraph = {};
    const rules = {};

    const sortedIds = Object.keys(manifestsById).sort();

    for (const id of sortedIds) {
      const m = manifestsById[id];
      const dir = path.join(this.rootDir, path.dirname(m.source));
      const entrypointFile = path.join(dir, m.entrypoint);

      // Entrypoint hash
      const entrypointHash = this.hashFile(entrypointFile) || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      // Estimated tokens: entrypoint character length / 3.8
      let estimatedTokens = 1000;
      if (fs.existsSync(entrypointFile)) {
        const chars = fs.readFileSync(entrypointFile, 'utf8').length;
        estimatedTokens = Math.max(100, Math.ceil(chars / 3.8));
      }

      // Resource tree hash
      const resHashes = [];
      for (const res of m.resources) {
        const rFile = path.join(dir, res.path);
        const rHash = this.hashFile(rFile);
        if (rHash) resHashes.push(`${res.path}:${rHash}`);
      }
      resHashes.sort();
      const resourceTreeHash = this.hashString(resHashes.join('\n'));

      compiledSkills[id] = {
        id: m.id,
        displayName: m.displayName,
        version: m.version,
        description: m.description,
        category: m.category,
        type: m.type,
        entrypoint: m.entrypoint,
        entrypointHash,
        resourceTreeHash,
        estimatedTokens,
        source: m.source,
        signals: {
          aliases: m.signals.aliases.sort(),
          keywords: m.signals.keywords,
          fileGlobs: m.signals.fileGlobs,
          packages: m.signals.packages,
        },
        dependencies: {
          requires: m.dependencies.requires.sort(),
          optional: m.dependencies.optional.sort(),
          conflicts: m.dependencies.conflicts.sort(),
        },
        context: {
          priority: m.context.priority,
          estimatedTokens,
        },
        resources: m.resources,
        deprecated: m.deprecated || false,
        canonical: m.canonical || null,
        rules: m.rules || [],
      };

      // Register deprecated alias mapping
      if (m.deprecated && m.canonical) {
        deprecatedAliases[id] = m.canonical;
      }

      // Register rules
      if (Array.isArray(m.rules)) {
        for (const r of m.rules) {
          rules[r.id] = {
            ...r,
            sourceSkill: id,
          };
        }
      }

      // Register aliases
      for (const alias of m.signals.aliases) {
        if (!aliases[alias]) {
          aliases[alias] = id;
        }
      }

      // Register packageMap
      for (const pkg of m.signals.packages) {
        packageMap[`${pkg.ecosystem}:${pkg.name}`] = id;
      }

      // Register dependencyGraph
      dependencyGraph[id] = m.dependencies.requires.sort();
    }

    // Overall sourceGraphHash
    const sourceGraphHash = this.hashString(JSON.stringify({
      skills: compiledSkills,
      dependencyGraph,
    }));

    const registry = {
      schemaVersion: 2,
      compilerVersion: '2.0.0',
      sourceGraphHash,
      skills: compiledSkills,
      aliases: sortObjectKeys(aliases),
      deprecatedAliases: sortObjectKeys(deprecatedAliases),
      packageMap: sortObjectKeys(packageMap),
      dependencyGraph: sortObjectKeys(dependencyGraph),
      rules: sortObjectKeys(rules),
    };

    return {
      success: true,
      diagnostics: this.diagnostics,
      registry,
    };
  }

  /**
   * Compiles and writes .agents/compiled/registry.v2.json and .agents/compiled/registry.v2.sha256.
   */
  compileAndWrite() {
    const result = this.compile();
    if (!result.success) {
      return result;
    }

    if (!fs.existsSync(this.compiledDir)) {
      fs.mkdirSync(this.compiledDir, { recursive: true });
    }

    const registryJsonPath = path.join(this.compiledDir, 'registry.v2.json');
    const shaPath = path.join(this.compiledDir, 'registry.v2.sha256');

    const jsonString = JSON.stringify(result.registry, null, 2) + '\n';
    fs.writeFileSync(registryJsonPath, jsonString, 'utf8');

    const shaContent = result.registry.sourceGraphHash + '  registry.v2.json\n';
    fs.writeFileSync(shaPath, shaContent, 'utf8');

    return {
      ...result,
      registryJsonPath,
      shaPath,
    };
  }

  /**
   * Formats diagnostics as SARIF 2.1.0 output.
   */
  formatSarif() {
    const rules = [];
    const results = [];

    const ruleIds = new Set(this.diagnostics.map(d => d.code));
    for (const code of ruleIds) {
      rules.push({
        id: code,
        name: code,
        shortDescription: { text: `ContextOS Manifest Rule ${code}` },
      });
    }

    for (const d of this.diagnostics) {
      results.push({
        ruleId: d.code,
        level: d.severity === 'error' ? 'error' : 'warning',
        message: { text: d.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: d.file.replace(/\\/g, '/') },
              ...(d.line ? { region: { startLine: d.line, ...(d.column ? { startColumn: d.column } : {}) } } : {})
            },
          },
        ],
      });
    }

    return {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'contextos-manifest-compiler',
              version: '2.0.0',
              rules,
            },
          },
          results,
        },
      ],
    };
  }
}

function sortObjectKeys(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k];
  }
  return sorted;
}

module.exports = {
  ManifestCompiler,
  DiagnosticError,
  CODES,
  parseYaml,
};
