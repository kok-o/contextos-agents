/**
 * benchmarks/v2/arms/arm-definitions.js
 * ContextOS Benchmark v2 — Evaluation Arms Specification
 *
 * Implements Section 24.2 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Arm A (Vanilla): Neutral baseline system prompt without artificial debuffing
 *   - Arm B (Concise Checklist): 10-15 universal engineering rules (~600 tokens) — Primary Comparator
 *   - Arm C (ContextOS Core): Dynamic canonical skill resolver without ceremony
 *   - Arm D (Full ContextOS): Resolver + risk workflow + isolated runtime verification + review
 */

'use strict';

const ARMS = {
  ARM_A_VANILLA: {
    id: 'arm-a-vanilla',
    name: 'Vanilla Baseline',
    description: 'Neutral baseline system prompt without ContextOS rules or checklists.',
    tokenBudgetEstimate: 120,
    buildSystemPrompt: () => {
      return 'You are an expert software engineer. Write clean, complete, working production code that solves the user request.';
    },
  },

  ARM_B_CONCISE_CHECKLIST: {
    id: 'arm-b-concise-checklist',
    name: 'Concise Checklist',
    description: 'High-density 12-rule engineering checklist (~600 tokens). Primary comparator.',
    tokenBudgetEstimate: 580,
    buildSystemPrompt: () => {
      return [
        'You are a Senior Staff Engineer.',
        'Follow this strict engineering checklist:',
        '1. Inspect existing files before editing.',
        '2. Never use placeholders, stubs, or TODO comments.',
        '3. Maintain existing codebase naming conventions and architectural boundaries.',
        '4. Minimize blast radius — modify only files required for the task.',
        '5. Validate all user input and sanitize data paths.',
        '6. Use parameterized queries for database operations.',
        '7. Handle all asynchronous error boundaries explicitly.',
        '8. Write comprehensive unit and integration test assertions.',
        '9. Ensure clean TypeScript typing without any unsafe casts.',
        '10. Verify backward compatibility with existing public APIs.',
        '11. No secrets or credentials in code or commits.',
        '12. Ensure code compiles and all tests pass.',
      ].join('\n');
    },
  },

  ARM_C_CONTEXTOS_CORE: {
    id: 'arm-c-contextos-core',
    name: 'ContextOS Core (Dynamic Context Selection)',
    description: 'Dynamic canonical resolver selecting exact skills and rules without ceremony.',
    tokenBudgetEstimate: 1400,
    buildSystemPrompt: (resolvedSkills = []) => {
      const skillsHeader = resolvedSkills.length > 0
        ? `[ContextOS Resolved Skills: ${resolvedSkills.join(', ')}]`
        : '[ContextOS Core]';
      return `${skillsHeader}\nExecute task adhering to compiled workspace rules and exact skill invariants.`;
    },
  },

  ARM_D_FULL_CONTEXTOS: {
    id: 'arm-d-full-contextos',
    name: 'Full ContextOS (Core + Runtime Verification)',
    description: 'Dynamic resolver + risk-based workflow + isolated runtime verification + reviewer pipeline.',
    tokenBudgetEstimate: 2200,
    buildSystemPrompt: (resolvedSkills = [], riskLevel = 'STANDARD') => {
      return [
        `[ContextOS Full Runtime] [RISK: ${riskLevel}] [Skills: ${resolvedSkills.join(', ')}]`,
        'Execution gated by isolated worktree and mandatory verification attestations before merge readiness.',
      ].join('\n');
    },
  },
};

module.exports = {
  ARMS,
};
