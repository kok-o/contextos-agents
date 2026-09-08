/**
 * .agents/doctor.js
 * ContextOS — Project Diagnostics & Health Check Engine
 *
 * Inspects:
 *   1. .agents/ directory and core runtime files
 *   2. Node.js environment compatibility
 *   3. Active profile and skill exclusion/preference state
 *   4. Compiled AI agent adapters (Gemini, Claude, Cursor, Copilot, etc.)
 *   5. MCP server status and worktree support
 *   6. Security controls (pre-commit hooks, secret scanning)
 *   7. Project tech stack detection and recommended profile alignment
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const profiles = require('./profiles.js');

const DOMAIN_MAP = {
  frontend: new Set([
    'react', 'react-best-practices', 'nextjs', 'typescript',
    'ui-ux-pro', 'ui-design', 'ux-design', 'web-accessibility',
    'brutalist-design', 'minimalist-design', 'soft-design', 'redesign-audit',
    'impeccable-design', 'state-management',
  ]),
  backend: new Set([
    'node', 'fastapi', 'nestjs', 'database', 'system-design',
    'ddd', 'microservices',
  ]),
  cross: new Set([
    'engineering-workflow', 'gstack-roles', 'ponytail-mindset',
    'gemini-precision', 'interview-me', 'security', 'testing',
    'performance', 'vercel-optimize', 'docker', 'decisions',
    'architecture-diagrams', 'subagent-orchestrator', 'graphify',
    'context-manager', 'context-os', 'adapters', 'generators',
  ]),
};

function checkNodeVersion() {
  const version = process.version; // e.g. v22.12.0
  const match = version.match(/^v?(\d+)\.(\d+)/);
  if (!match) return { ok: false, version, message: `${version} (unknown)` };

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  // Requires at least Node 18.0.0 or 16.7.0 for recursive cpSync
  const ok = major > 16 || (major === 16 && minor >= 7);
  return {
    ok,
    version,
    message: ok ? `Node.js ${version} (>= 16.7.0 required)` : `Node.js ${version} (< 16.7.0, please upgrade)`,
  };
}

function checkPreCommitHook(projectDir) {
  const hookPath = path.join(projectDir, '.git', 'hooks', 'pre-commit');
  if (!fs.existsSync(hookPath)) {
    return { ok: false, message: 'not installed (run: npm run setup:hooks)' };
  }
  try {
    const content = fs.readFileSync(hookPath, 'utf8');
    if (content.includes('check-secrets')) {
      return { ok: true, message: 'installed (with secret check)' };
    }
    return { ok: false, message: 'installed but missing check-secrets' };
  } catch {
    return { ok: false, message: 'unreadable' };
  }
}

function checkSecretScanner(projectDir) {
  const scriptPath = path.join(projectDir, 'scripts', 'check-secrets.js');
  if (!fs.existsSync(scriptPath)) {
    return { ok: true, message: 'scanner script not present (skipped)' };
  }
  try {
    execFileSync(process.execPath, [scriptPath, '--all'], {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, message: '0 findings' };
  } catch (err) {
    return { ok: false, message: 'potential secrets detected (run: npm run check:secrets)' };
  }
}

function checkCompiledAdapters(projectDir) {
  const compiled = [];
  const genGemini = path.join(projectDir, '.agents', 'generated', 'gemini', 'skills');
  if (fs.existsSync(genGemini) && fs.readdirSync(genGemini).length > 0) {
    compiled.push('gemini');
  }
  const genClaude = path.join(projectDir, '.agents', 'generated', 'claude', 'skills');
  if (fs.existsSync(genClaude) && fs.readdirSync(genClaude).length > 0) {
    compiled.push('claude');
  }
  if (fs.existsSync(path.join(projectDir, '.cursorrules')) || fs.existsSync(path.join(projectDir, '.cursor', 'rules'))) {
    compiled.push('cursor');
  }
  if (fs.existsSync(path.join(projectDir, '.github', 'copilot-instructions.md'))) {
    compiled.push('copilot');
  }
  if (fs.existsSync(path.join(projectDir, '.aider.conf.yml'))) {
    compiled.push('aider');
  }
  if (fs.existsSync(path.join(projectDir, '.zed', 'rules.md'))) {
    compiled.push('zed');
  }
  return compiled;
}

function checkLockfileIntegrity(projectDir) {
  const lockPath = path.join(projectDir, '.agents', 'contextos.lock.json');
  if (!fs.existsSync(lockPath)) {
    return { ok: true, exists: false, isError: false, message: 'none (not generated yet)' };
  }
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return { ok: false, exists: true, isError: true, error: 'Lockfile JSON root is not an object' };
    }
    if (!data.schemaVersion || typeof data.schemaVersion !== 'number') {
      return { ok: false, exists: true, isError: true, error: 'Lockfile missing valid schemaVersion' };
    }
    if (!data.managedFiles || typeof data.managedFiles !== 'object') {
      return { ok: false, exists: true, isError: true, error: 'Lockfile missing managedFiles map' };
    }
    const count = Object.keys(data.managedFiles).length;
    return { ok: true, exists: true, isError: false, message: `valid (v${data.schemaVersion}, ${count} managed files)` };
  } catch (err) {
    return { ok: false, exists: true, isError: true, error: `Lockfile is corrupted JSON: ${err.message}` };
  }
}

function checkAdapterIntegrity(projectDir) {
  const errors = [];
  const filesToCheck = [
    path.join(projectDir, '.cursorrules'),
    path.join(projectDir, '.github', 'copilot-instructions.md'),
    path.join(projectDir, '.aider.conf.yml'),
    path.join(projectDir, '.zed', 'rules.md'),
  ];
  for (const f of filesToCheck) {
    if (fs.existsSync(f)) {
      try {
        const stat = fs.statSync(f);
        if (stat.size === 0) {
          errors.push(`Adapter file ${path.relative(projectDir, f).replace(/\\/g, '/')} is empty (0 bytes)`);
        }
      } catch {
        errors.push(`Adapter file ${path.relative(projectDir, f).replace(/\\/g, '/')} is unreadable`);
      }
    }
  }

  const cursorRulesDir = path.join(projectDir, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir)) {
    try {
      const files = fs.readdirSync(cursorRulesDir);
      for (const file of files) {
        const full = path.join(cursorRulesDir, file);
        if (fs.statSync(full).size === 0) {
          errors.push(`Cursor rule ${file} is empty (0 bytes)`);
        }
      }
    } catch {}
  }

  return { ok: errors.length === 0, errors };
}

function checkSymlinks(projectDir) {
  const errors = [];
  const targetDir = path.join(projectDir, '.agents');
  if (!fs.existsSync(targetDir)) return { ok: true, errors: [] };

  function scan(current) {
    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(current, name);
      try {
        const lstat = fs.lstatSync(full);
        if (lstat.isSymbolicLink()) {
          if (!fs.existsSync(full)) {
            errors.push(`Broken symlink: ${path.relative(projectDir, full).replace(/\\/g, '/')}`);
          }
        } else if (lstat.isDirectory()) {
          scan(full);
        }
      } catch {
        errors.push(`Cannot stat file: ${path.relative(projectDir, full).replace(/\\/g, '/')}`);
      }
    }
  }

  scan(targetDir);
  return { ok: errors.length === 0, errors };
}

function inspectSkills(projectDir, activeProfile) {
  const skillsDir = path.join(projectDir, '.agents', 'core', 'skills');
  if (!fs.existsSync(skillsDir)) return { total: 0, active: 0, excluded: 0, byDomain: { frontend: [], backend: [], cross: [] } };

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const allSkills = entries
    .filter(e => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')))
    .map(e => e.name);

  const excludedSet = new Set(activeProfile ? activeProfile.exclude_skills || [] : []);
  const activeSkills = allSkills.filter(s => !excludedSet.has(s));

  const byDomain = { frontend: [], backend: [], cross: [] };
  for (const s of activeSkills) {
    if (DOMAIN_MAP.frontend.has(s)) byDomain.frontend.push(s);
    else if (DOMAIN_MAP.backend.has(s)) byDomain.backend.push(s);
    else byDomain.cross.push(s);
  }

  return {
    total: allSkills.length,
    active: activeSkills.length,
    excluded: excludedSet.size,
    byDomain,
  };
}

function runDoctor(projectDir = process.cwd(), options = {}) {
  const version = (() => {
    try {
      return require('../package.json').version;
    } catch {
      return '1.7.0';
    }
  })();

  const isJson = Boolean(options.json);
  const errors = [];
  const warnings = [];

  const agentsDir = path.join(projectDir, '.agents');
  const hasAgents = fs.existsSync(agentsDir);
  if (!hasAgents) {
    errors.push('.agents/ directory missing (run: npx contextos-agents init)');
  }

  const nodeCheck = checkNodeVersion();
  if (!nodeCheck.ok) {
    errors.push(nodeCheck.message);
  }

  const lockfileCheck = checkLockfileIntegrity(projectDir);
  if (!lockfileCheck.ok) {
    errors.push(lockfileCheck.error);
  } else if (!lockfileCheck.exists && hasAgents) {
    warnings.push('Lockfile missing (.agents/contextos.lock.json)');
  }

  const adapterCheck = checkAdapterIntegrity(projectDir);
  if (!adapterCheck.ok) {
    errors.push(...adapterCheck.errors);
  }

  const symlinkCheck = checkSymlinks(projectDir);
  if (!symlinkCheck.ok) {
    errors.push(...symlinkCheck.errors);
  }

  const activeProfile = hasAgents ? profiles.getActiveProfile(projectDir) : null;
  const skillsInfo = inspectSkills(projectDir, activeProfile);
  const compiledAdapters = checkCompiledAdapters(projectDir);

  const mcpServerPath = path.join(projectDir, '.agents', 'mcp', 'server.mjs');
  const hasMcp = fs.existsSync(mcpServerPath);

  const hookCheck = checkPreCommitHook(projectDir);
  const secretCheck = checkSecretScanner(projectDir);
  const stack = profiles.detectStack(projectDir);

  const ok = errors.length === 0;

  if (isJson) {
    const report = {
      ok,
      version,
      errors,
      warnings,
      hasAgents,
      nodeOk: nodeCheck.ok,
      activeProfile,
      skillsInfo,
      compiledAdapters,
      hasMcp,
      hookCheck,
      secretCheck,
      lockfileCheck,
      adapterCheck,
      symlinkCheck,
      stack,
    };
    console.log(JSON.stringify(report, null, 2));
    if (options.exitOnError !== false && !ok && require.main === module) {
      process.exit(1);
    }
    return report;
  }

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log(`│  ContextOS Doctor — Project Health Check  v${version.padEnd(16)}│`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│                                                             │');

  // .agents directory
  if (hasAgents) {
    console.log('│  ✓ .agents/ directory found                                 │');
  } else {
    console.log('│  ✗ .agents/ directory missing (run: npx contextos-agents)    │');
  }

  // Node version
  const nodeIcon = nodeCheck.ok ? '✓' : '✗';
  console.log(`│  ${nodeIcon} ${nodeCheck.message.padEnd(58)}│`);

  // Lockfile
  if (lockfileCheck.exists) {
    const lockIcon = lockfileCheck.ok ? '✓' : '✗';
    const lockStr = `Lockfile: ${lockfileCheck.ok ? lockfileCheck.message : lockfileCheck.error}`;
    console.log(`│  ${lockIcon} ${lockStr.slice(0, 58).padEnd(58)}│`);
  } else {
    console.log('│  • Lockfile: not present (optional for dev repository)      │');
  }

  // Active profile
  if (activeProfile) {
    const profStr = `Active profile: ${activeProfile.name || activeProfile.profile}`;
    console.log(`│  ✓ ${profStr.padEnd(58)}│`);
  } else {
    console.log('│  • Active profile: default (no profile locked)              │');
  }

  // Skills
  const skillsStr = `Skills loaded: ${skillsInfo.active} / ${skillsInfo.total}` +
    (skillsInfo.excluded > 0 ? ` (${skillsInfo.excluded} excluded by profile)` : '');
  console.log(`│  ✓ ${skillsStr.padEnd(58)}│`);

  // Adapters
  if (compiledAdapters.length > 0) {
    const adaptStr = `Adapters compiled: ${compiledAdapters.join(', ')}`;
    console.log(`│  ✓ ${adaptStr.padEnd(58)}│`);
  } else {
    console.log('│  • Adapters compiled: none (run: contextos export gemini)   │');
  }

  // Symlinks
  const symIcon = symlinkCheck.ok ? '✓' : '✗';
  const symStr = symlinkCheck.ok ? 'Symlinks: verified (0 broken)' : `Broken symlinks: ${symlinkCheck.errors.length}`;
  console.log(`│  ${symIcon} ${symStr.padEnd(58)}│`);

  // MCP
  if (hasMcp) {
    console.log('│  ✓ MCP server: installed (.agents/mcp/server.mjs)           │');
  } else {
    console.log('│  • MCP server: not installed (run: contextos setup-mcp)     │');
  }

  // Security
  const hookIcon = hookCheck.ok ? '✓' : '•';
  const hookStr = `Pre-commit hook: ${hookCheck.message}`;
  console.log(`│  ${hookIcon} ${hookStr.padEnd(58)}│`);

  const secretIcon = secretCheck.ok ? '✓' : '✗';
  const secretStr = `Secret scanner: ${secretCheck.message}`;
  console.log(`│  ${secretIcon} ${secretStr.padEnd(58)}│`);

  console.log('│                                                             │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│  Project Stack & Profile Recommendations                    │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│                                                             │');

  const detectedStr = `Detected Stack: ${stack.detected.length ? stack.detected.join(', ') : 'Generic JS'}`;
  console.log(`│  • ${detectedStr.slice(0, 56).padEnd(56)} │`);

  const recProfStr = `Recommended Profile: ${stack.recommendedProfile}`;
  console.log(`│  • ${recProfStr.padEnd(56)} │`);

  console.log('│                                                             │');
  console.log('│  Skills by Domain:                                          │');

  const feStr = `Frontend (${skillsInfo.byDomain.frontend.length}): ${skillsInfo.byDomain.frontend.slice(0, 4).join(', ')}${skillsInfo.byDomain.frontend.length > 4 ? '...' : ''}`;
  console.log(`│    ${feStr.padEnd(57)}│`);

  const beStr = `Backend  (${skillsInfo.byDomain.backend.length}): ${skillsInfo.byDomain.backend.slice(0, 4).join(', ')}${skillsInfo.byDomain.backend.length > 4 ? '...' : ''}`;
  console.log(`│    ${beStr.padEnd(57)}│`);

  const crStr = `Cross    (${skillsInfo.byDomain.cross.length}): ${skillsInfo.byDomain.cross.slice(0, 4).join(', ')}${skillsInfo.byDomain.cross.length > 4 ? '...' : ''}`;
  console.log(`│    ${crStr.padEnd(57)}│`);

  console.log('│                                                             │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  if (errors.length > 0) {
    console.error(`[ERROR] Diagnostic check failed with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error('');
  }

  const result = {
    ok,
    errors,
    warnings,
    hasAgents,
    nodeOk: nodeCheck.ok,
    activeProfile,
    skillsInfo,
    compiledAdapters,
    hasMcp,
    hookCheck,
    secretCheck,
    lockfileCheck,
    adapterCheck,
    symlinkCheck,
    stack,
  };

  if (options.exitOnError !== false && !ok && require.main === module) {
    process.exit(1);
  }

  return result;
}

if (require.main === module) {
  const res = runDoctor();
  if (!res.ok) process.exit(1);
}

module.exports = {
  runDoctor,
  checkNodeVersion,
  checkPreCommitHook,
  checkSecretScanner,
  checkCompiledAdapters,
  checkLockfileIntegrity,
  checkAdapterIntegrity,
  checkSymlinks,
  inspectSkills,
};
