/**
 * .agents/resolver.js
 * ContextOS — Dynamic Skill Resolver & Progressive Index Engine
 *
 * Unified facade wrapping CanonicalResolver for 100% CLI and MCP parity.
 * Implements evidence-based scoring, transitive closures, token budget planning,
 * and transparent explainability.
 */

'use strict';

const {
  CanonicalResolver,
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  WEIGHTS,
  analyzeImportGraph,
} = require('./resolver/canonical-resolver.js');

/**
 * Resolves the minimal set of skills for a given prompt, file list, and phase.
 *
 * @param {Object} options - Context options
 * @returns {Object} Resolution result
 */
function resolveSkills({ prompt = '', files = [], phase = 'Build', domain = '', projectDir = process.cwd(), maxSkills } = {}) {
  const resolver = new CanonicalResolver({ rootDir: projectDir });
  const result = resolver.resolve({
    task: prompt,
    files,
    explicitPhase: phase,
    domain,
    projectDir,
    maxSkills,
  });

  return {
    domain: result.domain,
    phase: result.phase.value,
    role: result.role,
    skills: result.skills,
    risk: result.risk,
    selected: result.selected,
    excluded: result.excluded,
    conflicts: result.conflicts,
    warnings: result.warnings,
    totalEstimatedTokens: result.totalEstimatedTokens,
    registryFingerprint: result.registryFingerprint,
    workspaceFingerprint: result.workspaceFingerprint,
  };
}

/**
 * Builds a progressive index of installed skills.
 *
 * @param {string} [projectDir=process.cwd()]
 * @returns {Array<{name: string, description: string, path: string}>}
 */
function buildSkillIndex(projectDir = process.cwd()) {
  const resolver = new CanonicalResolver({ rootDir: projectDir });
  return resolver.buildSkillIndex(projectDir);
}

/**
 * Formats resolved skills into a clean ContextOS declaration string matching AGENTS.md.
 *
 * @param {Object} resolution
 * @returns {string}
 */
function formatDeclaration(resolution) {
  const resolver = new CanonicalResolver();
  return resolver.formatDeclaration(resolution);
}

module.exports = {
  CanonicalResolver,
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  WEIGHTS,
  buildSkillIndex,
  resolveSkills,
  analyzeImportGraph,
  formatDeclaration,
};
