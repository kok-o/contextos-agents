/**
 * benchmarks/v2/arms/arm-definitions.js
 * ContextOS Benchmark v2 — Evaluation Arms Specification
 *
 * Current pilot arms. Arm C is the ContextOS product-context treatment; Arm D
 * adds prompt-only workflow/risk guidance without executing the agent pipeline.
 */

'use strict';

const ARMS = {
  ARM_A_VANILLA: {
    id: 'arm-a-vanilla',
    name: 'Vanilla Baseline',
    description: 'Neutral baseline system prompt without ContextOS rules or checklists.',
    buildSystemPrompt: () => {
      return 'You are an expert software engineer. Write clean, complete, working production code that solves the user request.';
    },
  },

  ARM_B_CONCISE_CHECKLIST: {
    id: 'arm-b-concise-checklist',
    name: 'Concise Checklist',
    description: 'Generic 12-rule engineering checklist; comparator for product-specific context.',
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
    name: 'ContextOS Resolver + Installed Skills',
    description: 'Prompt context produced from the canonical resolver and installed skill documents.',
    buildSystemPrompt: (resolvedSkills = []) => {
      const skillsHeader = resolvedSkills.length > 0
        ? `[ContextOS Resolved Skills: ${resolvedSkills.join(', ')}]`
        : '[ContextOS Core]';
      return `${skillsHeader}\nExecute task adhering to compiled workspace rules and exact skill invariants.`;
    },
  },

  ARM_D_EXPANDED_GUIDANCE: {
    id: 'arm-d-expanded-guidance',
    name: 'Expanded ContextOS Guidance (Prompt-only)',
    description: 'Arm C context plus additional risk and workflow instructions; no separate agent, worktree, or reviewer runs.',
    buildSystemPrompt: (resolvedSkills = [], riskLevel = 'STANDARD') => {
      return [
        `[Expanded ContextOS Guidance] [RISK: ${riskLevel}] [Skills: ${resolvedSkills.join(', ')}]`,
        'Classify risk, follow the applicable workflow, and check the implementation against the task contract before responding.',
      ].join('\n');
    },
  },
};

module.exports = {
  ARMS,
};
