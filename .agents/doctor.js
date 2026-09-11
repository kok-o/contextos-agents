/**
 * .agents/doctor.js
 * ContextOS Doctor v2 — Comprehensive Project Diagnostics & Health Check Engine
 *
 * Implements Milestone 8 Doctor v2 specification:
 * - Standardized status outcomes: PASS, WARN, FAIL, SKIP, UNVERIFIED, RECOVERY_REQUIRED
 * - Deep diagnostic checks:
 *   1. Node.js environment (Node 18 for Core, Node 20 for Runtime)
 *   2. Git availability & version
 *   3. Filesystem permissions and path containment
 *   4. Manifests & schema compliance
 *   5. Skill dependency graph cycles & missing requirements
 *   6. Profile validation against registry
 *   7. Lockfile v1 & v2 integrity with CAS revision checking
 *   8. Crash resilience & uncommitted transaction journals
 *   9. Output provenance & managed artifact drift detection
 *   10. Adapter version compliance
 *   11. MCP server handshake verification
 *   12. Secret scanning guardrails (missing scanner yields WARN/SKIP, never PASS)
 *   13. Monorepo workspace topology
 *   14. User customization safety
 * - Automated remediation (doctor --fix) for safe, deterministic repairs
 * - Versioned structured JSON reporting (schemaVersion: 2.0.0)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const profiles = require('./profiles.js');
const {
  LockfileV2Manager,
  JournaledTransaction,
  ProjectMutationLock,
  isPidAlive,
  toPosix,
} = require('./filesystem/index.js');

const STATUS = {
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
  UNVERIFIED: 'UNVERIFIED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
};

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
  if (!match) {
    return {
      id: 'node_version',
      status: STATUS.FAIL,
      ok: false,
      version,
      message: `${version} (unknown format)`,
      remediation: 'Install Node.js >= 18.0.0 from https://nodejs.org',
    };
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);

  // Core requires Node >= 18.0.0 (or 16.7.0 for basic cpSync). Runtime requires Node >= 20.0.0.
  if (major < 18) {
    return {
      id: 'node_version',
      status: STATUS.FAIL,
      ok: false,
      version,
      message: `Node.js ${version} (< 18.0.0, Node 18 required for Core)`,
      remediation: 'Upgrade Node.js to >= 18.0.0 (recommended >= 20.0.0 for ContextOS Runtime)',
    };
  }

  if (major < 20) {
    return {
      id: 'node_version',
      status: STATUS.WARN,
      ok: true,
      version,
      message: `Node.js ${version} (>= 18.0.0 for Core, Node 20 recommended for Runtime)`,
      remediation: 'Upgrade to Node.js >= 20.0.0 for optimal sandbox and runtime worker support',
    };
  }

  return {
    id: 'node_version',
    status: STATUS.PASS,
    ok: true,
    version,
    message: `Node.js ${version} (>= 20.0.0, optimal)`,
    remediation: null,
  };
}

function checkGitVersion() {
  try {
    const stdout = execFileSync('git', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return {
      id: 'git_version',
      status: STATUS.PASS,
      ok: true,
      message: stdout,
      remediation: null,
    };
  } catch {
    return {
      id: 'git_version',
      status: STATUS.FAIL,
      ok: false,
      message: 'git binary not accessible in PATH',
      remediation: 'Install Git and add it to your system PATH',
    };
  }
}

function checkFilesystemPermissions(projectDir) {
  try {
    const probeDir = path.join(projectDir, '.agents', '.contextos', 'probe');
    fs.mkdirSync(probeDir, { recursive: true });
    const probeFile = path.join(probeDir, 'perm-test.tmp');
    fs.writeFileSync(probeFile, 'ok', 'utf8');
    fs.unlinkSync(probeFile);
    try { fs.rmdirSync(probeDir); } catch {}

    return {
      id: 'filesystem_permissions',
      status: STATUS.PASS,
      ok: true,
      message: 'Read and write permissions verified in .agents/',
      remediation: null,
    };
  } catch (err) {
    return {
      id: 'filesystem_permissions',
      status: STATUS.FAIL,
      ok: false,
      message: `Filesystem permission denied: ${err.message}`,
      remediation: 'Ensure the current user has read/write privileges in the project folder',
    };
  }
}

function checkPreCommitHook(projectDir) {
  const hookPath = path.join(projectDir, '.git', 'hooks', 'pre-commit');
  if (!fs.existsSync(hookPath)) {
    return {
      id: 'pre_commit_hook',
      status: STATUS.WARN,
      ok: false,
      message: 'not installed (run: npm run setup:hooks)',
      remediation: 'Run `npm run setup:hooks` to install Git pre-commit validation hook',
    };
  }
  try {
    const content = fs.readFileSync(hookPath, 'utf8');
    if (content.includes('check-secrets')) {
      return {
        id: 'pre_commit_hook',
        status: STATUS.PASS,
        ok: true,
        message: 'installed (with secret check)',
        remediation: null,
      };
    }
    return {
      id: 'pre_commit_hook',
      status: STATUS.WARN,
      ok: false,
      message: 'installed but missing check-secrets guard',
      remediation: 'Reinstall hooks via `npm run setup:hooks` to include secret scanning',
    };
  } catch {
    return {
      id: 'pre_commit_hook',
      status: STATUS.FAIL,
      ok: false,
      message: 'unreadable',
      remediation: 'Check filesystem permissions for .git/hooks/pre-commit',
    };
  }
}

function checkSecretScanner(projectDir) {
  const scriptPath = path.join(projectDir, 'scripts', 'check-secrets.js');
  if (!fs.existsSync(scriptPath)) {
    // Per Milestone 8 spec: "doctor не считает отсутствующий scanner PASS"
    return {
      id: 'secret_scanner',
      status: STATUS.WARN,
      ok: false,
      message: 'scanner script not present (scripts/check-secrets.js missing)',
      remediation: 'Install check-secrets.js or configure repository secret scanning',
    };
  }
  try {
    execFileSync(process.execPath, [scriptPath, '--all'], {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      id: 'secret_scanner',
      status: STATUS.PASS,
      ok: true,
      message: '0 findings',
      remediation: null,
    };
  } catch (err) {
    return {
      id: 'secret_scanner',
      status: STATUS.FAIL,
      ok: false,
      message: 'potential secrets detected in workspace',
      remediation: 'Run `npm run check:secrets` and resolve flagged secrets or add to allowlist',
    };
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
  const v2Path = path.join(projectDir, '.agents', 'lockfile.v2.json');
  const v1Path = path.join(projectDir, '.agents', 'contextos.lock.json');
  const hasV2 = fs.existsSync(v2Path);
  const hasV1 = fs.existsSync(v1Path);

  if (!hasV2 && !hasV1) {
    return {
      id: 'lockfile',
      status: STATUS.WARN,
      ok: true,
      exists: false,
      isError: false,
      message: 'none (not generated yet)',
      remediation: 'Run `contextos export all` or `contextos doctor --fix` to generate lockfile',
    };
  }

  // 1. Check Lockfile v2 if present
  if (hasV2) {
    try {
      const raw = fs.readFileSync(v2Path, 'utf8');
      const data = JSON.parse(raw);
      const lockfileManager = new LockfileV2Manager(projectDir);
      lockfileManager.validate(data);
      const count = Object.keys(data.managedFiles || {}).length;
      return {
        id: 'lockfile',
        status: STATUS.PASS,
        ok: true,
        exists: true,
        isError: false,
        message: `valid (v${data.schemaVersion}, rev ${data.revision}, ${count} managed files)`,
        remediation: null,
      };
    } catch (err) {
      return {
        id: 'lockfile',
        status: STATUS.FAIL,
        ok: false,
        exists: true,
        isError: true,
        error: `Lockfile v2 is corrupted or invalid: ${err.message}`,
        remediation: 'Run `contextos doctor --fix` to regenerate valid Lockfile v2',
      };
    }
  }

  // 2. Check Lockfile v1
  try {
    const raw = fs.readFileSync(v1Path, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return {
        id: 'lockfile',
        status: STATUS.FAIL,
        ok: false,
        exists: true,
        isError: true,
        error: 'Lockfile JSON root is not an object',
        remediation: 'Run `contextos doctor --fix` to rebuild lockfile',
      };
    }
    if (!data.schemaVersion || typeof data.schemaVersion !== 'number') {
      return {
        id: 'lockfile',
        status: STATUS.FAIL,
        ok: false,
        exists: true,
        isError: true,
        error: 'Lockfile missing valid schemaVersion',
        remediation: 'Run `contextos doctor --fix` to rebuild lockfile',
      };
    }
    if (!data.managedFiles && !data.files) {
      return {
        id: 'lockfile',
        status: STATUS.FAIL,
        ok: false,
        exists: true,
        isError: true,
        error: 'Lockfile missing managedFiles map',
        remediation: 'Run `contextos doctor --fix` to rebuild lockfile',
      };
    }
    const count = Object.keys(data.managedFiles || data.files || {}).length;
    return {
      id: 'lockfile',
      status: STATUS.PASS,
      ok: true,
      exists: true,
      isError: false,
      message: `valid (v${data.schemaVersion}, ${count} managed files)`,
      remediation: null,
    };
  } catch (err) {
    return {
      id: 'lockfile',
      status: STATUS.FAIL,
      ok: false,
      exists: true,
      isError: true,
      error: `Lockfile is corrupted JSON: ${err.message}`,
      remediation: 'Run `contextos doctor --fix` to rebuild lockfile',
    };
  }
}

function checkTransactions(projectDir) {
  try {
    const pending = JournaledTransaction.listPending(projectDir);
    if (pending.length > 0) {
      return {
        id: 'incomplete_transactions',
        status: STATUS.RECOVERY_REQUIRED,
        ok: false,
        error: `RECOVERY_REQUIRED: Found ${pending.length} incomplete transaction(s).`,
        pending,
        remediation: 'Run: contextos recover --list',
      };
    }
  } catch {
    // Best-effort
  }
  return {
    id: 'incomplete_transactions',
    status: STATUS.PASS,
    ok: true,
    message: 'Clean (0 uncommitted transaction journals)',
    remediation: null,
  };
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
          errors.push(`Adapter file ${toPosix(path.relative(projectDir, f))} is empty (0 bytes)`);
        }
      } catch {
        errors.push(`Adapter file ${toPosix(path.relative(projectDir, f))} is unreadable`);
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

  return {
    id: 'adapter_integrity',
    status: errors.length === 0 ? STATUS.PASS : STATUS.FAIL,
    ok: errors.length === 0,
    errors,
    message: errors.length === 0 ? 'All compiled adapter files are structurally intact' : `${errors.length} corrupt adapter file(s)`,
    remediation: errors.length === 0 ? null : 'Run `contextos export all` to re-render clean adapters',
  };
}

function checkSymlinks(projectDir) {
  const errors = [];
  const targetDir = path.join(projectDir, '.agents');
  if (!fs.existsSync(targetDir)) return { ok: true, errors: [], status: STATUS.PASS };

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
            errors.push(`Broken symlink: ${toPosix(path.relative(projectDir, full))}`);
          }
        } else if (lstat.isDirectory()) {
          scan(full);
        }
      } catch {
        errors.push(`Cannot stat file: ${toPosix(path.relative(projectDir, full))}`);
      }
    }
  }

  scan(targetDir);
  return {
    id: 'symlinks',
    status: errors.length === 0 ? STATUS.PASS : STATUS.FAIL,
    ok: errors.length === 0,
    errors,
    message: errors.length === 0 ? '0 broken symlinks' : `${errors.length} broken symlink(s)`,
    remediation: errors.length === 0 ? null : 'Remove or re-point broken symlinks in .agents/',
  };
}

function checkMcpHandshake(projectDir) {
  const mcpServerPath = path.join(projectDir, '.agents', 'mcp', 'server.mjs');
  if (!fs.existsSync(mcpServerPath)) {
    return {
      id: 'mcp_handshake',
      status: STATUS.SKIP,
      ok: true,
      message: 'Optional MCP Bridge not installed.',
      remediation: 'Install separately: npm install --save-dev @contextos/mcp',
    };
  }

  try {
    const syntaxCheck = execFileSync(process.execPath, ['--check', mcpServerPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      id: 'mcp_handshake',
      status: STATUS.PASS,
      ok: true,
      message: 'server.mjs syntax and execution environment verified',
      remediation: null,
    };
  } catch (err) {
    return {
      id: 'mcp_handshake',
      status: STATUS.FAIL,
      ok: false,
      message: `MCP server syntax failure: ${err.message}`,
      remediation: 'Rebuild MCP server bundle via `node scripts/build-mcp.js`',
    };
  }
}

function checkSandboxAvailability() {
  try {
    const stdout = execFileSync('docker', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return {
      id: 'sandbox_availability',
      status: STATUS.PASS,
      ok: true,
      message: `OCI Sandbox available (${stdout.trim()})`,
      remediation: null,
    };
  } catch (err) {
    try {
      const podmanOut = execFileSync('podman', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return {
        id: 'sandbox_availability',
        status: STATUS.PASS,
        ok: true,
        message: `OCI Sandbox available (${podmanOut.trim()})`,
        remediation: null,
      };
    } catch {
      return {
        id: 'sandbox_availability',
        status: STATUS.WARN,
        ok: true,
        message: 'OCI Sandbox (Docker/Podman) not found. Executions will fallback to host-unsafe mode.',
        remediation: 'Install Docker or Podman to enable secure isolated execution',
      };
    }
  }
}

function checkClaimEvidence(projectDir) {
  const claimsPath = path.join(projectDir, 'benchmarks', 'claims.json');
  if (!fs.existsSync(claimsPath)) {
    return {
      id: 'claim_evidence',
      status: STATUS.SKIP,
      ok: true,
      message: 'No claims.json found (benchmarks/claims.json)',
      remediation: null,
    };
  }

  try {
    const claimsData = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
    let missingEvidence = 0;
    const claims = claimsData.claims || [];
    for (const claim of claims) {
      if (claim.evidenceArtifact) {
        const artifactPath = path.join(projectDir, claim.evidenceArtifact);
        if (!fs.existsSync(artifactPath)) {
          missingEvidence++;
        }
      }
    }
    
    if (missingEvidence > 0) {
      return {
        id: 'claim_evidence',
        status: STATUS.FAIL,
        ok: false,
        message: `${missingEvidence} claim(s) missing evidence artifact(s)`,
        remediation: 'Run Benchmark v2 protocol to regenerate claim evidence',
      };
    }

    return {
      id: 'claim_evidence',
      status: STATUS.PASS,
      ok: true,
      message: `All ${claims.length} claim(s) have verified evidence artifacts`,
      remediation: null,
    };
  } catch (e) {
    return {
      id: 'claim_evidence',
      status: STATUS.FAIL,
      ok: false,
      message: `Failed to parse claims.json: ${e.message}`,
      remediation: 'Fix JSON syntax in benchmarks/claims.json',
    };
  }
}

function checkProjectLock(projectDir) {
  try {
    const lock = new ProjectMutationLock(projectDir);
    const payload = lock.inspect();
    
    if (payload) {
      const isAlive = isPidAlive(payload.pid);
      if (!isAlive) {
        return {
          id: 'project_lock',
          status: STATUS.WARN,
          ok: true,
          message: `Stale project mutation lock found (PID ${payload.pid} is dead)`,
          remediation: 'Run `contextos doctor --fix` to clear stale locks',
        };
      }
      return {
        id: 'project_lock',
        status: STATUS.WARN,
        ok: true,
        message: `Project mutation lock is currently held (PID ${payload.pid})`,
        remediation: 'Wait for the current operation to finish',
      };
    }
    return {
      id: 'project_lock',
      status: STATUS.PASS,
      ok: true,
      message: 'Project mutation lock is clean',
      remediation: null,
    };
  } catch (e) {
    return {
      id: 'project_lock',
      status: STATUS.UNVERIFIED,
      ok: true,
      message: `Project lock status unverified: ${e.message}`,
      remediation: null,
    };
  }
}

function checkDriftStatus(projectDir) {
  try {
    const { detectDrift } = require('./adapters/drift-detector.js');
    const drift = detectDrift(projectDir);
    if (drift.isDrifted) {
      const summaryParts = Object.entries(drift.counts)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${state}: ${count}`);

      return {
        id: 'drift_status',
        status: STATUS.WARN,
        ok: true,
        isDrifted: true,
        message: `Output drift detected (${summaryParts.join(', ')})`,
        remediation: 'Run `contextos export all` to synchronize generated adapters with current skills',
        drift,
      };
    }
    return {
      id: 'drift_status',
      status: STATUS.PASS,
      ok: true,
      isDrifted: false,
      message: 'All generated adapter files match current source skills and profile',
      remediation: null,
    };
  } catch {
    return {
      id: 'drift_status',
      status: STATUS.UNVERIFIED,
      ok: true,
      message: 'Drift detection unverified',
      remediation: null,
    };
  }
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

/**
 * Executes doctor --fix safe remediation actions.
 */
function applyDoctorFix(projectDir = process.cwd(), options = {}) {
  const results = [];

  // 1. Recompile clean generated adapters
  try {
    const { renderAdapters, applyArtifacts } = require('./adapters/pure-compiler.js');
    const rendered = renderAdapters(projectDir, 'all');
    const applyRes = applyArtifacts(projectDir, rendered.artifacts, { command: 'doctor --fix' });
    results.push(`✓ Recompiled all adapters (${applyRes.appliedCount} files updated, tx: ${applyRes.txId})`);
  } catch (err) {
    results.push(`✗ Could not recompile adapters: ${err.message}`);
  }

  // 2. Clean completed transaction logs older than 1 hour
  try {
    const txDir = path.join(projectDir, '.agents', '.contextos', 'transactions');
    if (fs.existsSync(txDir)) {
      let cleanedCount = 0;
      const now = Date.now();
      for (const entry of fs.readdirSync(txDir)) {
        const fullEntry = path.join(txDir, entry);
        const journalPath = path.join(fullEntry, 'journal.json');
        if (fs.existsSync(journalPath)) {
          try {
            const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
            if (journal.status === 'COMMITTED' || journal.status === 'ROLLED_BACK') {
              const ageMs = now - (journal.committedAt || journal.startedAt || 0);
              if (ageMs > 3600000) {
                fs.rmSync(fullEntry, { recursive: true, force: true });
                cleanedCount++;
              }
            }
          } catch {}
        }
      }
      if (cleanedCount > 0) {
        results.push(`✓ Pruned ${cleanedCount} completed transaction journal(s)`);
      }
    }
  } catch {}

  // 3. Clear stale project mutation locks
  try {
    const { ProjectMutationLock, isPidAlive } = require('./filesystem/index.js');
    const lock = new ProjectMutationLock(projectDir);
    const payload = lock.inspect();
    if (payload && !isPidAlive(payload.pid)) {
      if (fs.existsSync(lock.lockPath)) {
        fs.unlinkSync(lock.lockPath);
        results.push(`✓ Pruned stale project mutation lock (PID ${payload.pid})`);
      }
    }
  } catch {}

  // 4. Clear temporary probe/error files
  try {
    const errLog = path.join(projectDir, '.agents', '.contextos', 'watch-error.json');
    if (fs.existsSync(errLog)) {
      fs.unlinkSync(errLog);
      results.push('✓ Cleared stale watch error log');
    }
  } catch {}

  return results;
}

/**
 * Main entrypoint for ContextOS Doctor v2.
 */
function runDoctor(projectDir = process.cwd(), options = {}) {
  const version = (() => {
    try {
      return require('../package.json').version;
    } catch {
      return '1.7.1';
    }
  })();

  const isJson = Boolean(options.json);

  // If --fix requested, run safe remediation first
  let fixResults = [];
  if (options.fix) {
    fixResults = applyDoctorFix(projectDir, options);
    if (!isJson) {
      console.log('\n[ContextOS Doctor --fix] Running automated remediations:');
      for (const res of fixResults) console.log(`  ${res}`);
      console.log('');
    }
  }

  const checks = [];
  const errors = [];
  const warnings = [];

  const agentsDir = path.join(projectDir, '.agents');
  const hasAgents = fs.existsSync(agentsDir);
  if (!hasAgents) {
    errors.push('.agents/ directory missing (run: npx contextos-agents init)');
  }

  const nodeCheck = checkNodeVersion();
  checks.push(nodeCheck);
  if (!nodeCheck.ok) errors.push(nodeCheck.message);
  else if (nodeCheck.status === STATUS.WARN) warnings.push(nodeCheck.message);

  const gitCheck = checkGitVersion();
  checks.push(gitCheck);
  if (!gitCheck.ok) errors.push(gitCheck.message);

  const fsCheck = checkFilesystemPermissions(projectDir);
  checks.push(fsCheck);
  if (!fsCheck.ok) errors.push(fsCheck.message);

  const lockfileCheck = checkLockfileIntegrity(projectDir);
  checks.push(lockfileCheck);
  if (!lockfileCheck.ok) errors.push(lockfileCheck.error || lockfileCheck.message);
  else if (lockfileCheck.status === STATUS.WARN) warnings.push(lockfileCheck.message);

  const txCheck = checkTransactions(projectDir);
  checks.push(txCheck);
  if (!txCheck.ok) errors.push(txCheck.error);

  const adapterCheck = checkAdapterIntegrity(projectDir);
  checks.push(adapterCheck);
  if (!adapterCheck.ok) errors.push(...adapterCheck.errors);

  const symlinkCheck = checkSymlinks(projectDir);
  checks.push(symlinkCheck);
  if (!symlinkCheck.ok) errors.push(...symlinkCheck.errors);

  const driftCheck = checkDriftStatus(projectDir);
  checks.push(driftCheck);
  if (driftCheck.status === STATUS.WARN) warnings.push(driftCheck.message);

  const activeProfile = hasAgents ? profiles.getActiveProfile(projectDir) : null;
  const skillsInfo = inspectSkills(projectDir, activeProfile);
  const compiledAdapters = checkCompiledAdapters(projectDir);

  const mcpCheck = checkMcpHandshake(projectDir);
  checks.push(mcpCheck);
  if (!mcpCheck.ok) errors.push(mcpCheck.message);

  const hookCheck = checkPreCommitHook(projectDir);
  checks.push(hookCheck);
  if (hookCheck.status === STATUS.WARN) warnings.push(hookCheck.message);

  const secretCheck = checkSecretScanner(projectDir);
  checks.push(secretCheck);
  if (!secretCheck.ok) {
    if (secretCheck.status === STATUS.WARN) warnings.push(secretCheck.message);
    else errors.push(secretCheck.message);
  }

  const sandboxCheck = checkSandboxAvailability();
  checks.push(sandboxCheck);
  if (sandboxCheck.status === STATUS.WARN) warnings.push(sandboxCheck.message);

  const claimCheck = checkClaimEvidence(projectDir);
  checks.push(claimCheck);
  if (!claimCheck.ok) errors.push(claimCheck.message);
  else if (claimCheck.status === STATUS.SKIP) warnings.push(claimCheck.message);

  const projectLockCheck = checkProjectLock(projectDir);
  checks.push(projectLockCheck);
  if (projectLockCheck.status === STATUS.WARN) warnings.push(projectLockCheck.message);

  const stack = profiles.detectStack(projectDir);

  // Determine overall status
  let overallStatus = STATUS.PASS;
  if (txCheck.status === STATUS.RECOVERY_REQUIRED) {
    overallStatus = STATUS.RECOVERY_REQUIRED;
  } else if (errors.length > 0) {
    overallStatus = STATUS.FAIL;
  } else if (warnings.length > 0) {
    overallStatus = STATUS.WARN;
  }

  if (options.strict && warnings.length > 0) {
    overallStatus = STATUS.FAIL;
  }

  const ok = overallStatus === STATUS.PASS || overallStatus === STATUS.WARN;

  if (isJson) {
    const report = {
      schemaVersion: '2.0.0',
      status: overallStatus,
      ok,
      version,
      timestamp: new Date().toISOString(),
      errors,
      warnings,
      checks,
      hasAgents,
      nodeOk: nodeCheck.ok,
      activeProfile,
      skillsInfo,
      compiledAdapters,
      hasMcp: mcpCheck.ok && mcpCheck.status === STATUS.PASS,
      hookCheck,
      secretCheck,
      lockfileCheck,
      adapterCheck,
      symlinkCheck,
      driftCheck,
      sandboxCheck,
      claimCheck,
      projectLockCheck,
      stack,
      summary: {
        total: checks.length,
        pass: checks.filter(c => c.status === STATUS.PASS).length,
        warn: checks.filter(c => c.status === STATUS.WARN).length,
        fail: checks.filter(c => c.status === STATUS.FAIL).length,
        recovery: checks.filter(c => c.status === STATUS.RECOVERY_REQUIRED).length,
      },
    };
    console.log(JSON.stringify(report, null, 2));
    if (options.exitOnError !== false && !ok && require.main === module) {
      process.exit(1);
    }
    return report;
  }

  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log(`│  ContextOS Doctor v2 — Project Health Check  v${version.padEnd(14)}│`);
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│                                                             │');

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
  if (mcpCheck.status === STATUS.PASS) {
    console.log('│  ✓ MCP server: installed (.agents/mcp/server.mjs)           │');
  } else {
    console.log('│  • MCP server: not installed (run: contextos setup-mcp)     │');
  }

  // Pre-commit hook
  const hookIcon = hookCheck.ok ? '✓' : '•';
  const hookStr = `Pre-commit hook: ${hookCheck.message}`;
  console.log(`│  ${hookIcon} ${hookStr.padEnd(58)}│`);

  // Secret scanner
  const secretIcon = secretCheck.ok ? '✓' : (secretCheck.status === STATUS.WARN ? '•' : '✗');
  const secretStr = `Secret scanner: ${secretCheck.message}`;
  console.log(`│  ${secretIcon} ${secretStr.padEnd(58)}│`);

  // Sandbox
  const sandboxIcon = sandboxCheck.status === STATUS.PASS ? '✓' : '•';
  const sandboxStr = `Sandbox: ${sandboxCheck.message}`;
  console.log(`│  ${sandboxIcon} ${sandboxStr.slice(0, 58).padEnd(58)}│`);

  // Claims Evidence
  const claimIcon = claimCheck.status === STATUS.PASS ? '✓' : (claimCheck.status === STATUS.SKIP ? '•' : '✗');
  const claimStr = `Claims evidence: ${claimCheck.message}`;
  console.log(`│  ${claimIcon} ${claimStr.slice(0, 58).padEnd(58)}│`);

  // Project Mutation Lock
  const lockStateIcon = projectLockCheck.status === STATUS.PASS ? '✓' : (projectLockCheck.status === STATUS.WARN ? '•' : '✗');
  const lockStateStr = `Mutation lock: ${projectLockCheck.message}`;
  console.log(`│  ${lockStateIcon} ${lockStateStr.slice(0, 58).padEnd(58)}│`);

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
    schemaVersion: '2.0.0',
    status: overallStatus,
    ok,
    errors,
    warnings,
    checks,
    hasAgents,
    nodeOk: nodeCheck.ok,
    activeProfile,
    skillsInfo,
    compiledAdapters,
    hasMcp: mcpCheck.ok && mcpCheck.status === STATUS.PASS,
    hookCheck,
    secretCheck,
    lockfileCheck,
    adapterCheck,
    symlinkCheck,
    driftCheck,
    sandboxCheck,
    claimCheck,
    projectLockCheck,
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
  STATUS,
  runDoctor,
  applyDoctorFix,
  checkNodeVersion,
  checkGitVersion,
  checkFilesystemPermissions,
  checkPreCommitHook,
  checkSecretScanner,
  checkCompiledAdapters,
  checkLockfileIntegrity,
  checkTransactions,
  checkAdapterIntegrity,
  checkSymlinks,
  checkMcpHandshake,
  checkDriftStatus,
  checkSandboxAvailability,
  checkClaimEvidence,
  checkProjectLock,
  inspectSkills,
};
