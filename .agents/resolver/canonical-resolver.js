/**
 * .agents/resolver/canonical-resolver.js
 * ContextOS — Canonical Manifest-Driven Skill Resolver & Budget Planner (Milestone 3)
 *
 * Implements the single unified resolution engine for both CLI and MCP:
 *   - Signal-based candidate scoring (Evidence model)
 *   - Direct query to compiled registry (registry.v2.json)
 *   - Transitive dependency closure with topological sort
 *   - Deterministic conflict resolution policy
 *   - Token budget planner (removing arbitrary 4-skill hard cap, capability clustering)
 *   - Risk classification (routine, standard, high, destructive)
 *   - Transparent explainability (--explain breakdown)
 *   - 100% parity between CLI and MCP
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WorkspaceGraphBuilder } = require('../workspace/workspace-graph');

// Prompt budget limits (Section 14.4)
const BUDGET_TIERS = {
  BOOTSTRAP: 1200,      // always-on bootstrap budget
  SKILL_SUMMARY: 150,   // single skill summary limit
  SKILL_BODY: 1200,     // single skill body limit
  ROUTINE: 2000,        // routine context limit
  STANDARD: 4000,       // standard normal compiled context limit
  HIGH: 7500,           // high-risk compiled context limit
  DESTRUCTIVE: 10000,   // destructive compiled context limit
};

const DEFAULT_CONTEXT_BUDGET_TOKENS = 8000;

// Risk-based workflows (Section 14.3)
const WORKFLOW_TEMPLATES = {
  routine: {
    name: 'ROUTINE',
    summary: 'Low-risk fast-track: documentation, typo, formatting, low-risk config',
    steps: [
      '1. INSPECT: Read target files and locate exact lines to change',
      '2. CHANGE: Apply targeted edits directly without ceremonial spec/plan',
      '3. TARGETED_VERIFY: Execute specific test, linter, or validation check',
    ],
  },
  standard: {
    name: 'STANDARD',
    summary: 'Standard feature development, bugfix, or component refactor',
    steps: [
      '1. SHORT_PLAN: Outline affected files and atomic steps',
      '2. CHANGE: Implement minimal code adhering to ponytail mindset',
      '3. TESTS: Run relevant unit and integration test suites',
      '4. SELF_REVIEW: Verify diff cleanly contains changes to target files only',
    ],
  },
  high: {
    name: 'HIGH',
    summary: 'High-risk feature: auth, migration, public API, security, CI, concurrency',
    steps: [
      '1. SPEC: Document explicit in-scope/out-of-scope and acceptance criteria',
      '2. APPROVED_PLAN: Atomic tasks (<2h), risk mitigation, and rollback strategy',
      '3. ISOLATED_CHANGE: Surgical implementation strictly within planned files',
      '4. FULL_VERIFICATION: Global test suite + secret scanner + validator',
      '5. INDEPENDENT_REVIEW: Review through security, database, and accessibility lenses',
    ],
  },
  destructive: {
    name: 'DESTRUCTIVE',
    summary: 'Destructive action: file deletion, irreversible migration, history rewrite',
    steps: [
      '1. EXPLICIT_AUTHORITY: Confirm explicit user authorization and bounds',
      '2. ROLLBACK_REHEARSAL: Verify snapshot, backup, or rollback transaction log',
      '3. GUARDED_CHANGE: Execute modification inside journaled transaction with project lock',
      '4. POST_VERIFY: Confirm integrity, state consistency, and absence of data loss',
    ],
  },
};

// Streamlined execution modes (Section 14.2)
const MODES = {
  DISCOVER: 'DISCOVER',
  CHANGE: 'CHANGE',
  VERIFY: 'VERIFY',
  REVIEW: 'REVIEW',
};

// Consolidated deprecated aliases (Section 14.7)
const DEPRECATED_ALIASES = {
  'context-manager': 'context-os',
  'gstack-roles': 'engineering-workflow',
  'ui-design': 'ui-ux-pro',
  'ux-design': 'ui-ux-pro',
  'react-best-practices': 'react',
};

// Weight constants based on architecture spec
const WEIGHTS = {
  EXPLICIT_SKILL: 100,
  EXACT_ALIAS: 80,
  FILE_GLOB: 70,
  NEAREST_PACKAGE: 60,
  TASK_KEYWORD_STRONG: 40,
  TASK_KEYWORD_MEDIUM: 20,
  TASK_KEYWORD_WEAK: 5,
  PROFILE_REQUIRED: 1000, // Mandatory
  PROFILE_PREFERRED: 20,
  AMBIENT_CONFIG: 15,
  SYNERGY_PREREQ: 50,
};

/**
 * Loads compiled registry or compiles on the fly if missing.
 *
 * @param {string} agentsDir - Path to .agents directory
 * @returns {Object|null}
 */
function loadRegistry(agentsDir) {
  const regPath = path.join(agentsDir, 'compiled', 'registry.v2.json');
  if (fs.existsSync(regPath)) {
    try {
      return JSON.parse(fs.readFileSync(regPath, 'utf8'));
    } catch {
      // ignore corrupt, fall through
    }
  }

  // Fallback: try compiling via ManifestCompiler
  try {
    const { ManifestCompiler } = require('../compiler/manifest-compiler.js');
    const compiler = new ManifestCompiler({ agentsDir });
    const res = compiler.compile();
    if (res.success && res.registry) {
      return res.registry;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Resolves .agents directory, searching upwards or falling back to ContextOS repository root.
 */
function findAgentsDir(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (curr) {
    const candidate = path.join(curr, '.agents');
    if (fs.existsSync(path.join(candidate, 'compiled', 'registry.v2.json')) || fs.existsSync(path.join(candidate, 'core', 'skills'))) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  const fallback = path.resolve(__dirname, '..');
  if (fs.existsSync(fallback)) return fallback;
  return path.join(process.cwd(), '.agents');
}

/**
 * Resolves project root directory containing .agents/
 */
function findProjectRoot(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (curr) {
    if (fs.existsSync(path.join(curr, '.agents'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

/**
 * Analyzes import graph and manifests for project technologies.
 * Exported for backward compatibility with AST tests.
 *
 * @param {string} projectDir
 * @returns {Map<string, number>}
 */
function analyzeImportGraph(projectDir = process.cwd()) {
  const signals = new Map();
  if (!projectDir || !fs.existsSync(projectDir)) return signals;

  const add = (skill, w) => {
    signals.set(skill, (signals.get(skill) || 0) + w);
  };

  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };

      const PKG_MAP = {
        'react': 'react',
        'react-dom': 'react',
        'next': 'nextjs',
        'prisma': 'database',
        '@prisma/client': 'database',
        'drizzle-orm': 'database',
        'drizzle-kit': 'database',
        'typeorm': 'database',
        'mongoose': 'database',
        'pg': 'database',
        'mysql2': 'database',
        'vitest': 'testing',
        'jest': 'testing',
        'playwright': 'testing',
        '@playwright/test': 'testing',
        'cypress': 'testing',
        'express': 'node',
        'fastify': 'node',
        'hono': 'node',
        '@nestjs/core': 'nestjs',
        'typescript': 'typescript',
        'zod': 'typescript',
        'tailwindcss': 'ui-ux-pro',
        'lucide-react': 'ui-ux-pro',
        '@radix-ui/react-dialog': 'web-accessibility',
        'framer-motion': 'impeccable-design',
        'dockerode': 'docker',
        'ioredis': 'system-design',
        'kafkajs': 'microservices',
        'amqplib': 'microservices',
      };

      for (const [dep, skill] of Object.entries(PKG_MAP)) {
        if (deps[dep]) add(skill, 15);
      }
    } catch {
      // ignore
    }
  }

  const CONFIG_MAP = [
    { file: 'tsconfig.json', skill: 'typescript', weight: 10 },
    { file: 'next.config.js', skill: 'nextjs', weight: 15 },
    { file: 'next.config.mjs', skill: 'nextjs', weight: 15 },
    { file: 'next.config.ts', skill: 'nextjs', weight: 15 },
    { file: 'tailwind.config.js', skill: 'ui-ux-pro', weight: 10 },
    { file: 'tailwind.config.ts', skill: 'ui-ux-pro', weight: 10 },
    { file: 'nest-cli.json', skill: 'nestjs', weight: 15 },
    { file: 'prisma/schema.prisma', skill: 'database', weight: 15 },
    { file: 'drizzle.config.ts', skill: 'database', weight: 15 },
    { file: 'drizzle.config.js', skill: 'database', weight: 15 },
    { file: 'Dockerfile', skill: 'docker', weight: 15 },
    { file: 'docker-compose.yml', skill: 'docker', weight: 15 },
    { file: 'docker-compose.yaml', skill: 'docker', weight: 15 },
    { file: 'requirements.txt', skill: 'fastapi', weight: 15 },
    { file: 'pyproject.toml', skill: 'fastapi', weight: 15 },
    { file: 'vitest.config.ts', skill: 'testing', weight: 15 },
    { file: 'vitest.config.js', skill: 'testing', weight: 15 },
    { file: 'playwright.config.ts', skill: 'testing', weight: 15 },
    { file: 'playwright.config.js', skill: 'testing', weight: 15 },
  ];

  for (const { file, skill, weight } of CONFIG_MAP) {
    if (fs.existsSync(path.join(projectDir, file))) {
      add(skill, weight);
    }
  }

  return signals;
}

/**
 * Scans project package.json and config files for ambient signals.
 */
function collectWorkspaceEvidence(projectRoot, registry) {
  const evidenceMap = new Map(); // skillId -> Evidence[]

  const add = (skillId, kind, weight, reason) => {
    if (!evidenceMap.has(skillId)) evidenceMap.set(skillId, []);
    evidenceMap.get(skillId).push({ kind, weight, reason });
  };

  if (!projectRoot || !fs.existsSync(projectRoot)) return evidenceMap;

  // 1. Scan package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };

      const packageMap = registry?.packageMap || {
        'npm:next': 'nextjs',
        'npm:react': 'react',
        'npm:prisma': 'database',
        'npm:drizzle-orm': 'database',
        'npm:typescript': 'typescript',
        'npm:tailwindcss': 'ui-ux-pro',
        'npm:@nestjs/core': 'nestjs',
        'pypi:fastapi': 'fastapi',
      };

      for (const [key, skillId] of Object.entries(packageMap)) {
        const pkgName = key.split(':')[1] || key;
        if (deps[pkgName]) {
          add(skillId, 'package', WEIGHTS.NEAREST_PACKAGE, `Workspace package "${pkgName}" in package.json`);
        }
      }

      const EXTRA_PACKAGES = {
        'react-dom': 'react',
        '@prisma/client': 'database',
        'drizzle-kit': 'database',
        'typeorm': 'database',
        'mongoose': 'database',
        'pg': 'database',
        'mysql2': 'database',
        'vitest': 'testing',
        'jest': 'testing',
        'playwright': 'testing',
        '@playwright/test': 'testing',
        'cypress': 'testing',
        'express': 'node',
        'fastify': 'node',
        'hono': 'node',
        'zod': 'typescript',
        'lucide-react': 'ui-ux-pro',
        '@radix-ui/react-dialog': 'web-accessibility',
        'framer-motion': 'impeccable-design',
        'dockerode': 'docker',
        'ioredis': 'system-design',
        'kafkajs': 'microservices',
        'amqplib': 'microservices',
      };

      for (const [pName, sId] of Object.entries(EXTRA_PACKAGES)) {
        if (deps[pName]) {
          add(sId, 'package', 15, `Package dependency "${pName}" in package.json`);
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Scan framework config files
  const CONFIG_SIGNALS = [
    { file: 'tsconfig.json', skill: 'typescript' },
    { file: 'next.config.js', skill: 'nextjs' },
    { file: 'next.config.mjs', skill: 'nextjs' },
    { file: 'next.config.ts', skill: 'nextjs' },
    { file: 'tailwind.config.js', skill: 'ui-ux-pro' },
    { file: 'tailwind.config.ts', skill: 'ui-ux-pro' },
    { file: 'nest-cli.json', skill: 'nestjs' },
    { file: 'prisma/schema.prisma', skill: 'database' },
    { file: 'drizzle.config.ts', skill: 'database' },
    { file: 'drizzle.config.js', skill: 'database' },
    { file: 'Dockerfile', skill: 'docker' },
    { file: 'docker-compose.yml', skill: 'docker' },
    { file: 'docker-compose.yaml', skill: 'docker' },
    { file: 'requirements.txt', skill: 'fastapi' },
    { file: 'pyproject.toml', skill: 'fastapi' },
    { file: 'vitest.config.ts', skill: 'testing' },
    { file: 'vitest.config.js', skill: 'testing' },
    { file: 'playwright.config.ts', skill: 'testing' },
    { file: 'playwright.config.js', skill: 'testing' },
  ];

  for (const { file, skill } of CONFIG_SIGNALS) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      add(skill, 'config', WEIGHTS.AMBIENT_CONFIG, `Config file "${file}" present`);
    }
  }

  // 3. Integrate AST & import graph signals
  const astSignals = analyzeImportGraph(projectRoot);
  for (const [skill, weight] of astSignals.entries()) {
    add(skill, 'package', weight, `Import graph signal for "${skill}" (+${weight})`);
  }

  return evidenceMap;
}

/**
 * Evaluates task risk level according to Milestone 3 spec.
 */
function evaluateRisk(taskText, files = []) {
  const reasons = [];
  const text = (taskText || '').toLowerCase();
  let value = 'standard';

  // Destructive operations
  if (/\b(drop\s*database|drop\s*table|rm\s*-rf|truncate|destroy|delete\s*from|format\s*disk)\b/i.test(text) ||
      /\b(удали\w*\s*(?:базу|таблиц|диск|файл)|очист\w*\s*базу|уничтож\w*)\b/i.test(text)) {
    reasons.push({ kind: 'risk_keyword', weight: 100, reason: 'Mentions destructive database or filesystem operation' });
    value = 'destructive';
  } else if (/\b(secur\w*|auth\w*|jwt|password|token|secret|migration|schema|permission|billing|payment|credit\s*card|crypto)\b/i.test(text) ||
      /\b(безопасн\w*|авториз\w*|аутентифик\w*|парол\w*|токен\w*|миграц\w*|платеж\w*|платёж\w*|доступ\w*)\b/i.test(text) ||
      files.some(f => /\b(auth|security|migration|schema)\b/i.test(f))) {
    // High-risk operations
    reasons.push({ kind: 'risk_keyword', weight: 50, reason: 'Touches security, authentication, migration, or sensitive domain' });
    value = 'high';
  } else if ((/\b(typo|readme|doc|comment|format|lint|prettier)\b/i.test(text) ||
      /\b(опечатк\w*|документац\w*|комментар\w*|форматирован\w*)\b/i.test(text)) &&
      files.every(f => /\.(md|txt|json|ya?ml)$/i.test(f))) {
    // Routine operations
    reasons.push({ kind: 'risk_keyword', weight: 10, reason: 'Routine documentation or formatting change' });
    value = 'routine';
  } else {
    reasons.push({ kind: 'risk_default', weight: 20, reason: 'Standard feature development or modification' });
    value = 'standard';
  }

  return {
    value,
    reasons,
    workflow: WORKFLOW_TEMPLATES[value] || WORKFLOW_TEMPLATES.standard,
  };
}

/**
 * Maps lifecycle phase and role.
 */
function resolvePhaseAndRole(phaseArg, taskText, selectedSkills) {
  let phaseValue = 'Build';
  let phaseSource = 'default';

  if (phaseArg && typeof phaseArg === 'string') {
    phaseValue = phaseArg.charAt(0).toUpperCase() + phaseArg.slice(1).toLowerCase();
    phaseSource = 'explicit';
  } else {
    const lower = (taskText || '').toLowerCase();
    if (/\b(spec|requirements|user\s*story|критерии|требован)\b/i.test(lower)) {
      phaseValue = 'Define';
      phaseSource = 'prompt';
    } else if (/\b(plan|architecture|design\s*the\s*system|спланируй|архитектур)\b/i.test(lower)) {
      phaseValue = 'Plan';
      phaseSource = 'prompt';
    } else if (/\b(review|audit|check\s*pr|ревью|проверь\s*код)\b/i.test(lower)) {
      phaseValue = 'Review';
      phaseSource = 'prompt';
    } else if (/\b(test|vitest|jest|playwright|tdd|тест)\b/i.test(lower)) {
      phaseValue = 'Verify';
      phaseSource = 'prompt';
    } else if (/\b(deploy|release|ship|production|релиз|деплой)\b/i.test(lower)) {
      phaseValue = 'Ship';
      phaseSource = 'prompt';
    }
  }

  let role = 'Senior Developer';
  switch (phaseValue) {
    case 'Define':
      role = 'Product Manager';
      break;
    case 'Plan':
      role = 'Architect';
      break;
    case 'Verify':
    case 'Test':
      role = 'QA Lead';
      break;
    case 'Review':
      role = selectedSkills.some(s => ['ui-ux-pro', 'impeccable-design'].includes(s))
        ? 'Staff Engineer + Senior Designer'
        : 'Staff Engineer';
      break;
    case 'Ship':
      role = 'Release Engineer';
      break;
    default:
      if (selectedSkills.every(s => ['ui-ux-pro', 'impeccable-design', 'ui-design'].includes(s))) {
        role = 'Senior Designer';
      } else {
        role = 'Senior Developer';
      }
  }

  return {
    phase: { value: phaseValue, source: phaseSource },
    role,
  };
}

/**
 * Returns transitive dependencies array for a given skill id.
 */
function getTransitiveDeps(skillId, depGraph, excludedSet) {
  const result = [];
  const queue = [skillId];
  const visited = new Set([skillId]);

  while (queue.length > 0) {
    const curr = queue.shift();
    const reqs = depGraph[curr] || [];
    for (const req of reqs) {
      if (excludedSet.has(req)) continue;
      if (!visited.has(req)) {
        visited.add(req);
        result.push(req);
        queue.push(req);
      }
    }
  }

  return result;
}

/**
 * Main CanonicalResolver class.
 */
class CanonicalResolver {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.agentsDir = options.agentsDir || findAgentsDir(this.rootDir);
    this.registry = options.registry || loadRegistry(this.agentsDir);
    this.workspaceGraph = options.workspaceGraph || null;
    this.workspaceGraphBuilder = new WorkspaceGraphBuilder();
    this._workspaceGraphCache = new Map();
  }

  getWorkspaceGraph(projectDir) {
    if (this.workspaceGraph) return this.workspaceGraph;
    const root = this.workspaceGraphBuilder.findRepositoryRoot(projectDir);
    if (!this._workspaceGraphCache.has(root)) {
      this._workspaceGraphCache.set(root, this.workspaceGraphBuilder.build(root));
    }
    return this._workspaceGraphCache.get(root);
  }

  _mapDependencyOrConfigToSkill(target, registry) {
    if (!target) return null;
    const clean = target.toLowerCase();

    const packageMap = registry?.packageMap || {};
    if (packageMap[`npm:${clean}`]) return packageMap[`npm:${clean}`];
    if (packageMap[`pypi:${clean}`]) return packageMap[`pypi:${clean}`];
    if (packageMap[clean]) return packageMap[clean];

    const PKG_MAP = {
      'next': 'nextjs',
      'react': 'react',
      'react-dom': 'react',
      'typescript': 'typescript',
      'tailwindcss': 'ui-ux-pro',
      '@tailwindcss/postcss': 'ui-ux-pro',
      'lucide-react': 'ui-ux-pro',
      '@nestjs/core': 'nestjs',
      '@nestjs/common': 'nestjs',
      'fastapi': 'fastapi',
      'pydantic': 'fastapi',
      'uvicorn': 'fastapi',
      'prisma': 'database',
      '@prisma/client': 'database',
      'drizzle-orm': 'database',
      'drizzle-kit': 'database',
      'typeorm': 'database',
      'vitest': 'testing',
      'jest': 'testing',
      'playwright': 'testing',
      '@playwright/test': 'testing',
      'dockerode': 'docker',
      'ioredis': 'system-design',
      'kafkajs': 'microservices',
      'amqplib': 'microservices',
      'zod': 'typescript',
    };
    if (PKG_MAP[clean]) return PKG_MAP[clean];

    const base = path.basename(clean);
    if (base.startsWith('next.config.')) return 'nextjs';
    if (base.startsWith('tailwind.config.')) return 'ui-ux-pro';
    if (base.startsWith('vitest.config.') || base.startsWith('playwright.config.') || base.startsWith('jest.config.')) return 'testing';
    if (base === 'tsconfig.json') return 'typescript';
    if (base === 'nest-cli.json') return 'nestjs';
    if (base.includes('docker-compose') || base === 'dockerfile') return 'docker';
    if (base === 'schema.prisma' || base.startsWith('drizzle.config.')) return 'database';
    if (base === 'requirements.txt' || base === 'pyproject.toml') return 'fastapi';

    return null;
  }

  /**
   * Resolves minimal skills required for a given request.
   *
   * @param {Object} request - Resolution request parameters
   * @returns {Object} Structured ResolutionResult
   */
  resolve(request = {}) {
    const task = request.task || request.prompt || '';
    const files = (request.files || []).map(f => f.replace(/\\/g, '/'));
    const projectRoot = request.projectDir ? path.resolve(request.projectDir) : this.rootDir;
    const explicitPhase = request.explicitPhase || request.phase;

    // Evaluate risk early to establish tiered prompt budget (Section 14.4)
    const risk = evaluateRisk(task, files);
    const defaultTierBudget = (risk.value === 'high' || risk.value === 'destructive')
      ? BUDGET_TIERS.HIGH
      : BUDGET_TIERS.STANDARD;
    const budgetTokens = (typeof request.contextBudgetTokens === 'number' && request.contextBudgetTokens > 0)
      ? request.contextBudgetTokens
      : defaultTierBudget;

    const maxSkillsLimit = request.maxSkills ? Math.max(1, request.maxSkills) : Infinity;

    const taskLower = task.toLowerCase();
    const warnings = [];

    // Ensure registry is loaded
    if (!this.registry) {
      this.registry = loadRegistry(findAgentsDir(projectRoot));
    }

    // 1. Load active profile (supports monorepo package overrides for touched files)
    let activeProfile = null;
    try {
      const profilesModule = require('../profiles.js');
      activeProfile = profilesModule.getActiveProfile(projectRoot, files[0]);
    } catch {
      // ignore
    }

    const profileExcluded = new Set(activeProfile?.exclude_skills || []);
    const profilePreferred = new Set(activeProfile?.prefer_skills || []);
    const profileRequired = new Set(activeProfile?.require_skills || []);
    const profileEnforce = activeProfile?.enforce || {};

    // 2. Collect Evidence
    const evidenceBySkill = new Map(); // skillId -> Evidence[]
    const deprecatedMap = { ...DEPRECATED_ALIASES, ...(this.registry?.deprecatedAliases || {}) };

    const addEvidence = (id, kind, weight, reason) => {
      let resolvedId = id;
      if (deprecatedMap[id]) {
        resolvedId = deprecatedMap[id];
        if (!warnings.some(w => w.code === 'CTX_SKILL_DEPRECATED_ALIAS' && w.deprecatedSkill === id)) {
          warnings.push({
            code: 'CTX_SKILL_DEPRECATED_ALIAS',
            deprecatedSkill: id,
            canonicalSkill: resolvedId,
            message: `Skill '${id}' is a deprecated alias. Redirected to canonical skill '${resolvedId}' with 0 duplicate tokens.`,
          });
        }
      }

      if (profileExcluded.has(resolvedId)) return;
      if (!evidenceBySkill.has(resolvedId)) evidenceBySkill.set(resolvedId, []);
      evidenceBySkill.get(resolvedId).push({ kind, weight, reason });
    };

    // Workspace Evidence Graph
    const workspaceGraph = request.workspaceGraph || this.getWorkspaceGraph(projectRoot);
    if (workspaceGraph) {
      if (files.length > 0) {
        // Collect nearest-package evidence for specific touched files
        const touchedPackages = new Set();
        for (const file of files) {
          const nearestPkg = this.workspaceGraphBuilder.findNearestPackage(file, workspaceGraph);
          if (nearestPkg && !touchedPackages.has(nearestPkg.id)) {
            touchedPackages.add(nearestPkg.id);
            const pkgEvidences = this.workspaceGraphBuilder.extractPackageEvidence(file, workspaceGraph);
            for (const pe of pkgEvidences) {
              const skillId = this._mapDependencyOrConfigToSkill(pe.target, this.registry);
              if (skillId) {
                addEvidence(skillId, pe.source, pe.weight, pe.description);
              }
            }
          }
        }
      } else {
        // Ambient workspace evidence from root package
        const rootPkg = workspaceGraph.packages.find(p => p.root === '.');
        if (rootPkg) {
          for (const dep of rootPkg.dependencies) {
            const skillId = this._mapDependencyOrConfigToSkill(dep, this.registry);
            if (skillId) {
              addEvidence(skillId, 'nearest_package', WEIGHTS.NEAREST_PACKAGE, `Root package dependency "${dep}" (+${WEIGHTS.NEAREST_PACKAGE})`);
            }
          }
          for (const cfg of rootPkg.configs) {
            const skillId = this._mapDependencyOrConfigToSkill(cfg, this.registry);
            if (skillId) {
              addEvidence(skillId, 'package_config', 50, `Root package config "${cfg}" (+50)`);
            }
          }
        }
      }
    } else {
      // Fallback to ambient workspace scan
      const workspaceEvidence = collectWorkspaceEvidence(projectRoot, this.registry);
      for (const [sId, evList] of workspaceEvidence.entries()) {
        for (const ev of evList) {
          addEvidence(sId, ev.kind, ev.weight, ev.reason);
        }
      }
    }

    // Profile preferences & requirements
    for (const sId of profilePreferred) {
      addEvidence(sId, 'profile_preferred', WEIGHTS.PROFILE_PREFERRED, `Preferred by active profile "${activeProfile?.name || 'custom'}" (+${WEIGHTS.PROFILE_PREFERRED})`);
    }
    for (const sId of profileRequired) {
      addEvidence(sId, 'profile_required', WEIGHTS.PROFILE_REQUIRED, `Required by active profile "${activeProfile?.name || 'custom'}"`);
    }

    // Profile enforcement rules
    const normPhase = (explicitPhase || 'Build').toLowerCase();
    if (profileEnforce.testing === true && ['build', 'verify', 'test'].includes(normPhase)) {
      addEvidence('testing', 'profile_required', WEIGHTS.PROFILE_REQUIRED, 'Enforced by active profile (enforce.testing)');
    }
    if (profileEnforce.adr === true && normPhase === 'plan') {
      addEvidence('decisions', 'profile_required', WEIGHTS.PROFILE_REQUIRED, 'Enforced by active profile (enforce.adr)');
    }

    // Explicit skills requested via prompt (@skill) or args
    const explicitSkills = new Set(request.explicitSkills || []);
    const explicitMatches = task.match(/@([a-z0-9-]+)/g);
    if (explicitMatches) {
      for (const m of explicitMatches) explicitSkills.add(m.slice(1));
    }

    for (const sId of explicitSkills) {
      addEvidence(sId, 'explicit', WEIGHTS.EXPLICIT_SKILL, `Explicitly requested skill "${sId}"`);
    }

    // Scan registry skills signals (or built-in fallback)
    const skillsDict = this.registry?.skills || {};
    const skillIds = Object.keys(skillsDict);

    for (const id of skillIds) {
      const skill = skillsDict[id];
      const signals = skill.signals || {};

      // Exact alias match
      for (const alias of signals.aliases || []) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (re.test(taskLower)) {
          addEvidence(id, 'alias', WEIGHTS.EXACT_ALIAS, `Exact alias match "${alias}" in task description`);
          break;
        }
      }

      // Keyword matches
      for (const kw of signals.keywords || []) {
        const escaped = kw.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (re.test(taskLower)) {
          const w = kw.weight || WEIGHTS.TASK_KEYWORD_STRONG;
          addEvidence(id, 'keyword', w, `Task keyword "${kw.value}" (+${w})`);
        }
      }

      // File pattern matches
      for (const file of files) {
        for (const fg of signals.fileGlobs || []) {
          const pattern = fg.value;
          const rePattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*\//g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\{([^}]+)\}/g, (_, group) => `(${group.replace(/,/g, '|')})`);
          const re = new RegExp(rePattern, 'i');
          if (re.test(file)) {
            const w = fg.weight || WEIGHTS.FILE_GLOB;
            addEvidence(id, 'file_glob', w, `Touched file "${file}" matches glob "${pattern}" (+${w})`);
          }
        }
      }
    }

    // Built-in keyword triggers & bilingual support (including Russian patterns)
    const BUILTIN_TRIGGERS = [
      { id: 'nextjs', re: /\b(next|next\.js|app\s*router|server\s*actions?|rsc)\b|некст/i, w: 40, kw: 'next.js' },
      { id: 'react', re: /\b(react|reactjs|useOptimistic)\b|компонент|хук|модал\w*/i, w: 40, kw: 'react' },
      { id: 'typescript', re: /\b(typescript|type-?safe|generics?|tsconfig)\b|тайпскрипт|типизац/i, w: 40, kw: 'typescript' },
      { id: 'ui-ux-pro', re: /\b(ui|ux|tailwind|styling)\b|дизайн|верстк|макет|интерфейс|модал\w*/i, w: 35, kw: 'ui/ux' },
      { id: 'security', re: /\b(security|auth|jwt|login|csrf|xss|rate\s*limit)\b|авториз|аутентифик|парол|безопасност/i, w: 40, kw: 'security' },
      { id: 'database', re: /\b(database|sql|postgres|prisma|drizzle|migration|orm)\b|баз.*данн|миграц|таблиц/i, w: 40, kw: 'database' },
      { id: 'testing', re: /\b(vitest|jest|playwright|tdd|bdd|e2e)\b|тестирован|покрыти|юнит|тест/i, w: 40, kw: 'testing' },
      { id: 'performance', re: /\b(performance|latency|lcp|cls|inp|core\s*web\s*vitals)\b|производительн|ускор|быстр|throughput/i, w: 40, kw: 'performance' },
      { id: 'docker', re: /\b(docker|dockerfile|compose)\b|докер/i, w: 40, kw: 'docker' },
      { id: 'fastapi', re: /\b(fastapi|pydantic|uvicorn)\b|питон/i, w: 40, kw: 'fastapi' },
      { id: 'nestjs', re: /\b(nestjs|@nestjs)\b|нест/i, w: 40, kw: 'nestjs' },
      { id: 'node', re: /\b(node|node\.js|nodejs|express|fastify)\b|бэкенд|эндпоинт/i, w: 35, kw: 'node' },
      { id: 'ddd', re: /\b(ddd|domain-?driven|bounded\s*context)\b|агрегат|домен/i, w: 40, kw: 'ddd' },
      { id: 'microservices', re: /\b(microservices?|grpc|rabbitmq|kafka)\b|микросервис/i, w: 40, kw: 'microservices' },
      { id: 'system-design', re: /\b(system\s*design|architecture)\b|архитектур|масштабируем/i, w: 40, kw: 'system-design' },
      { id: 'graphify', re: /\b(graphify|knowledge\s*graph|codebase\s*graph)\b|граф\s*проект|граф\s*зависимост/i, w: 45, kw: 'graphify' },
      { id: 'architecture-diagrams', re: /\b(diagram|flowchart|sequence\s*diagram)\b|диаграмм|схем/i, w: 40, kw: 'diagram' },
      { id: 'interview-me', re: /\b(interview)\b|интервью|расспроси|уточни/i, w: 40, kw: 'interview' },
      { id: 'web-accessibility', re: /\b(accessib\w*|a11y|wcag|aria|focus\s*trap|screen\s*reader)\b|доступност|скринридер/i, w: 40, kw: 'accessibility' },
      { id: 'impeccable-design', re: /\b(impeccable|visual\s*qa|micro-?animation)\b|анимац|полировк/i, w: 40, kw: 'impeccable' },
      { id: 'state-management', re: /\b(zustand|tanstack\s*query|redux)\b|стейт|хранилищ/i, w: 40, kw: 'state-management' },
      { id: 'brutalist-design', re: /\b(brutalist|brutalism)\b|брутализм/i, w: 40, kw: 'brutalist' },
      { id: 'minimalist-design', re: /\b(minimalist|minimalism)\b|минимализм/i, w: 40, kw: 'minimalist' },
      { id: 'soft-design', re: /\b(soft-design)\b|мягкий\s*дизайн/i, w: 40, kw: 'soft-design' },
      { id: 'redesign-audit', re: /\b(redesign-audit|audit\s*ui)\b|аудит\s*интерфейс/i, w: 40, kw: 'redesign-audit' },
      { id: 'vercel-optimize', re: /\b(vercel-optimize|vercel\s*edge)\b/i, w: 40, kw: 'vercel-optimize' },
    ];

    for (const trig of BUILTIN_TRIGGERS) {
      if (trig.re.test(taskLower)) {
        addEvidence(trig.id, 'keyword', trig.w, `Task keyword "${trig.kw}" (+${trig.w})`);
      }
    }

    // Built-in file glob signals
    const BUILTIN_FILE_GLOBS = [
      { id: 'nextjs', re: /app\/.*\.(tsx|jsx|ts|js)$|next\.config\./i, w: 70 },
      { id: 'react', re: /\.(tsx|jsx)$/i, w: 60 },
      { id: 'typescript', re: /\.tsx?$|tsconfig\.json$/i, w: 60 },
      { id: 'ui-ux-pro', re: /\.(css|scss|sass)$|tailwind\.config\./i, w: 60 },
      { id: 'database', re: /\.prisma$|drizzle\.config\.|migrations?\/.*\.sql$/i, w: 70 },
      { id: 'security', re: /\bauth\b|\bsecurity\b/i, w: 60 },
      { id: 'testing', re: /\.(test|spec)\.(ts|js|tsx|jsx|py)$|vitest\.config\.|playwright\.config\./i, w: 70 },
      { id: 'docker', re: /Dockerfile|docker-compose\./i, w: 70 },
      { id: 'fastapi', re: /\.py$|requirements\.txt$|pyproject\.toml$/i, w: 60 },
      { id: 'nestjs', re: /nest-cli\.json$/i, w: 70 },
      { id: 'graphify', re: /graph\.json$|GRAPH_REPORT\.md$/i, w: 70 },
      { id: 'vercel-optimize', re: /vercel\.json$/i, w: 70 },
    ];

    for (const file of files) {
      for (const fg of BUILTIN_FILE_GLOBS) {
        if (fg.re.test(file)) {
          addEvidence(fg.id, 'file_glob', fg.w, `Touched file "${file}" matches pattern (+${fg.w})`);
        }
      }
    }

    // 3. Compute Candidate Scores & Intent Precedence
    const candidates = [];
    for (const [id, evList] of evidenceBySkill.entries()) {
      if (profileExcluded.has(id)) continue;

      let score = 0;
      let hasDirectTaskIntent = false;
      let isMandatory = false;

      for (const e of evList) {
        score += e.weight;
        if ((e.kind === 'keyword' || e.kind === 'alias') && e.weight >= 20) {
          hasDirectTaskIntent = true;
        }
        if (e.kind === 'explicit' || e.kind === 'profile_required') {
          isMandatory = true;
          hasDirectTaskIntent = true;
        }
      }

      // Intent Precedence: direct prompt/task intent receives a priority boost over ambient stack noise
      const priorityScore = (hasDirectTaskIntent ? 1000 : 0) + score;
      candidates.push({ id, score, priorityScore, hasDirectTaskIntent, isMandatory, reasons: evList });
    }

    // Sort by priorityScore descending, then score descending, then lexical ID
    candidates.sort((a, b) => b.priorityScore - a.priorityScore || b.score - a.score || a.id.localeCompare(b.id));

    // 4. Intent Slots & Context Suppression
    const hasPureInfraIntent = candidates.some(c => c.id === 'docker' && c.hasDirectTaskIntent);
    const hasBackendOnlyIntent = candidates.some(c => ['database', 'fastapi', 'nestjs', 'ddd'].includes(c.id) && c.hasDirectTaskIntent) &&
      !files.some(f => /\.(tsx|jsx|css|scss|html)$/.test(f)) &&
      !/\b(ui|react|css|tailwind|frontend|макет|дизайн|кнопк|стил|компонент)/i.test(taskLower);

    const suppressAmbientUI = hasPureInfraIntent || hasBackendOnlyIntent;

    const initialSelection = [];
    const excluded = [];

    // Qualification filter (score >= 25 or explicit/required or direct task intent with score >= 20)
    for (const cand of candidates) {
      if (suppressAmbientUI && ['ui-ux-pro', 'impeccable-design', 'ui-design', 'web-accessibility'].includes(cand.id) && !cand.hasDirectTaskIntent) {
        excluded.push({ id: cand.id, reasonCode: 'suppressed_by_intent', details: 'Ambient UI skill suppressed for pure backend/infrastructure task' });
        continue;
      }

      if (cand.isMandatory || cand.score >= 25 || (cand.hasDirectTaskIntent && cand.score >= 20)) {
        initialSelection.push(cand);
      } else {
        excluded.push({ id: cand.id, reasonCode: 'score_threshold', details: `Score ${cand.score} below activation threshold (25)` });
      }
    }

    // Architectural synergy rules (e.g. database, microservices, ddd, graphify -> system-design)
    const needsSystemDesign = initialSelection.some(c => ['database', 'microservices', 'ddd', 'graphify'].includes(c.id));
    if (needsSystemDesign && !initialSelection.some(c => c.id === 'system-design') && !profileExcluded.has('system-design')) {
      initialSelection.push({
        id: 'system-design',
        score: WEIGHTS.SYNERGY_PREREQ,
        priorityScore: 500,
        hasDirectTaskIntent: false,
        isMandatory: false,
        reasons: [{ kind: 'synergy', weight: WEIGHTS.SYNERGY_PREREQ, reason: 'Architectural synergy prerequisite for database/microservices/ddd/graphify' }],
      });
    }

    // Secondary profile enforce check (e.g. enforce.adr when system-design or microservices is present)
    if (profileEnforce.adr === true && initialSelection.some(c => c.id === 'system-design' || c.id === 'microservices')) {
      if (!initialSelection.some(c => c.id === 'decisions') && !profileExcluded.has('decisions')) {
        initialSelection.push({
          id: 'decisions',
          score: 100,
          priorityScore: 1000,
          hasDirectTaskIntent: true,
          isMandatory: true,
          reasons: [{ kind: 'profile_required', weight: 100, reason: 'Enforced by active profile (enforce.adr with system-design/microservices)' }],
        });
      }
    }

    // 5. Dependency Graph Setup
    const depGraph = this.registry?.dependencyGraph || {
      react: ['typescript'],
      nextjs: ['react', 'typescript'],
      nestjs: ['node', 'typescript'],
      node: ['typescript'],
      microservices: ['system-design'],
      'vercel-optimize': ['nextjs', 'react', 'typescript'],
    };

    const closureMap = new Map();
    for (const item of initialSelection) {
      const rawEst = skillsDict[item.id]?.estimatedTokens || 1000;
      const estTokens = Math.min(rawEst, BUDGET_TIERS.SKILL_BODY);
      closureMap.set(item.id, {
        id: item.id,
        displayName: skillsDict[item.id]?.displayName || item.id,
        score: item.score,
        priorityScore: item.priorityScore,
        reasons: item.reasons,
        requiredBy: [],
        estimatedTokens: estTokens,
      });
    }

    // Populate required dependencies in closureMap
    for (const cand of initialSelection) {
      const reqs = getTransitiveDeps(cand.id, depGraph, profileExcluded);
      for (const reqId of reqs) {
        if (closureMap.has(reqId)) {
          const entry = closureMap.get(reqId);
          if (!entry.requiredBy.includes(cand.id)) {
            entry.requiredBy.push(cand.id);
            entry.reasons.push({ kind: 'dependency', weight: 100, reason: `Required by "${cand.id}"` });
          }
        } else {
          const rawEst = skillsDict[reqId]?.estimatedTokens || 1000;
          const estTokens = Math.min(rawEst, BUDGET_TIERS.SKILL_BODY);
          closureMap.set(reqId, {
            id: reqId,
            displayName: skillsDict[reqId]?.displayName || reqId,
            score: 100,
            priorityScore: 800,
            reasons: [{ kind: 'dependency', weight: 100, reason: `Required by "${cand.id}"` }],
            requiredBy: [cand.id],
            estimatedTokens: estTokens,
          });
        }
      }
    }

    // 6. Conflict Resolution Policy
    const conflicts = [];
    for (const [id, item] of closureMap.entries()) {
      const skillConflicts = skillsDict[id]?.dependencies?.conflicts || [];
      for (const confId of skillConflicts) {
        if (closureMap.has(confId)) {
          const other = closureMap.get(confId);
          const itemExplicit = item.reasons.some(r => r.kind === 'explicit');
          const otherExplicit = other.reasons.some(r => r.kind === 'explicit');

          if (itemExplicit && otherExplicit) {
            conflicts.push({ skillA: id, skillB: confId, resolution: 'error', reason: `Both conflicting skills "${id}" and "${confId}" were explicitly requested` });
          } else if (itemExplicit && !otherExplicit) {
            closureMap.delete(confId);
            excluded.push({ id: confId, reasonCode: 'conflict', details: `Conflicted with explicitly requested skill "${id}"` });
          } else if (!itemExplicit && otherExplicit) {
            closureMap.delete(id);
            excluded.push({ id, reasonCode: 'conflict', details: `Conflicted with explicitly requested skill "${confId}"` });
          } else {
            // Compare priority/score
            if (item.priorityScore >= other.priorityScore) {
              closureMap.delete(confId);
              excluded.push({ id: confId, reasonCode: 'conflict', details: `Conflicted with higher-priority skill "${id}"` });
            } else {
              closureMap.delete(id);
              excluded.push({ id, reasonCode: 'conflict', details: `Conflicted with higher-priority skill "${confId}"` });
            }
          }
        }
      }
    }

    // 7. Token Budget Planner & Capability Clustering
    const BASE_SKILLS = ['ponytail-mindset', 'engineering-workflow'];
    let baseTokens = 0;

    for (const baseId of BASE_SKILLS) {
      if (!profileExcluded.has(baseId)) {
        baseTokens += skillsDict[baseId]?.estimatedTokens || 800;
      }
    }

    let allocatedDynamicTokens = 0;
    const admitted = new Map(); // id -> candidate entry

    // Separate mandatory vs optional candidates
    const mandatoryCandidates = [];
    const optionalCandidates = [];

    for (const cand of closureMap.values()) {
      const isMandatory = cand.reasons.some(r => r.kind === 'explicit' || r.kind === 'profile_required');
      if (isMandatory) {
        mandatoryCandidates.push(cand);
      } else {
        optionalCandidates.push(cand);
      }
    }

    // Sort optional candidates by priorityScore descending, then score descending, then lexical ID
    optionalCandidates.sort((a, b) => b.priorityScore - a.priorityScore || b.score - a.score || a.id.localeCompare(b.id));

    // Phase 1: Admit mandatory candidates and their dependency closures unconditionally
    for (const cand of mandatoryCandidates) {
      if (admitted.has(cand.id)) continue;

      const reqs = getTransitiveDeps(cand.id, depGraph, profileExcluded);
      const cluster = [cand.id, ...reqs.filter(d => !admitted.has(d))];

      for (const sId of cluster) {
        const entry = closureMap.get(sId) || {
          id: sId,
          displayName: skillsDict[sId]?.displayName || sId,
          score: 100,
          priorityScore: 1000,
          reasons: [{ kind: 'dependency', weight: 100, reason: `Required by "${cand.id}"` }],
          requiredBy: [cand.id],
          estimatedTokens: closureMap.get(sId)?.estimatedTokens || Math.min(skillsDict[sId]?.estimatedTokens || 1000, BUDGET_TIERS.SKILL_BODY),
        };
        admitted.set(sId, entry);
        if (!BASE_SKILLS.includes(sId)) {
          allocatedDynamicTokens += entry.estimatedTokens;
        }
      }

      if (allocatedDynamicTokens > budgetTokens) {
        warnings.push({
          code: 'CTX_RESOLVER_BUDGET_EXCEEDED',
          message: `Context budget (${budgetTokens} tokens) exceeded by mandatory skill "${cand.id}" and dependencies (total: ${allocatedDynamicTokens} tokens)`,
        });
      }
    }

    // Phase 2: Admit optional candidates with their dependency clusters within budget and maxSkills
    for (const cand of optionalCandidates) {
      if (admitted.has(cand.id)) continue;

      if (admitted.size >= maxSkillsLimit) {
        excluded.push({
          id: cand.id,
          reasonCode: 'max_skills_limit',
          details: `Admitting skill would exceed maxSkills limit (${maxSkillsLimit})`,
        });
        continue;
      }

      const reqs = getTransitiveDeps(cand.id, depGraph, profileExcluded);
      const unadmittedCluster = [cand.id, ...reqs.filter(d => !admitted.has(d))];

      if (maxSkillsLimit !== Infinity && admitted.size + unadmittedCluster.length > maxSkillsLimit) {
        excluded.push({
          id: cand.id,
          reasonCode: 'max_skills_limit',
          details: `Admitting cluster (${unadmittedCluster.length} skills) would exceed maxSkills limit (${maxSkillsLimit})`,
        });
        continue;
      }

      const clusterCost = unadmittedCluster.reduce((sum, sId) => {
        if (BASE_SKILLS.includes(sId)) return sum;
        return sum + (closureMap.get(sId)?.estimatedTokens || Math.min(skillsDict[sId]?.estimatedTokens || 1000, BUDGET_TIERS.SKILL_BODY));
      }, 0);

      if (allocatedDynamicTokens + clusterCost <= budgetTokens) {
        for (const sId of unadmittedCluster) {
          const entry = closureMap.get(sId) || {
            id: sId,
            displayName: skillsDict[sId]?.displayName || sId,
            score: cand.score,
            priorityScore: cand.priorityScore,
            reasons: sId === cand.id ? cand.reasons : [{ kind: 'dependency', weight: 100, reason: `Required by "${cand.id}"` }],
            requiredBy: sId === cand.id ? [] : [cand.id],
            estimatedTokens: closureMap.get(sId)?.estimatedTokens || Math.min(skillsDict[sId]?.estimatedTokens || 1000, BUDGET_TIERS.SKILL_BODY),
          };
          admitted.set(sId, entry);
        }
        allocatedDynamicTokens += clusterCost;
      } else {
        excluded.push({
          id: cand.id,
          reasonCode: 'budget_exceeded',
          details: `Adding skill and required dependencies (${clusterCost} tokens) would exceed budget (${budgetTokens} tokens)`,
        });
      }
    }

    // 8. Foundational skills integration
    const finalSelected = Array.from(admitted.values());
    const allSelectedIds = finalSelected.map(s => s.id);

    for (const baseId of BASE_SKILLS) {
      if (!profileExcluded.has(baseId) && !allSelectedIds.includes(baseId)) {
        allSelectedIds.unshift(baseId);
        finalSelected.unshift({
          id: baseId,
          displayName: skillsDict[baseId]?.displayName || baseId,
          score: 100,
          priorityScore: 1000,
          reasons: [{ kind: 'foundation', weight: 100, reason: 'Core skill' }],
          requiredBy: [],
          estimatedTokens: skillsDict[baseId]?.estimatedTokens || 800,
        });
      }
    }

    // 9. Domain, Phase & Role
    let domain = request.domain || '';
    if (!domain) {
      const isFrontend = allSelectedIds.includes('react') || allSelectedIds.includes('nextjs') || allSelectedIds.includes('ui-ux-pro');
      const isBackend = allSelectedIds.includes('database') || allSelectedIds.includes('fastapi') || allSelectedIds.includes('nestjs') || allSelectedIds.includes('node') || allSelectedIds.includes('system-design');
      if (isFrontend && isBackend) domain = 'Full-Stack';
      else if (isFrontend) domain = 'Frontend';
      else if (isBackend) domain = 'Backend';
      else if (allSelectedIds.includes('docker')) domain = 'DevOps';
      else domain = 'Architecture';
    }

    const { phase, role } = resolvePhaseAndRole(explicitPhase, task, allSelectedIds);

    // Streamlined execution modes (Section 14.2)
    let mode = request.mode || request.explicitMode || null;
    if (!mode) {
      const pVal = typeof phase === 'object' ? phase.value : phase;
      if (pVal === 'Define' || pVal === 'Plan') mode = MODES.DISCOVER;
      else if (pVal === 'Build') mode = MODES.CHANGE;
      else if (pVal === 'Verify') mode = MODES.VERIFY;
      else if (pVal === 'Review' || pVal === 'Ship') mode = MODES.REVIEW;
      else mode = MODES.CHANGE;
    }

    // Review lenses
    const reviewLenses = [];
    if (allSelectedIds.includes('security') || risk.value === 'high' || risk.value === 'destructive') {
      reviewLenses.push('security');
    }
    if (allSelectedIds.includes('database')) {
      reviewLenses.push('database');
    }
    if (allSelectedIds.includes('web-accessibility') || allSelectedIds.includes('ui-ux-pro')) {
      reviewLenses.push('accessibility');
    }
    if (allSelectedIds.includes('performance') || allSelectedIds.includes('vercel-optimize')) {
      reviewLenses.push('performance');
    }
    if (allSelectedIds.includes('system-design') || allSelectedIds.includes('ddd') || allSelectedIds.includes('microservices')) {
      reviewLenses.push('architecture');
    }
    if (reviewLenses.length === 0) {
      reviewLenses.push('general-code-quality');
    }

    // Rule catalog integration (Section 14.1 & 14.6)
    let applicableRules = [];
    try {
      const { RuleCatalog } = require('../rules/rule-catalog.js');
      const catalog = new RuleCatalog({ rootDir: projectRoot });
      if (this.registry) {
        catalog.loadFromRegistry(this.registry);
      }
      applicableRules = catalog.getAllRules().filter(r =>
        allSelectedIds.includes(r.sourceSkill) || r.applicability.includes('all')
      );
    } catch {
      // ignore
    }

    return {
      registryFingerprint: this.registry?.sourceGraphHash || 'none',
      workspaceFingerprint: workspaceGraph?.fingerprint || crypto.createHash('md5').update(projectRoot).digest('hex'),
      workspaceGraph: workspaceGraph || null,
      domain,
      phase,
      mode,
      reviewLenses,
      role,
      risk,
      workflow: risk.workflow,
      rules: applicableRules,
      selected: finalSelected,
      excluded,
      conflicts,
      warnings,
      totalEstimatedTokens: baseTokens + allocatedDynamicTokens,
      // Legacy compatibility properties
      skills: allSelectedIds,
    };
  }

  /**
   * Formats execution declaration header matching AGENTS.md standard.
   */
  formatDeclaration(res) {
    const phaseStr = typeof res.phase === 'object' ? res.phase.value : res.phase;
    const modeStr = res.mode || 'CHANGE';
    const lensesStr = Array.isArray(res.reviewLenses) && res.reviewLenses.length > 0
      ? res.reviewLenses.join(', ')
      : 'general';
    const riskStr = res.risk?.value || 'standard';
    const skillsList = (res.skills || []).join(', ');

    const lines = [
      `[DOMAIN: ${res.domain}] [PHASE: ${phaseStr}] [ROLE: ${res.role}] [MODE: ${modeStr}] [LENSES: ${lensesStr}] [RISK: ${riskStr}]`,
      `Skills loaded: ${skillsList}`,
    ];
    if (res.workflow && res.workflow.steps && res.workflow.steps.length > 0) {
      lines.push(`Workflow (${res.workflow.name}): ${res.workflow.steps[0]}`);
    }
    return lines.join('\n');
  }

  /**
   * Formats detailed explainability report for --explain flag.
   */
  formatExplanation(res) {
    const lines = [];
    const phaseStr = typeof res.phase === 'object' ? res.phase.value : res.phase;
    lines.push('══════════════════════════════════════════');
    lines.push('  ContextOS — Dynamic Skill Resolution');
    lines.push('══════════════════════════════════════════');
    lines.push(`[DOMAIN: ${res.domain}] [PHASE: ${phaseStr}] [ROLE: ${res.role}] [MODE: ${res.mode}] [LENSES: ${(res.reviewLenses || []).join(', ')}] [RISK: ${res.risk?.value || 'standard'}]`);
    lines.push(`Registry: ${(res.registryFingerprint || '').slice(0, 19)}... | Estimated Budget: ~${res.totalEstimatedTokens} tokens\n`);

    if (res.workflow) {
      lines.push(`Workflow: ${res.workflow.name} — ${res.workflow.summary}`);
      for (const st of res.workflow.steps) {
        lines.push(`  → ${st}`);
      }
      lines.push('');
    }

    lines.push('Selected Skills:');
    for (const item of res.selected) {
      const reasonsStr = (item.reasons || []).map(r => `${r.kind}: ${r.reason}`).join('; ');
      lines.push(`  ✓ ${item.id.padEnd(22)} score: ${String(item.score).padStart(3)}  tokens: ~${item.estimatedTokens}  (${reasonsStr})`);
    }

    if (res.excluded && res.excluded.length > 0) {
      lines.push('\nExcluded Skills:');
      for (const ex of res.excluded) {
        lines.push(`  ✗ ${ex.id.padEnd(22)} [${ex.reasonCode}] ${ex.details}`);
      }
    }

    if (res.rules && res.rules.length > 0) {
      lines.push('\nApplicable Rules:');
      for (const r of res.rules.slice(0, 10)) {
        const enf = r.enforcement === 'ENFORCED' ? `[ENFORCED: ${r.checker}]` : `[${r.enforcement}]`;
        lines.push(`  • ${r.id.padEnd(10)} ${enf.padEnd(25)} ${r.summary.slice(0, 60)}`);
      }
      if (res.rules.length > 10) {
        lines.push(`    ... and ${res.rules.length - 10} more rules`);
      }
    }

    if (res.conflicts && res.conflicts.length > 0) {
      lines.push('\nConflicts:');
      for (const c of res.conflicts) {
        lines.push(`  ⚠ ${c.skillA} <-> ${c.skillB}: ${c.reason}`);
      }
    }

    if (res.warnings && res.warnings.length > 0) {
      lines.push('\nWarnings:');
      for (const w of res.warnings) {
        lines.push(`  ▲ [${w.code}] ${w.message}`);
      }
    }

    lines.push('──────────────────────────────────────────');
    return lines.join('\n');
  }

  /**
   * Builds progressive skills index for quick searching.
   */
  buildSkillIndex(projectDir = this.rootDir) {
    const skills = [];
    const skillsDict = this.registry?.skills || {};

    if (Object.keys(skillsDict).length > 0) {
      for (const [id, s] of Object.entries(skillsDict)) {
        skills.push({
          name: id,
          description: s.description || `ContextOS skill for ${s.displayName || id}`,
          path: s.source ? `${s.source.replace(/\\/g, '/')}/${s.entrypoint || 'SKILL.md'}` : `.agents/core/skills/${id}/SKILL.md`,
        });
      }
      return skills.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Fallback: directory traversal
    const coreDir = path.join(projectDir, '.agents', 'core', 'skills');
    if (fs.existsSync(coreDir)) {
      const dirs = fs.readdirSync(coreDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          skills.push({
            name: d.name,
            description: `ContextOS skill for ${d.name}`,
            path: `.agents/core/skills/${d.name}/SKILL.md`,
          });
        }
      }
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }
}

module.exports = {
  CanonicalResolver,
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  BUDGET_TIERS,
  WORKFLOW_TEMPLATES,
  MODES,
  DEPRECATED_ALIASES,
  WEIGHTS,
  analyzeImportGraph,
  evaluateRisk,
  resolvePhaseAndRole,
};
