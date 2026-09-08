/**
 * bin/lib/detector.js
 * ContextOS — Full Stack & IDE Environment Detector
 *
 * Inspects the target repository to detect:
 *   1. Project tech stack (Next.js, React, NestJS, FastAPI, etc.)
 *   2. Active developer IDE / agent tools (Cursor, Claude, Zed, VSCode Copilot, Gemini)
 *   3. Recommended profile and auto-export adapter targets
 */

'use strict';

const fs = require('fs');
const path = require('path');
const profiles = require('../../.agents/profiles.js');

/**
 * Detects active IDEs and AI assistant configs in the project.
 *
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @returns {{ detected: string[], recommendedAgents: string[] }}
 */
function detectIdeEnvironment(projectDir = process.cwd()) {
  const detected = [];
  const recommendedAgents = new Set();

  // 1. Cursor
  if (fs.existsSync(path.join(projectDir, '.cursor')) || 
      fs.existsSync(path.join(projectDir, '.cursorrules')) ||
      fs.existsSync(path.join(projectDir, '.cursor', 'rules'))) {
    detected.push('Cursor');
    recommendedAgents.add('cursor');
  }

  // 2. Claude Code
  if (fs.existsSync(path.join(projectDir, 'CLAUDE.md')) ||
      fs.existsSync(path.join(projectDir, '.claude'))) {
    detected.push('Claude Code');
    recommendedAgents.add('claude');
  }

  // 3. Zed
  if (fs.existsSync(path.join(projectDir, '.zed'))) {
    detected.push('Zed');
    recommendedAgents.add('zed');
  }

  // 4. GitHub Copilot / VSCode
  if (fs.existsSync(path.join(projectDir, '.github', 'copilot-instructions.md')) ||
      fs.existsSync(path.join(projectDir, '.vscode'))) {
    detected.push('GitHub Copilot');
    recommendedAgents.add('copilot');
  }

  // 5. Aider
  if (fs.existsSync(path.join(projectDir, '.aider.conf.yml')) ||
      fs.existsSync(path.join(projectDir, 'CONVENTIONS.md'))) {
    detected.push('Aider');
    recommendedAgents.add('aider');
  }

  // 6. Gemini / Antigravity
  if (fs.existsSync(path.join(projectDir, '.gemini')) ||
      fs.existsSync(path.join(projectDir, 'GEMINI.md'))) {
    detected.push('Google Gemini / Antigravity');
    recommendedAgents.add('gemini');
  }

  // Default agent is gemini if none detected
  if (recommendedAgents.size === 0) {
    recommendedAgents.add('gemini');
  }

  return {
    detected,
    recommendedAgents: Array.from(recommendedAgents),
  };
}

/**
 * Performs unified tech stack and IDE environment detection.
 *
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @returns {Object} Full detection report
 */
function detectProjectAttributes(projectDir = process.cwd()) {
  const stack = profiles.detectStack(projectDir);
  const ide = detectIdeEnvironment(projectDir);

  return {
    stack,
    ide,
    summary: {
      technologies: stack.detected.length ? stack.detected : ['Generic JavaScript'],
      ides: ide.detected.length ? ide.detected : ['Standard IDE'],
      recommendedProfile: stack.recommendedProfile,
      recommendedAgents: ide.recommendedAgents,
      recommendedSkills: stack.recommendedSkills,
    },
  };
}

module.exports = {
  detectIdeEnvironment,
  detectProjectAttributes,
};
