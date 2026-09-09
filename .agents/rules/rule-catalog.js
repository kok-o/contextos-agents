/**
 * .agents/rules/rule-catalog.js
 * ContextOS — Rule Catalog, Instruction Inventory & Enforcement Engine (Milestone 9)
 *
 * Implements:
 *   - Comprehensive rule inventory tracking (id, skill, summary, level, enforcement, checker)
 *   - Automated checker registry (runtime, linter, scanner, compiler)
 *   - Enforcement levels: ENFORCED, PARTIALLY_ENFORCED, PROMPT_GUIDANCE, REFERENCE, EXAMPLE
 *   - Invariant check: "A rule existing only in Markdown is NOT ENFORCED (requires automated checker)"
 *   - Rule explanation formatting for `ctx explain`
 *   - Parity with compiled registry and manifest declarations
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Standard enforcement levels
 */
const ENFORCEMENT_LEVELS = {
  ENFORCED: 'ENFORCED',                     // Backed by deterministic runtime/linter checker
  PARTIALLY_ENFORCED: 'PARTIALLY_ENFORCED', // Heuristic checker or partial automated guard
  PROMPT_GUIDANCE: 'PROMPT_GUIDANCE',       // Normative natural language prompt instruction
  REFERENCE: 'REFERENCE',                   // Architecture reference or pattern guide
  EXAMPLE: 'EXAMPLE',                       // Code snippet or reference illustration
};

/**
 * Normalizes enforcement strings to standard uppercase ENFORCEMENT_LEVELS
 */
function normalizeEnforcement(val) {
  if (!val) return ENFORCEMENT_LEVELS.PROMPT_GUIDANCE;
  const s = String(val).trim().toUpperCase().replace(/-/g, '_');
  if (s === 'RUNTIME' || s === 'LINTER' || s === 'ENFORCED') return ENFORCEMENT_LEVELS.ENFORCED;
  if (s === 'PARTIAL' || s === 'PARTIALLY_ENFORCED') return ENFORCEMENT_LEVELS.PARTIALLY_ENFORCED;
  if (s === 'PROMPT' || s === 'PROMPT_GUIDANCE' || s === 'GUIDANCE') return ENFORCEMENT_LEVELS.PROMPT_GUIDANCE;
  if (s === 'REFERENCE' || s === 'DOCS') return ENFORCEMENT_LEVELS.REFERENCE;
  if (s === 'EXAMPLE') return ENFORCEMENT_LEVELS.EXAMPLE;
  return ENFORCEMENT_LEVELS.PROMPT_GUIDANCE;
}

/**
 * Registered automated checkers in ContextOS
 */
const AUTOMATED_CHECKERS = {
  'workspace-path-policy-v2': {
    id: 'workspace-path-policy-v2',
    name: 'Workspace Path Policy Guard v2',
    description: 'Enforces directory containment, blocks traversal, NUL-bytes, and symlink escapes in safe-path.js',
    type: 'runtime',
    module: '.agents/filesystem/safe-path.js',
  },
  'project-mutation-lock': {
    id: 'project-mutation-lock',
    name: 'Project Mutation Lock Engine',
    description: 'Enforces cross-process advisory mutation locking preventing concurrent write corruption',
    type: 'runtime',
    module: '.agents/filesystem/project-lock.js',
  },
  'journaled-transaction-recovery': {
    id: 'journaled-transaction-recovery',
    name: 'Journaled Transaction & Rollback Recovery',
    description: 'Atomically stages file mutations with write-ahead intent log and rollback crash recovery',
    type: 'runtime',
    module: '.agents/filesystem/journaled-transaction.js',
  },
  'lockfile-cas-integrity': {
    id: 'lockfile-cas-integrity',
    name: 'Lockfile v2 CAS Integrity Checker',
    description: 'Cryptographically verifies Content Addressable Storage hashes for all managed project artifacts',
    type: 'runtime',
    module: '.agents/filesystem/lockfile-v2.js',
  },
  'secret-scanner': {
    id: 'secret-scanner',
    name: 'Automated Secret & Credential Scanner',
    description: 'Pre-commit and doctor scan detecting private keys, AWS/GCP/OpenAI credentials, and tokens',
    type: 'scanner',
    module: 'scripts/check-secrets.js',
  },
  'adapter-drift-detector': {
    id: 'adapter-drift-detector',
    name: 'Adapter Output Provenance & Drift Detector',
    description: 'Detects unauthorized manual modifications and upstream drift in generated agent adapter configs',
    type: 'runtime',
    module: '.agents/adapters/drift-detector.js',
  },
  'manifest-schema-validator': {
    id: 'manifest-schema-validator',
    name: 'Skill Manifest Schema v2 Compiler Validator',
    description: 'Fails closed on schema violations, invalid paths, and frontmatter divergence',
    type: 'compiler',
    module: '.agents/compiler/manifest-compiler.js',
  },
  'skill-frontmatter-validator': {
    id: 'skill-frontmatter-validator',
    name: 'Skill Frontmatter & COSTAR Quality Validator',
    description: 'Verifies YAML frontmatter integrity, minimum content sizes, and COSTAR formatting in SKILL.md',
    type: 'linter',
    module: '.agents/validate.js',
  },
  'profile-integrity-validator': {
    id: 'profile-integrity-validator',
    name: 'Profile Integrity & Exclusion Validator',
    description: 'Validates profile definitions, required skills, exclusions, and scoped package configurations',
    type: 'compiler',
    module: '.agents/profiles.js',
  },
  'watch-coalescing-guard': {
    id: 'watch-coalescing-guard',
    name: 'Watch Event Coalescing & Race Guard',
    description: 'Coalesces rapid file modification bursts and synchronizes compilations under project lock',
    type: 'runtime',
    module: '.agents/watch.js',
  },
};

/**
 * Built-in core normative rules inventory
 */
const BUILTIN_RULES = [
  {
    id: 'SEC-001',
    sourceSkill: 'security',
    level: 'must',
    enforcement: 'prompt-guidance',
    summary: 'Always validate and sanitize all user input and untrusted external payloads before processing',
    applicability: ['api', 'controllers', 'forms', 'inputs'],
    priority: 90,
    tokenCost: 45,
    duplicates: ['SEC-AGENT-006'],
    conflicts: [],
  },
  {
    id: 'SEC-002',
    sourceSkill: 'security',
    level: 'must',
    enforcement: 'runtime',
    checker: 'secret-scanner',
    summary: 'Zero plaintext credentials, private keys, or API tokens committed to repository',
    applicability: ['all'],
    priority: 100,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'SEC-003',
    sourceSkill: 'security',
    level: 'must',
    enforcement: 'prompt-guidance',
    summary: 'Enforce authentication and authorization checks prior to accessing sensitive resources or data',
    applicability: ['routes', 'services', 'database'],
    priority: 95,
    tokenCost: 40,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'FS-001',
    sourceSkill: 'filesystem',
    level: 'must',
    enforcement: 'runtime',
    checker: 'workspace-path-policy-v2',
    summary: 'Restrict all filesystem mutations strictly inside project root; prevent directory traversal',
    applicability: ['filesystem', 'adapters', 'init'],
    priority: 100,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'FS-002',
    sourceSkill: 'filesystem',
    level: 'must',
    enforcement: 'runtime',
    checker: 'project-mutation-lock',
    summary: 'Cross-process write operations must acquire project mutation lock to prevent concurrent races',
    applicability: ['cli', 'adapters', 'watch', 'init'],
    priority: 95,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'FS-003',
    sourceSkill: 'filesystem',
    level: 'must',
    enforcement: 'runtime',
    checker: 'journaled-transaction-recovery',
    summary: 'Multi-file modifications must execute within journaled transaction with atomic rollback capability',
    applicability: ['adapters', 'init', 'update'],
    priority: 95,
    tokenCost: 40,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'ADAPT-001',
    sourceSkill: 'adapters',
    level: 'must',
    enforcement: 'runtime',
    checker: 'adapter-drift-detector',
    summary: 'Adapter compiler must produce deterministic output with provenance headers and detect drift',
    applicability: ['adapters', 'export'],
    priority: 90,
    tokenCost: 40,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'LOCK-001',
    sourceSkill: 'filesystem',
    level: 'must',
    enforcement: 'runtime',
    checker: 'lockfile-cas-integrity',
    summary: 'Managed files in lockfile must match SHA-256 CAS content hashes with fail-closed integrity',
    applicability: ['lockfile', 'doctor'],
    priority: 95,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'ARCH-001',
    sourceSkill: 'system-design',
    level: 'must',
    enforcement: 'prompt-guidance',
    summary: 'Business domain logic must never reside directly inside API route handlers or UI components',
    applicability: ['routes', 'api', 'controllers'],
    priority: 85,
    tokenCost: 40,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'ARCH-002',
    sourceSkill: 'decisions',
    level: 'should',
    enforcement: 'reference',
    summary: 'Record significant architectural choices and trade-offs in Architecture Decision Records (docs/decisions/)',
    applicability: ['architecture', 'docs'],
    priority: 70,
    tokenCost: 30,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'WORK-001',
    sourceSkill: 'engineering-workflow',
    level: 'must',
    enforcement: 'runtime',
    checker: 'manifest-schema-validator',
    summary: 'All skill manifests must strictly conform to schema v2 with fail-closed validation',
    applicability: ['skills', 'manifests'],
    priority: 95,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'WORK-002',
    sourceSkill: 'engineering-workflow',
    level: 'must',
    enforcement: 'prompt-guidance',
    summary: 'Follow risk-based workflows: routine tasks fast-track, standard plan, high requires spec & review',
    applicability: ['workflow', 'all'],
    priority: 90,
    tokenCost: 50,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'TEST-001',
    sourceSkill: 'testing',
    level: 'must',
    enforcement: 'runtime',
    checker: 'skill-frontmatter-validator',
    summary: 'Zero unverified claims: mandatory proof-of-work with automated test suite and validator execution',
    applicability: ['all'],
    priority: 100,
    tokenCost: 45,
    duplicates: [],
    conflicts: [],
  },
  {
    id: 'PON-001',
    sourceSkill: 'ponytail-mindset',
    level: 'must',
    enforcement: 'prompt-guidance',
    summary: 'Surgical blast radius: modify only files planned for the task; zero unnecessary boilerplate',
    applicability: ['all'],
    priority: 90,
    tokenCost: 35,
    duplicates: [],
    conflicts: [],
  },
];

/**
 * Class representing the Rule Catalog and Instruction Inventory
 */
class RuleCatalog {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.checkers = { ...AUTOMATED_CHECKERS, ...(options.customCheckers || {}) };
    this.rules = new Map();

    // Register builtin rules
    for (const rule of BUILTIN_RULES) {
      this.registerRule(rule);
    }
  }

  /**
   * Registers a rule in the catalog, validating the enforcement invariant.
   */
  registerRule(rule) {
    if (!rule || !rule.id) {
      throw new Error('Rule registration requires a valid rule object with an "id" property.');
    }

    const enforcement = normalizeEnforcement(rule.enforcement);

    // INVARIANT (Section 14.1): A rule existing only in Markdown cannot be ENFORCED.
    if (enforcement === ENFORCEMENT_LEVELS.ENFORCED) {
      if (!rule.checker) {
        throw new Error(`Rule '${rule.id}' cannot be marked ENFORCED without a registered automated checker.`);
      }
      if (!this.checkers[rule.checker]) {
        throw new Error(`Rule '${rule.id}' references unknown checker '${rule.checker}'. Registered checkers: ${Object.keys(this.checkers).join(', ')}`);
      }
    }

    const normalized = {
      id: rule.id,
      sourceSkill: rule.sourceSkill || 'core',
      level: rule.level || 'must',
      enforcement,
      checker: enforcement === ENFORCEMENT_LEVELS.ENFORCED ? rule.checker : (rule.checker || null),
      summary: rule.summary || '',
      applicability: Array.isArray(rule.applicability) ? rule.applicability : ['all'],
      priority: typeof rule.priority === 'number' ? rule.priority : 50,
      tokenCost: typeof rule.tokenCost === 'number' ? rule.tokenCost : 40,
      duplicates: Array.isArray(rule.duplicates) ? rule.duplicates : [],
      conflicts: Array.isArray(rule.conflicts) ? rule.conflicts : [],
    };

    this.rules.set(normalized.id, normalized);
    return normalized;
  }

  /**
   * Loads rules declared inside compiled registry or skills directory
   */
  loadFromRegistry(registry) {
    if (!registry || !registry.skills) return;

    for (const [skillId, skill] of Object.entries(registry.skills)) {
      if (Array.isArray(skill.rules)) {
        for (const r of skill.rules) {
          try {
            this.registerRule({
              ...r,
              sourceSkill: skillId,
            });
          } catch (err) {
            // Log warning on invalid manifest rule
          }
        }
      }
    }
  }

  /**
   * Retrieves a rule by ID
   */
  getRule(id) {
    return this.rules.get(id) || null;
  }

  /**
   * Returns all rules as an array
   */
  getAllRules() {
    return Array.from(this.rules.values());
  }

  /**
   * Returns all registered automated checkers
   */
  getAllCheckers() {
    return Object.values(this.checkers);
  }

  /**
   * Formats detailed explanation for a single rule
   */
  explainRule(id) {
    const rule = this.getRule(id);
    if (!rule) {
      return `Rule '${id}' not found in catalog. Run 'contextos explain --rules' to list all rules.`;
    }

    const lines = [];
    lines.push('\n══════════════════════════════════════════');
    lines.push(`  ContextOS — Rule Explanation: ${rule.id}`);
    lines.push('══════════════════════════════════════════\n');
    lines.push(`  Rule ID          : ${rule.id}`);
    lines.push(`  Source Skill     : ${rule.sourceSkill}`);
    lines.push(`  Level            : ${rule.level.toUpperCase()}`);
    lines.push(`  Enforcement      : ${rule.enforcement}`);

    if (rule.enforcement === ENFORCEMENT_LEVELS.ENFORCED) {
      const checker = this.checkers[rule.checker];
      lines.push(`  Active Checker   : [ENFORCED] ${rule.checker}`);
      if (checker) {
        lines.push(`  Checker Module   : ${checker.module}`);
        lines.push(`  Checker Purpose  : ${checker.description}`);
      }
    } else {
      lines.push(`  Enforcement Note : Governed via agent prompt guidelines (No runtime checker)`);
    }

    lines.push(`  Summary          : ${rule.summary}`);
    lines.push(`  Applicability    : ${rule.applicability.join(', ')}`);
    lines.push(`  Estimated Cost   : ~${rule.tokenCost} tokens`);
    lines.push(`  Priority         : ${rule.priority} / 100`);

    if (rule.duplicates.length > 0) {
      lines.push(`  Known Duplicates : ${rule.duplicates.join(', ')} (consolidated)`);
    }
    if (rule.conflicts.length > 0) {
      lines.push(`  Conflicts With   : ${rule.conflicts.join(', ')}`);
    }

    lines.push('\n──────────────────────────────────────────\n');
    return lines.join('\n');
  }

  /**
   * Formats explanation of all rules within a skill
   */
  explainSkill(skillId) {
    const skillRules = this.getAllRules().filter(r => r.sourceSkill === skillId);
    const lines = [];
    lines.push('\n══════════════════════════════════════════');
    lines.push(`  ContextOS — Skill Rules: ${skillId}`);
    lines.push('══════════════════════════════════════════\n');

    if (skillRules.length === 0) {
      lines.push(`  No individual rule IDs declared for '${skillId}'.`);
      lines.push(`  All guidance is delivered as comprehensive skill instructions.`);
    } else {
      lines.push(`  Found ${skillRules.length} declared rule(s):\n`);
      for (const r of skillRules) {
        const checkStr = r.checker ? ` [Checker: ${r.checker}]` : '';
        lines.push(`  • ${r.id} (${r.level.toUpperCase()}) — ${r.enforcement}${checkStr}`);
        lines.push(`    "${r.summary}" (~${r.tokenCost} tokens)`);
      }
    }

    lines.push('\n──────────────────────────────────────────\n');
    return lines.join('\n');
  }

  /**
   * Formats a summary table of all rules
   */
  formatRulesSummary() {
    const lines = [];
    lines.push('\n══════════════════════════════════════════════════════════════════════════════════');
    lines.push('  ContextOS — Instruction Inventory & Rule Enforcement Catalog');
    lines.push('══════════════════════════════════════════════════════════════════════════════════\n');
    lines.push('  RULE ID   | SKILL        | LEVEL | ENFORCEMENT     | CHECKER');
    lines.push('  ──────────┼──────────────┼───────┼─────────────────┼────────────────────────────');

    for (const r of this.getAllRules()) {
      const id = r.id.padEnd(10);
      const skill = r.sourceSkill.slice(0, 12).padEnd(12);
      const level = r.level.toUpperCase().padEnd(5);
      const enf = r.enforcement.slice(0, 15).padEnd(15);
      const checker = r.checker ? r.checker.slice(0, 26) : '— (prompt guidance)';
      lines.push(`  ${id}| ${skill} | ${level} | ${enf} | ${checker}`);
    }

    lines.push('\n  Total rules: ' + this.rules.size);
    const enforcedCount = this.getAllRules().filter(r => r.enforcement === ENFORCEMENT_LEVELS.ENFORCED).length;
    lines.push(`  Enforced via code checkers : ${enforcedCount}`);
    lines.push(`  Governed via prompt        : ${this.rules.size - enforcedCount}`);
    lines.push('\n──────────────────────────────────────────────────────────────────────────────────\n');
    return lines.join('\n');
  }

  /**
   * Formats summary of automated checkers
   */
  formatCheckersSummary() {
    const lines = [];
    lines.push('\n══════════════════════════════════════════════════════════════════════════════════');
    lines.push('  ContextOS — Registered Automated Enforcement Checkers');
    lines.push('══════════════════════════════════════════════════════════════════════════════════\n');

    for (const ch of this.getAllCheckers()) {
      lines.push(`  • ${ch.id} [${ch.type.toUpperCase()}]`);
      lines.push(`    Name   : ${ch.name}`);
      lines.push(`    Module : ${ch.module}`);
      lines.push(`    Role   : ${ch.description}\n`);
    }

    lines.push(`  Total active checkers: ${Object.keys(this.checkers).length}`);
    lines.push('──────────────────────────────────────────────────────────────────────────────────\n');
    return lines.join('\n');
  }
}

module.exports = {
  RuleCatalog,
  ENFORCEMENT_LEVELS,
  AUTOMATED_CHECKERS,
  BUILTIN_RULES,
  normalizeEnforcement,
};
