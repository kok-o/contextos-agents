#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const profiles = require('../.agents/profiles.js');
const { isKnownCommand, getStatus, formatStatusText } = require('./commands.js');
const { detectProjectAttributes } = require('./lib/detector.js');
const lockfileLib = require('./lib/lockfile.js');

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  help:        args.includes('--help') || args.includes('-h'),
  ver:         args.includes('--version') || args.includes('-v'),
  dryRun:      args.includes('--dry-run'),
  force:       args.includes('--force'),
  skipCompile: args.includes('--skip-compile'),
  auto:        args.includes('--auto'),
  minimal:     args.includes('--minimal'),
  json:        args.includes('--json'),
  withMcp:     args.includes('--with-mcp') || args.includes('--mcp'),
  agent:       (() => {
    const i = args.indexOf('--agent');
    return i !== -1 ? args[i + 1] : null;
  })(),
  profile:     (() => {
    const i = args.indexOf('--profile');
    return i !== -1 ? args[i + 1] : null;
  })(),
  addSkill:    (() => {
    const i = args.indexOf('--add-skill');
    return i !== -1 ? args[i + 1] : null;
  })(),
};

// ── Help / Version ────────────────────────────────────────────────────────────
if (flags.ver) {
  if (flags.json) {
    console.log(JSON.stringify({ package: 'contextos-agents', version }));
  } else {
    console.log(`contextos-agents v${version}`);
  }
  process.exit(0);
}

if (flags.help) {
  console.log(`
contextos / contextos-agents v${version}
Install AI assistant skills and rules into your project.

Usage:
  npx contextos-agents init [options]
  npx contextos-agents <command> [args...]
  contextos <command> [args...]

Options:
  --help, -h          Show this help message
  --version, -v       Show version number
  --json              Output machine-readable JSON format
  --agent <name>      Target AI agent or IDE (gemini, claude, cursor, auto)
  --dry-run           Preview what will be copied without making changes
  --force             Overwrite an existing .agents/ folder
  --minimal           Install only 5 core skills (lightweight footprint)
  --profile <name>    Install a specific profile (mvp, startup, enterprise, frontend, backend)
  --auto              Auto-detect tech stack and apply recommended profile
  --with-mcp, --mcp   Install with MCP execution server enabled (.agents/mcp/ & mcp_config.json)
  --skip-compile      Skip running ctx.js export after installation
  --add-skill <ref>   Install a community plugin skill after setup

Commands:
  init                Install and configure .agents/ in target project
  status              Display project configuration, active profile, and lockfile status
  update              Safely update skills without overwriting custom changes
  uninstall           Safely uninstall ContextOS files (preserves user custom skills)
  doctor              Run full project diagnostic health check
  audit               Validate local skills (alias for validate)
  validate            Validate local skills, frontmatter, and sync
  profile <subcmd>    Manage profiles (list, apply, show, remove)
  export <target>     Export skills (gemini, claude, cursor, copilot, aider, zed, all)
  resolve <prompt>    Dynamically resolve minimal skills for a prompt or files
  stats               Display token context savings report
  watch               Start continuous file watcher and auto-sync daemon
  detect              Analyze project and display detected tech stack & IDE
  install-skill       Interactive skill installer (or pass <ref> / --from-repo)
  setup-mcp           Add MCP execution server to an existing .agents/ project

Profiles:
  mvp                 Fastest shipping, minimalist monolith, excludes microservices & DDD
  startup             Balanced agile stack (modular monolith, security, testing)
  enterprise          Maximum rigor (DDD, microservices, security audit, ADRs, 80%+ tests)
  frontend            Frontend-focused (React, Next.js, UI/UX Pro, Accessibility, Design)
  backend             Backend-focused (Node, FastAPI, NestJS, DDD, Microservices, DB)
  hackathon           Rapid hackathon prototyping

Plugin ref formats:
  username/repo                    GitHub repo with a SKILL.md at the root
  username/repo@commit             GitHub repo pinned to a commit
  username/repo/path/to/skill      GitHub skill in a subdirectory
  npm-package-name                 A skill published as an npm package
  @scope/npm-package               A scoped npm skill package

Examples:
  npx contextos-agents init                     Install .agents/ with auto-detected stack
  npx contextos-agents init --agent auto        Install and configure for detected stack & IDE
  npx contextos-agents init --minimal           Install only 5 core essential skills
  npx contextos status                          Show project configuration and lockfile status
  npx contextos doctor                          Run project health check
  npx contextos export gemini                   Compile skills for Gemini
`);
  process.exit(0);
}

// ── Top-level Commands & Proxy Routing ────────────────────────────────────────
const mainCommand = args[0] && !args[0].startsWith('-') ? args[0] : null;

// Unknown command check
if (mainCommand && mainCommand !== 'init' && !isKnownCommand(mainCommand)) {
  if (flags.json) {
    console.error(JSON.stringify({ error: `Unknown command: ${mainCommand}`, code: 1 }));
  } else {
    console.error(`[ERROR] Unknown command: ${mainCommand}`);
    console.error('        Run `npx contextos-agents --help` to view available commands.');
  }
  process.exit(1);
}

// Status command
if (mainCommand === 'status') {
  const status = getStatus(process.cwd());
  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(formatStatusText(status));
  }
  process.exit(0);
}

// Detect command
if (mainCommand === 'detect') {
  const detection = detectProjectAttributes(process.cwd());
  if (flags.json) {
    console.log(JSON.stringify(detection, null, 2));
  } else {
    console.log('\nContextOS — Tech Stack & Environment Detection\n');
    console.log(`  Detected Technologies : ${detection.summary.technologies.join(', ')}`);
    console.log(`  Detected Environments : ${detection.summary.ides.join(', ')}`);
    console.log(`  Recommended Profile   : ${detection.summary.recommendedProfile}`);
    console.log(`  Recommended Agents    : ${detection.summary.recommendedAgents.join(', ')}`);
    console.log(`  Recommended Skills    : ${detection.summary.recommendedSkills.join(', ')}\n`);
  }
  process.exit(0);
}

// Doctor command
if (mainCommand === 'doctor') {
  const doctorModule = require('../.agents/doctor.js');
  const result = doctorModule.runDoctor(process.cwd(), { json: flags.json });
  process.exit(result && result.ok === false ? 1 : 0);
}

// Proxy commands to .agents/ctx.js when executed in a ContextOS project
const PROXY_COMMANDS = [
  'profile', 'export', 'validate', 'resolve', 'skill', 'index',
  'clean-worktrees', 'stats', 'watch'
];

const ctxPath = path.join(process.cwd(), '.agents', 'ctx.js');
const hasLocalCtx = fs.existsSync(ctxPath);

if (mainCommand && PROXY_COMMANDS.includes(mainCommand) && hasLocalCtx) {
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [ctxPath, ...args], { stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status || 1);
  }
  process.exit(0);
}

// Fallbacks when running outside an initialized .agents/ directory
if (mainCommand === 'update') {
  const { runUpdate } = require('./commands/update.js');
  runUpdate(process.cwd(), {
    dryRun: flags.dryRun,
    skipCompile: flags.skipCompile,
    profile: flags.profile,
  });
  process.exit(0);
}

if (mainCommand === 'uninstall') {
  const { runUninstall } = require('./commands/uninstall.js');
  runUninstall(process.cwd(), {
    dryRun: flags.dryRun,
  });
  process.exit(0);
}

if (mainCommand === 'stats') {
  const statsModule = require('../.agents/stats.js');
  statsModule.runStats(process.cwd());
  process.exit(0);
}

if (mainCommand === 'watch') {
  const watchModule = require('../.agents/watch.js');
  watchModule.runWatch(process.cwd());
}

const PROJECT_ONLY_COMMANDS = ['profile', 'export', 'validate', 'resolve', 'skill', 'index', 'clean-worktrees'];
if (mainCommand && PROJECT_ONLY_COMMANDS.includes(mainCommand) && !hasLocalCtx) {
  console.error('[ERROR] .agents/ctx.js not found in current directory.');
  console.error('        Are you in a ContextOS project? Run `contextos` or `npx contextos-agents` first.');
  process.exit(1);
}

if (mainCommand === 'audit') {
  if (!hasLocalCtx) {
    console.error('[ERROR] .agents/ctx.js not found. Are you in a ContextOS project?');
    process.exit(1);
  }
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [ctxPath, 'validate'], { stdio: 'inherit' });
  } catch (e) {
    process.exit(1);
  }
  process.exit(0);
}

if (mainCommand === 'install-skill') {
  const ctxPath = path.join(process.cwd(), '.agents', 'ctx.js');
  if (!fs.existsSync(ctxPath)) {
    console.error('[ERROR] .agents/ctx.js not found. Are you in a ContextOS project?');
    process.exit(1);
  }
  
  const fromRepo = (() => {
    const i = args.indexOf('--from-repo');
    return i !== -1 ? args[i + 1] : null;
  })();
  
  const ref = fromRepo || (args[1] && !args[1].startsWith('-') ? args[1] : null);
  
  if (ref) {
    const { execFileSync } = require('child_process');
    try {
      execFileSync(process.execPath, [ctxPath, 'skill', 'add', ref], { stdio: 'inherit' });
    } catch (e) {
      process.exit(1);
    }
    process.exit(0);
  } else {
    // Interactive menu using standard library readline
    (async () => {
      try {
        const readline = require('readline');
        const https = require('https');
        
        console.log('Fetching community skills from registry...');
        
        const fetchRegistry = () => new Promise((resolve, reject) => {
          https.get('https://raw.githubusercontent.com/kok-o/contextos-agents/main/registry.json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (err) {
                reject(err);
              }
            });
          }).on('error', reject);
        });
        
        const registry = await fetchRegistry();
        const skillsList = (registry.skills || []).map((s, idx) => ({
          idx: idx + 1,
          name: s.name,
          desc: s.description || '',
          value: s.github ? `${s.github}${s.path ? '/' + s.path : ''}` : s.npm
        }));

        if (skillsList.length === 0) {
          console.log('No community skills found in registry.');
          process.exit(0);
        }

        console.log('\nAvailable community skills:\n');
        for (const item of skillsList) {
          console.log(`  [${item.idx}] ${item.name.padEnd(20)} ${item.desc}`);
        }
        console.log('\nEnter skill numbers to install (comma-separated, e.g. 1, 3) or press Enter to cancel:');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise((resolve) => {
          rl.question('> ', (ans) => {
            rl.close();
            resolve(ans.trim());
          });
        });

        if (!answer) {
          console.log('No skills selected. Operation cancelled.');
          process.exit(0);
        }

        const selectedIndices = answer
          .split(/[\s,]+/)
          .map(n => parseInt(n, 10))
          .filter(n => !isNaN(n) && n >= 1 && n <= skillsList.length);

        const selectedSkills = selectedIndices.map(n => skillsList[n - 1].value);

        if (selectedSkills.length === 0) {
          console.log('No valid skill numbers selected.');
          process.exit(0);
        }

        const { execFileSync } = require('child_process');
        for (const skillRef of selectedSkills) {
          try {
            console.log(`\nInstalling ${skillRef}...`);
            execFileSync(process.execPath, [ctxPath, 'skill', 'add', skillRef], { stdio: 'inherit' });
          } catch (e) {
            console.error(`Failed to install ${skillRef}`);
          }
        }
      } catch (error) {
        console.error('Failed to run interactive installer:', error.message);
        process.exit(1);
      }
    })();
  }
} else if (mainCommand === 'setup-mcp') {
  const targetPath = path.join(process.cwd(), '.agents');
  if (!fs.existsSync(targetPath)) {
    console.error('[ERROR] .agents/ folder not found in current directory.');
    console.error('        Run `npx contextos-agents` first or `npx contextos-agents --with-mcp`.');
    process.exit(1);
  }

  const sourceMcp = path.join(__dirname, '..', '.agents', 'mcp');
  const targetMcp = path.join(targetPath, 'mcp');
  if (!fs.existsSync(sourceMcp)) {
    console.error('[ERROR] Source MCP server bundle not found in package.');
    process.exit(1);
  }

  try {
    fs.cpSync(sourceMcp, targetMcp, { recursive: true, force: true });
    console.log('[OK] Installed ContextOS MCP execution server into .agents/mcp/');

    const mcpConfigPath = path.join(targetPath, 'mcp_config.json');
    if (!fs.existsSync(mcpConfigPath) || flags.force) {
      const defaultMcpConfig = {
        mcpServers: {
          "contextos": {
            command: "node",
            args: ["./.agents/mcp/server.mjs", "--dir", "."]
          }
        }
      };
      fs.writeFileSync(mcpConfigPath, JSON.stringify(defaultMcpConfig, null, 2));
      console.log('[OK] Created MCP configuration (.agents/mcp_config.json)');
    } else {
      console.log('[INFO] Existing .agents/mcp_config.json retained.');
    }
    console.log('\n[SUCCESS] ContextOS MCP execution layer is configured.');
    console.log('You can now use parallel subagents and git worktrees in your MCP-compatible IDE.\n');
  } catch (err) {
    console.error('[ERROR] Failed to configure MCP:', err.message);
    process.exit(1);
  }
  process.exit(0);
} else {

// ── Paths ─────────────────────────────────────────────────────────────────────
const sourcePath = path.join(__dirname, '..', '.agents');
const targetPath = path.join(process.cwd(), '.agents');

const MINIMAL_SKILLS = new Set([
  'engineering-workflow',
  'ponytail-mindset',
  'gstack-roles',
  'gemini-precision',
  'react',
]);

function uniqueSiblingPath(basePath, suffix) {
  let candidate = `${basePath}.${suffix}`;
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${basePath}.${suffix}-${index++}`;
  }
  return candidate;
}

/**
 * Copy into a staging directory then replace the target with rollback.
 */
function installAtomically(source, target, options = {}) {
  const stagingPath = uniqueSiblingPath(target, 'staging');
  const backupPath = uniqueSiblingPath(target, 'backup');
  let movedExisting = false;

  try {
    fs.cpSync(source, stagingPath, {
      recursive: true,
      force: true,
      filter: (src) => {
        const norm = src.replace(/\\/g, '/');
        if (!options.withMcp) {
          if (norm.endsWith('/mcp') || norm.includes('/mcp/') || norm.endsWith('/mcp_config.json')) {
            return false;
          }
        }
        if (options.minimal) {
          const skillMatch = norm.match(/\/core\/skills\/([^/]+)/);
          if (skillMatch && !MINIMAL_SKILLS.has(skillMatch[1])) {
            return false;
          }
          const genMatch = norm.match(/\/generated\/gemini\/skills\/([^/]+)/);
          if (genMatch && !MINIMAL_SKILLS.has(genMatch[1])) {
            return false;
          }
        }
        return true;
      },
    });
    if (fs.existsSync(target)) {
      fs.renameSync(target, backupPath);
      movedExisting = true;
    }
    fs.renameSync(stagingPath, target);
    if (movedExisting) {
      try {
        fs.rmSync(backupPath, { recursive: true, force: true });
      } catch {
        console.warn(`[WARN] Installed successfully; backup retained at ${backupPath}`);
      }
    }
  } catch (error) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
    if (movedExisting && !fs.existsSync(target) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, target);
    }
    throw error;
  }
}

// ── Stack & IDE detection ───────────────────────────────────────────────────
const projectAttrs = detectProjectAttributes(process.cwd());
const stackDetection = projectAttrs.stack;
const ideDetection = projectAttrs.ide;

const targetProfile = flags.profile || (flags.auto || flags.agent === 'auto' ? stackDetection.recommendedProfile : 'none');
const targetAgents = (flags.agent === 'auto' || flags.auto)
  ? ideDetection.recommendedAgents
  : (flags.agent ? [flags.agent] : ['gemini']);

// ── Dry run ───────────────────────────────────────────────────────────────────
if (flags.dryRun) {
  if (!fs.existsSync(sourcePath)) {
    console.error('[ERROR] Source .agents/ folder not found in package.');
    process.exit(1);
  }
  const countFiles = (dir) => {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const norm = full.replace(/\\/g, '/');
      if (!flags.withMcp) {
        if (norm.endsWith('/mcp') || norm.includes('/mcp/') || norm.endsWith('/mcp_config.json')) {
          continue;
        }
      }
      if (flags.minimal) {
        const skillMatch = norm.match(/\/core\/skills\/([^/]+)/);
        if (skillMatch && !MINIMAL_SKILLS.has(skillMatch[1])) {
          continue;
        }
        const genMatch = norm.match(/\/generated\/gemini\/skills\/([^/]+)/);
        if (genMatch && !MINIMAL_SKILLS.has(genMatch[1])) {
          continue;
        }
      }
      count += entry.isDirectory() ? countFiles(full) : 1;
    }
    return count;
  };
  const total = countFiles(sourcePath);

  if (flags.json) {
    console.log(JSON.stringify({
      dryRun: true,
      targetPath,
      targetProfile,
      detectedStack: stackDetection.detected,
      detectedIde: ideDetection.detected,
      targetAgents,
      filesCount: total,
      minimal: flags.minimal,
      withMcp: flags.withMcp,
    }, null, 2));
    process.exit(0);
  }

  console.log('[DRY-RUN] No files will be written.\n');
  if (fs.existsSync(targetPath)) {
    console.log(`[WARN] .agents/ already exists — would be overwritten with --force.`);
  } else {
    console.log(`[OK] Would create .agents/ in: ${process.cwd()}`);
  }
  console.log(`[INFO] Detected stack: ${stackDetection.detected.length ? stackDetection.detected.join(', ') : 'Generic JavaScript'}`);
  if (ideDetection.detected.length > 0) {
    console.log(`[INFO] Detected IDEs: ${ideDetection.detected.join(', ')}`);
  }
  console.log(`[INFO] Selected profile: ${targetProfile}`);
  console.log(`[INFO] Target agents for export: ${targetAgents.join(', ')}`);
  if (flags.minimal) {
    console.log(`[INFO] Minimal mode: copying only 5 core essential skills`);
  }
  console.log(`[INFO] ${total} files would be copied from the package.`);
  console.log('\nRun without --dry-run to apply changes.');
  process.exit(0);
}

// ── Main install ──────────────────────────────────────────────────────────────
if (!flags.json) {
  console.log('Installing AI assistant skills (.agents/)...');
}

try {
  if (!fs.existsSync(sourcePath)) {
    console.error('[ERROR] Source .agents/ folder not found in package.');
    process.exit(1);
  }

  if (fs.existsSync(targetPath) && !flags.force) {
    console.error('[ERROR] .agents/ already exists. Refusing to overwrite it.');
    console.error('        Re-run with --force only after backing up your custom skills.');
    process.exit(1);
  }

  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    console.error('[ERROR] Refusing to install the package into itself. Run this command from the target project.');
    process.exit(1);
  }

  installAtomically(sourcePath, targetPath, { withMcp: flags.withMcp, minimal: flags.minimal });

  // ── Create/update lockfile for provenance & safe lifecycle ─────────────────
  const selectedProfile = flags.profile || (flags.auto || flags.agent === 'auto' ? stackDetection.recommendedProfile : null);
  try {
    lockfileLib.migrateExistingInstallation(process.cwd(), sourcePath, {
      selectedProfile: selectedProfile || 'none',
      installedPackage: 'contextos-agents',
      version,
    });
  } catch (err) {
    if (!flags.json) console.warn(`[WARN] Could not generate lockfile: ${err.message}`);
  }

  if (!flags.json) {
    console.log('[OK] .agents/ successfully installed in your project!');
    if (flags.minimal) {
      console.log('[OK] Minimal profile: 5 core skills installed.');
      console.log('     (engineering-workflow, ponytail-mindset, gstack-roles, gemini-precision, react)');
      console.log('     Tip: Add more skills anytime with: contextos skill add <name>');
    }
    if (stackDetection.detected.length > 0) {
      console.log(`[OK] Detected project stack: ${stackDetection.detected.join(', ')}`);
    }
    if (ideDetection.detected.length > 0) {
      console.log(`[OK] Detected developer environment: ${ideDetection.detected.join(', ')}`);
    }
  }

  // ── Create mcp_config.json only if --with-mcp ────────────────────────────────
  if (flags.withMcp) {
    const mcpConfigPath = path.join(targetPath, 'mcp_config.json');
    if (!fs.existsSync(mcpConfigPath)) {
      const defaultMcpConfig = {
        mcpServers: {
          "contextos": {
            command: "node",
            args: ["./.agents/mcp/server.mjs", "--dir", "."]
          }
        }
      };
      fs.writeFileSync(mcpConfigPath, JSON.stringify(defaultMcpConfig, null, 2));
      if (!flags.json) console.log('[OK] Created default MCP configuration (.agents/mcp_config.json)');
    }
  }

  // ── Apply profile if requested or auto ──────────────────────────────────────
  if (selectedProfile) {
    try {
      const applied = profiles.applyProfile(selectedProfile, process.cwd());
      if (!flags.json) console.log(`[OK] Applied profile '${applied.name}' (excluded: ${(applied.exclude_skills || []).join(', ') || 'none'})`);
    } catch (e) {
      if (!flags.json) console.warn(`[WARN] Could not apply profile '${selectedProfile}': ${e.message}`);
    }
  }

  if (!flags.json) {
    console.log('[OK] Your AI assistant now has skills and rules configured.\n');
  }

  // ── Auto-compile skills for target agents ──────────────────────────────────
  if (!flags.skipCompile) {
    const ctxPath = path.join(targetPath, 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      const { execFileSync } = require('child_process');
      for (const ag of targetAgents) {
        if (!flags.json) console.log(`Compiling skills for ${ag}...`);
        try {
          execFileSync(process.execPath, [ctxPath, 'export', ag], {
            cwd: process.cwd(),
            stdio: flags.json ? 'ignore' : 'inherit',
          });
        } catch (e) {
          if (!flags.json) {
            console.warn(`[WARN] Skill compilation for '${ag}' failed — run manually:`);
            console.warn(`       contextos export ${ag}`);
          }
        }
      }
    }
  } else if (!flags.json) {
    console.log('Tip: Run `contextos export gemini` to compile skills.');
  }

  // ── --add-skill flag ────────────────────────────────────────────────────────
  if (flags.addSkill) {
    const ctxPath = path.join(targetPath, 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      if (!flags.json) console.log(`Installing plugin skill: ${flags.addSkill}`);
      try {
        const { execFileSync } = require('child_process');
        execFileSync(process.execPath, [ctxPath, 'skill', 'add', flags.addSkill], {
          cwd: process.cwd(),
          stdio: flags.json ? 'ignore' : 'inherit',
        });
      } catch (e) {
        if (!flags.json) {
          console.warn(`[WARN] Skill install failed — run manually:`);
          console.warn(`       node .agents/ctx.js skill add ${flags.addSkill}`);
        }
      }
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({
      success: true,
      package: 'contextos-agents',
      version,
      projectDir: process.cwd(),
      profile: selectedProfile || 'default',
      agents: targetAgents,
      withMcp: flags.withMcp,
      minimal: flags.minimal,
    }, null, 2));
    process.exit(0);
  }

  console.log('\n Next steps:');
  console.log('  1. Open your project in your AI assistant');
  console.log('  2. The assistant will automatically load .agents/AGENTS.md');
  console.log('  3. Inspect project health anytime:');
  console.log('       contextos doctor');
  console.log('  4. Switch profiles anytime:');
  console.log('       contextos profile list');
  console.log('       contextos profile apply mvp');
  console.log('  5. Export to other AI tools:');
  console.log('       contextos export cursor   → .cursorrules & .cursor/rules');
  console.log('       contextos export copilot  → .github/copilot-instructions.md');
  console.log('       contextos export aider    → .aider.conf.yml + CONVENTIONS.md');
  console.log('  6. Add community skills (plugins):');
  console.log('       contextos skill add   username/my-skill');
  console.log('       contextos skill list');
  if (!flags.withMcp) {
    console.log('  7. Enable MCP parallel subagents & worktrees (optional):');
    console.log('       contextos setup-mcp');
  }
  console.log('');

} catch (error) {
  if (flags.json) {
    console.error(JSON.stringify({ success: false, error: error.message }));
  } else {
    console.error('[ERROR] Installation failed:', error.message);
  }
  process.exit(1);
}

} // end of main install else block
