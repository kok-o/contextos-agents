/**
 * .agents/stats.js
 * ContextOS — Context Savings & Token Optimization Report
 *
 * Measures:
 *   1. Full context payload (all skills + AGENTS.md)
 *   2. Profiled context payload (after applying active profile exclusions)
 *   3. Dynamically resolved context (lean on-demand skill set for typical tasks)
 *   4. Concrete token savings percentage and cost reductions
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
  const skillsDir = path.join(agentsDir, 'core', 'skills');
  const agentsMdPath = path.join(agentsDir, 'AGENTS.md');

  let agentsMdChars = 0;
  if (fs.existsSync(agentsMdPath)) {
    agentsMdChars = fs.readFileSync(agentsMdPath, 'utf8').length;
  }

  const skillCharMap = new Map();
  if (fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        skillCharMap.set(entry.name, fs.readFileSync(skillMd, 'utf8').length);
      }
    }
  }

  const totalSkillCount = skillCharMap.size;
  let fullChars = agentsMdChars;
  for (const chars of skillCharMap.values()) {
    fullChars += chars;
  }

  // Active profile
  const activeProfile = profiles.getActiveProfile(projectDir);
  const profileName = activeProfile ? (activeProfile.name || activeProfile.profile) : 'startup (recommended)';
  const excludedSkills = new Set(
    activeProfile ? activeProfile.exclude_skills || [] : (profiles.getProfile('startup')?.exclude_skills || [])
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
  let typicalResolvedSkills = ['engineering-workflow', 'ponytail-mindset'];
  try {
    const resolver = require('./resolver.js');
    const resolved = resolver.resolveSkills({ prompt: 'Implement standard feature', projectDir });
    if (resolved && Array.isArray(resolved.skills)) {
      typicalResolvedSkills = resolved.skills;
    }
  } catch (_) {
    typicalResolvedSkills = ['engineering-workflow', 'ponytail-mindset', 'react', 'ui-ux-pro'];
  }

  let resolvedChars = agentsMdChars;
  let resolvedSkillCount = 0;
  for (const s of typicalResolvedSkills) {
    if (skillCharMap.has(s)) {
      resolvedChars += skillCharMap.get(s);
      resolvedSkillCount++;
    }
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

  console.log('\nContextOS — Context Savings Report & Payload Reduction\n');
  console.log('┌──────────────────────────────────────┬─────────────┬──────────┐');
  console.log('│ Context Mode                         │ Est. Tokens │  Savings │');
  console.log('├──────────────────────────────────────┼─────────────┼──────────┤');

  const fullLabel = `Full (${stats.totalSkillCount} skills catalog)`;
  const fullTok = stats.full.tokens.toLocaleString().padStart(9);
  console.log(`│ ${fullLabel.slice(0, 36).padEnd(36)} │ ${fullTok}   │ baseline │`);

  const profLabel = `Profile: ${stats.profileName} (${stats.profiledSkillCount} skills)`;
  const profTok = stats.profile.tokens.toLocaleString().padStart(9);
  const profSav = `${stats.profile.savings}%`.padStart(7);
  console.log(`│ ${profLabel.slice(0, 36).padEnd(36)} │ ${profTok}   │  ${profSav} │`);

  const resLabel = `Dynamic: resolved task (${stats.resolvedSkillCount} skills)`;
  const resTok = stats.resolved.tokens.toLocaleString().padStart(9);
  const resSav = `${stats.resolved.savings}%`.padStart(7);
  console.log(`│ ${resLabel.slice(0, 36).padEnd(36)} │ ${resTok}   │  ${resSav} │`);

  console.log('└──────────────────────────────────────┴─────────────┴──────────┘');
  console.log(`Resolved skills for project: ${stats.resolvedSkillList.join(', ')}`);
  console.log('\nNote: Character-based token estimation (~4 chars/token heuristic).');
  console.log('Measures static rule payload reduction against an uncurated full-catalog dump.');
  console.log('Real workflow cost savings depend on prompt turns, model tokenizer, and task complexity.\n');

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
