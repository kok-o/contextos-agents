/**
 * .agents/stats.js
 * ContextOS — Rule Payload Size Report
 *
 * Measures:
 *   1. Full context payload (all skills + AGENTS.md)
 *   2. Profiled context payload (after applying active profile exclusions)
 *   3. Dynamically resolved context (lean on-demand skill set for typical tasks)
 *   4. Character-based payload estimates, not provider billing or quality results
 */

'use strict';

const fs = require('fs');
const path = require('path');
const profiles = require('./profiles.js');

function estimateTokens(text) {
  // Common heuristic across GPT-4, Claude, Gemini: ~4 characters per token
  return Math.max(1, Math.round(text.length / 4));
}

function calculateContextStats(projectDir = process.cwd()) {
  const agentsDir = path.join(projectDir, '.agents');
  const agentsMdPath = path.join(agentsDir, 'AGENTS.md');

  let agentsMdChars = 0;
  if (fs.existsSync(agentsMdPath)) {
    agentsMdChars = fs.readFileSync(agentsMdPath, 'utf8').length;
  }

  const skillCharMap = new Map();
  const { collectSkillDirectories } = require('./adapters/shared.js');
  const allDirs = collectSkillDirectories({ exclude_skills: [] }, projectDir);
  for (const directory of allDirs) {
      const skillMd = path.join(directory, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        skillCharMap.set(path.basename(directory), fs.readFileSync(skillMd, 'utf8').length);
      }
  }

  const totalSkillCount = skillCharMap.size;
  let fullChars = agentsMdChars;
  for (const chars of skillCharMap.values()) {
    fullChars += chars;
  }

  // Active profile
  const activeProfile = profiles.getActiveProfile(projectDir);
  const profileName = activeProfile ? (activeProfile.name || activeProfile.profile) : 'none';
  const excludedSkills = new Set(
    activeProfile ? activeProfile.exclude_skills || [] : []
  );

  let profileChars = agentsMdChars;
  let profiledSkillCount = 0;
  for (const [skill, chars] of skillCharMap) {
    if (!excludedSkills.has(skill)) {
      profileChars += chars;
      profiledSkillCount++;
    }
  }

  // Resolved context: dynamically resolved skills for this project's stack
  let candidateResolvedSkills = ['engineering-workflow', 'ponytail-mindset'];
  try {
    const resolver = require('./resolver.js');
    const resolved = resolver.resolveSkills({ prompt: 'Implement standard feature', projectDir });
    if (resolved && Array.isArray(resolved.skills) && resolved.skills.length > 0) {
      candidateResolvedSkills = resolved.skills;
    }
  } catch (_) {
    candidateResolvedSkills = ['engineering-workflow', 'ponytail-mindset'];
  }

  // Only consider skills physically present on disk
  const typicalResolvedSkills = candidateResolvedSkills.filter(s => skillCharMap.has(s));

  let resolvedChars = agentsMdChars;
  let resolvedSkillCount = typicalResolvedSkills.length;
  for (const s of typicalResolvedSkills) {
    resolvedChars += skillCharMap.get(s);
  }

  const fullTokens = estimateTokens({ length: fullChars });
  const profileTokens = estimateTokens({ length: profileChars });
  const resolvedTokens = estimateTokens({ length: resolvedChars });

  const profileSavings = fullTokens > 0 ? (((fullTokens - profileTokens) / fullTokens) * 100).toFixed(1) : '0.0';
  const resolvedSavings = fullTokens > 0 ? (((fullTokens - resolvedTokens) / fullTokens) * 100).toFixed(1) : '0.0';

  return {
    totalSkillCount,
    profiledSkillCount,
    resolvedSkillCount,
    resolvedSkillList: typicalResolvedSkills,
    profileName,
    full: { chars: fullChars, tokens: fullTokens },
    profile: { chars: profileChars, tokens: profileTokens, savings: profileSavings },
    resolved: { chars: resolvedChars, tokens: resolvedTokens, savings: resolvedSavings },
  };
}

function runStats(projectDir = process.cwd()) {
  const stats = calculateContextStats(projectDir);

  console.log('\nContextOS — Rule Payload Size (estimate)\n');
  console.log('┌──────────────────────────────────────┬─────────────┬──────────┐');
  console.log('│ Selection                            │ Est. Tokens │  vs full │');
  console.log('├──────────────────────────────────────┼─────────────┼──────────┤');

  const fullLabel = `All installed (${stats.totalSkillCount} skills)`;
  const fullTok = stats.full.tokens.toLocaleString().padStart(9);
  console.log(`│ ${fullLabel.slice(0, 36).padEnd(36)} │ ${fullTok}   │ baseline │`);

  const profLabel = `After profile ${stats.profileName} (${stats.profiledSkillCount})`;
  const profTok = stats.profile.tokens.toLocaleString().padStart(9);
  const profSav = `${stats.profile.savings}%`.padStart(7);
  console.log(`│ ${profLabel.slice(0, 36).padEnd(36)} │ ${profTok}   │  ${profSav} │`);

  const resLabel = `Sample task selection (${stats.resolvedSkillCount})`;
  const resTok = stats.resolved.tokens.toLocaleString().padStart(9);
  const resSav = `${stats.resolved.savings}%`.padStart(7);
  console.log(`│ ${resLabel.slice(0, 36).padEnd(36)} │ ${resTok}   │  ${resSav} │`);

  console.log('└──────────────────────────────────────┴─────────────┴──────────┘');
  console.log(`Sample task selection: ${stats.resolvedSkillList.join(', ') || '(none installed)'}`);
  console.log('\nEstimate: about 4 characters per token.');
  console.log('The last row selects skills for the fixed prompt "Implement standard feature". Exports do not');
  console.log('use a task selection: they contain every installed rule the profile allows, so the first two');
  console.log('rows describe what exports carry. This report measures size only, not answer quality, cost or time.\n');

  return stats;
}

if (require.main === module) {
  runStats();
}

module.exports = {
  calculateContextStats,
  runStats,
  estimateTokens,
};
