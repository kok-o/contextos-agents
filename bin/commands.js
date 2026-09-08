/**
 * bin/commands.js
 * ContextOS — Declarative CLI Command Registry & Status Engine
 *
 * Defines the canonical registry of CLI commands, options, and handlers.
 * Supports structured execution and machine-readable --json output.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const profiles = require('../.agents/profiles.js');
const lockfileLib = require('./lib/lockfile.js');

/**
 * Collects holistic status metadata for a target project.
 *
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @returns {Object} Structured project status
 */
function getStatus(projectDir = process.cwd()) {
  const agentsDir = path.join(projectDir, '.agents');
  const hasAgents = fs.existsSync(agentsDir);
  const lockData = lockfileLib.loadLockfile(projectDir);
  const activeProfile = hasAgents ? profiles.getActiveProfile(projectDir) : null;
  
  let skillsCount = 0;
  const skillsDir = path.join(agentsDir, 'core', 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      skillsCount = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
        .length;
    } catch {
      skillsCount = 0;
    }
  }

  const mcpServerPath = path.join(agentsDir, 'mcp', 'server.mjs');
  const mcpInstalled = fs.existsSync(mcpServerPath);

  // Check compiled adapter outputs
  const compiledAdapters = [];
  if (fs.existsSync(path.join(agentsDir, 'generated', 'gemini', 'skills'))) compiledAdapters.push('gemini');
  if (fs.existsSync(path.join(agentsDir, 'generated', 'claude', 'skills'))) compiledAdapters.push('claude');
  if (fs.existsSync(path.join(projectDir, '.cursorrules')) || fs.existsSync(path.join(projectDir, '.cursor', 'rules'))) compiledAdapters.push('cursor');
  if (fs.existsSync(path.join(projectDir, '.github', 'copilot-instructions.md'))) compiledAdapters.push('copilot');
  if (fs.existsSync(path.join(projectDir, '.aider.conf.yml'))) compiledAdapters.push('aider');
  if (fs.existsSync(path.join(projectDir, '.zed', 'rules.md'))) compiledAdapters.push('zed');

  return {
    package: 'contextos-agents',
    version,
    projectDir,
    initialized: hasAgents,
    activeProfile: activeProfile ? activeProfile.profile : (lockData?.selectedProfile || 'none'),
    skillsCount,
    mcpInstalled,
    compiledAdapters,
    lockfile: lockData ? {
      schemaVersion: lockData.schemaVersion,
      version: lockData.version,
      managedFilesCount: Object.keys(lockData.managedFiles || {}).length,
      selectedProfile: lockData.selectedProfile,
      installedAt: lockData.installedAt,
      updatedAt: lockData.updatedAt,
    } : null,
  };
}

/**
 * Formats status object as human-readable text.
 *
 * @param {Object} status - Status object
 * @returns {string} Formatted text
 */
function formatStatusText(status) {
  const lines = [
    `ContextOS Project Status (v${status.version})`,
    `──────────────────────────────────────────────`,
    `  Project Dir       : ${status.projectDir}`,
    `  Initialized       : ${status.initialized ? 'Yes (.agents/ found)' : 'No (run: npx contextos-agents init)'}`,
    `  Active Profile    : ${status.activeProfile}`,
    `  Skills Installed  : ${status.skillsCount}`,
    `  MCP Server        : ${status.mcpInstalled ? 'Installed (.agents/mcp/)' : 'Not installed'}`,
    `  Adapters Compiled : ${status.compiledAdapters.length ? status.compiledAdapters.join(', ') : 'none'}`,
  ];

  if (status.lockfile) {
    lines.push(`  Lockfile          : Valid (${status.lockfile.managedFilesCount} managed files, v${status.lockfile.version})`);
  } else if (status.initialized) {
    lines.push(`  Lockfile          : Missing (.agents/contextos.lock.json)`);
  }

  return lines.join('\n');
}

/**
 * Registry of canonical ContextOS CLI commands.
 */
const COMMAND_REGISTRY = {
  init: {
    name: 'init',
    description: 'Install and configure .agents/ in target project',
    usage: 'npx contextos-agents init [options]',
    requiresProject: false,
    options: [
      { flag: '--agent <target>', desc: 'Target agent (gemini, claude, cursor, auto)' },
      { flag: '--profile <name>', desc: 'Apply specific profile (mvp, startup, enterprise, etc.)' },
      { flag: '--auto', desc: 'Auto-detect tech stack and recommended profile' },
      { flag: '--minimal', desc: 'Install only 5 core essential skills' },
      { flag: '--with-mcp', desc: 'Install with MCP execution server enabled' },
      { flag: '--force', desc: 'Overwrite existing installation' },
      { flag: '--dry-run', desc: 'Preview installation actions without writing' },
      { flag: '--skip-compile', desc: 'Skip auto-compiling skills after install' },
    ],
  },
  status: {
    name: 'status',
    description: 'Display project configuration, active profile, and lockfile status',
    usage: 'contextos status [--json]',
    requiresProject: false,
    options: [
      { flag: '--json', desc: 'Output status in JSON format' },
    ],
  },
  update: {
    name: 'update',
    description: 'Safely update skills without overwriting user custom changes',
    usage: 'contextos update [--dry-run] [--profile <name>] [--json]',
    requiresProject: true,
    options: [
      { flag: '--dry-run', desc: 'Preview updates without modifying disk' },
      { flag: '--profile <name>', desc: 'Switch profile during update' },
      { flag: '--json', desc: 'Output results in JSON format' },
    ],
  },
  uninstall: {
    name: 'uninstall',
    description: 'Safely uninstall managed ContextOS files (preserves user custom skills)',
    usage: 'contextos uninstall [--dry-run] [--json]',
    requiresProject: true,
    options: [
      { flag: '--dry-run', desc: 'Preview deletions without modifying disk' },
      { flag: '--json', desc: 'Output results in JSON format' },
    ],
  },
  doctor: {
    name: 'doctor',
    description: 'Run project diagnostic health check',
    usage: 'contextos doctor [--json]',
    requiresProject: false,
    options: [
      { flag: '--json', desc: 'Output health report in JSON format' },
    ],
  },
  validate: {
    name: 'validate',
    description: 'Validate skill sources, frontmatter, dependency graph, and adapter sync',
    usage: 'contextos validate',
    requiresProject: true,
    aliases: ['audit'],
    options: [],
  },
  audit: {
    name: 'audit',
    target: 'validate',
    description: 'Alias for validate (check skills and sync)',
    usage: 'contextos audit',
    requiresProject: true,
    options: [],
  },
  export: {
    name: 'export',
    description: 'Compile skills for target agent (gemini, claude, cursor, copilot, aider, zed, all)',
    usage: 'contextos export <target> [--profile <name>]',
    requiresProject: true,
    options: [
      { flag: '--profile <name>', desc: 'Apply profile for this export run' },
    ],
  },
  profile: {
    name: 'profile',
    description: 'Manage project profiles (list, show, apply, remove)',
    usage: 'contextos profile <list|show|apply|remove> [name]',
    requiresProject: true,
    options: [],
  },
  resolve: {
    name: 'resolve',
    description: 'Dynamically resolve minimal skills needed for a prompt or files',
    usage: 'contextos resolve <prompt> [--files <a,b>] [--phase <p>] [--json]',
    requiresProject: true,
    options: [
      { flag: '--files <list>', desc: 'Comma-separated list of touched files' },
      { flag: '--phase <name>', desc: 'Lifecycle phase (Define, Plan, Build, Verify, Review, Ship)' },
      { flag: '--json', desc: 'Output resolution in JSON format' },
    ],
  },
  stats: {
    name: 'stats',
    description: 'Display token context savings report',
    usage: 'contextos stats [--json]',
    requiresProject: true,
    options: [
      { flag: '--json', desc: 'Output context savings in JSON format' },
    ],
  },
  watch: {
    name: 'watch',
    description: 'Start continuous file watcher and auto-sync daemon',
    usage: 'contextos watch',
    requiresProject: true,
    options: [],
  },
  detect: {
    name: 'detect',
    description: 'Auto-detect project tech stack and recommend profile',
    usage: 'contextos detect [--json]',
    requiresProject: false,
    options: [
      { flag: '--json', desc: 'Output detection result in JSON format' },
    ],
  },
  'install-skill': {
    name: 'install-skill',
    description: 'Interactive community skill installer or install by reference',
    usage: 'contextos install-skill [<ref> | --from-repo <ref>]',
    requiresProject: true,
    options: [
      { flag: '--from-repo <ref>', desc: 'Install directly from repository ref' },
    ],
  },
  skill: {
    name: 'skill',
    description: 'Manage community plugin skills (add, remove, list, search)',
    usage: 'contextos skill <add|remove|list|search> [args...]',
    requiresProject: true,
    options: [],
  },
  'setup-mcp': {
    name: 'setup-mcp',
    description: 'Add MCP execution server to an existing .agents/ project',
    usage: 'contextos setup-mcp [--force]',
    requiresProject: true,
    options: [
      { flag: '--force', desc: 'Overwrite existing .agents/mcp_config.json' },
    ],
  },
  'clean-worktrees': {
    name: 'clean-worktrees',
    description: 'Clean up lingering .swarm-worktrees and swarm/* branches',
    usage: 'contextos clean-worktrees',
    requiresProject: false,
    options: [],
  },
};

/**
 * Resolves a command name or alias to canonical command definition.
 *
 * @param {string} name - Command name or alias
 * @returns {Object|null} Command definition or null if unknown
 */
function getCommand(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (COMMAND_REGISTRY[lower]) {
    const cmd = COMMAND_REGISTRY[lower];
    if (cmd.target && COMMAND_REGISTRY[cmd.target]) {
      return COMMAND_REGISTRY[cmd.target];
    }
    return cmd;
  }
  // Check aliases
  for (const cmd of Object.values(COMMAND_REGISTRY)) {
    if (cmd.aliases && cmd.aliases.includes(lower)) {
      if (cmd.target && COMMAND_REGISTRY[cmd.target]) {
        return COMMAND_REGISTRY[cmd.target];
      }
      return cmd;
    }
  }
  return null;
}

/**
 * Checks if a command name is recognized by the registry.
 *
 * @param {string} name - Command name to check
 * @returns {boolean} True if known
 */
function isKnownCommand(name) {
  return getCommand(name) !== null;
}

module.exports = {
  COMMAND_REGISTRY,
  getCommand,
  isKnownCommand,
  getStatus,
  formatStatusText,
};
