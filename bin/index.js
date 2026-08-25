#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const profiles = require('../.agents/profiles.js');

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  help:        args.includes('--help') || args.includes('-h'),
  ver:         args.includes('--version') || args.includes('-v'),
  dryRun:      args.includes('--dry-run'),
  force:       args.includes('--force'),
  skipCompile: args.includes('--skip-compile'),
  auto:        args.includes('--auto'),
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
  console.log(`koko-contextos-agents v${version}`);
  process.exit(0);
}

if (flags.help) {
  console.log(`
koko-contextos-agents v${version}
Install AI assistant skills and rules into your project.

Usage:
  npx koko-contextos-agents [options]

Options:
  --help, -h          Show this help message
  --version, -v       Show version number
  --dry-run           Preview what will be copied without making changes
  --force             Overwrite an existing .agents/ folder
  --profile <name>    Install a specific profile (mvp, startup, enterprise, frontend, backend)
  --auto              Auto-detect tech stack and apply recommended profile
  --skip-compile      Skip running ctx.js export after installation
  --add-skill <ref>   Install a community plugin skill after setup

Commands:
  audit               Validate local skills (alias for validate)
  detect              Analyze project and display detected tech stack
  install-skill       Interactive skill installer (or pass <ref> / --from-repo)

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
  npx koko-contextos-agents                          Install .agents/ into current project
  npx koko-contextos-agents --profile mvp            Install with MVP profile
  npx koko-contextos-agents --auto                   Auto-detect tech stack and configure
  npx koko-contextos-agents --dry-run                Preview files that would be copied
  npx koko-contextos-agents --add-skill alice/my-skill

Export skills to your AI tool:
  node .agents/ctx.js export gemini    → .agents/generated/gemini/   (Gemini / Antigravity)
  node .agents/ctx.js export claude    → .agents/generated/claude/   (Claude Code)
  node .agents/ctx.js export cursor    → .cursorrules & .cursor/rules (Cursor IDE)
  node .agents/ctx.js export copilot   → .github/copilot-instructions.md
  node .agents/ctx.js export aider     → .aider.conf.yml + CONVENTIONS.md
  node .agents/ctx.js export zed       → .zed/rules.md & .zed/prompts/ (Zed IDE)
  node .agents/ctx.js export all       → all of the above

Profile commands (after installation):
  node .agents/ctx.js profile list           List available profiles
  node .agents/ctx.js profile apply <name>   Switch project profile
  node .agents/ctx.js detect                 Detect project tech stack
`);
  process.exit(0);
}

// ── Top-level Commands ────────────────────────────────────────────────────────
const mainCommand = args[0] && !args[0].startsWith('-') ? args[0] : null;

if (mainCommand === 'audit') {
  const ctxPath = path.join(process.cwd(), '.agents', 'ctx.js');
  if (!fs.existsSync(ctxPath)) {
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

if (mainCommand === 'detect') {
  const stack = profiles.detectStack(process.cwd());
  console.log('\nContextOS — Tech Stack Detection\n');
  console.log(`  Detected Technologies : ${stack.detected.length ? stack.detected.join(', ') : 'Generic JavaScript'}`);
  console.log(`  Recommended Profile   : ${stack.recommendedProfile}`);
  console.log(`  Recommended Skills    : ${stack.recommendedSkills.join(', ')}\n`);
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
    // Interactive menu
    (async () => {
      try {
        const inquirer = require('inquirer');
        const https = require('https');
        
        console.log('Fetching community skills from registry...');
        
        const fetchRegistry = () => new Promise((resolve, reject) => {
          https.get('https://raw.githubusercontent.com/kok-o/koko-contextos-agents/main/registry.json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });
        
        const registry = await fetchRegistry();
        const choices = registry.skills.map(s => ({
          name: `${s.name} - ${s.description}`,
          value: s.github ? `${s.github}${s.path ? '/' + s.path : ''}` : s.npm
        }));
        
        const answers = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedSkills',
            message: 'Select skills to install:',
            choices
          }
        ]);
        
        if (!answers.selectedSkills || answers.selectedSkills.length === 0) {
          console.log('No skills selected.');
          process.exit(0);
        }
        
        const { execFileSync } = require('child_process');
        for (const skillRef of answers.selectedSkills) {
          try {
            execFileSync(process.execPath, [ctxPath, 'skill', 'add', skillRef], { stdio: 'inherit' });
          } catch (e) {
            console.error(`Failed to install ${skillRef}`);
          }
        }
      } catch (error) {
        console.error('Failed to run interactive installer:', error.message);
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('inquirer')) {
          console.error('It seems inquirer is not installed. Did you run npm install?');
        }
        process.exit(1);
      }
    })();
  }
} else {

// ── Paths ─────────────────────────────────────────────────────────────────────
const sourcePath = path.join(__dirname, '..', '.agents');
const targetPath = path.join(process.cwd(), '.agents');

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
function installAtomically(source, target) {
  const stagingPath = uniqueSiblingPath(target, 'staging');
  const backupPath = uniqueSiblingPath(target, 'backup');
  let movedExisting = false;

  try {
    fs.cpSync(source, stagingPath, { recursive: true, force: true });
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

// ── Stack detection ───────────────────────────────────────────────────────────
const stackDetection = profiles.detectStack(process.cwd());

// ── Dry run ───────────────────────────────────────────────────────────────────
if (flags.dryRun) {
  console.log('[DRY-RUN] No files will be written.\n');
  if (!fs.existsSync(sourcePath)) {
    console.error('[ERROR] Source .agents/ folder not found in package.');
    process.exit(1);
  }
  const countFiles = (dir) => {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      count += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
    }
    return count;
  };
  const total = countFiles(sourcePath);
  if (fs.existsSync(targetPath)) {
    console.log(`[WARN] .agents/ already exists — would be overwritten with --force.`);
  } else {
    console.log(`[OK] Would create .agents/ in: ${process.cwd()}`);
  }
  console.log(`[INFO] Detected stack: ${stackDetection.detected.length ? stackDetection.detected.join(', ') : 'Generic JavaScript'}`);
  const targetProfile = flags.profile || (flags.auto ? stackDetection.recommendedProfile : 'none');
  console.log(`[INFO] Selected profile: ${targetProfile}`);
  console.log(`[INFO] ${total} files would be copied from the package.`);
  console.log('\nRun without --dry-run to apply changes.');
  process.exit(0);
}

// ── Main install ──────────────────────────────────────────────────────────────
console.log('Installing AI assistant skills (.agents/)...');

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

  installAtomically(sourcePath, targetPath);

  console.log('[OK] .agents/ successfully installed in your project!');
  if (stackDetection.detected.length > 0) {
    console.log(`[OK] Detected project stack: ${stackDetection.detected.join(', ')}`);
  }

  // ── Create mcp_config.json ───────────────────────────────────────────────────
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
    console.log('[OK] Created default MCP configuration (.agents/mcp_config.json)');
  }

  // ── Apply profile if requested or auto ──────────────────────────────────────
  const selectedProfile = flags.profile || (flags.auto ? stackDetection.recommendedProfile : null);
  if (selectedProfile) {
    try {
      const applied = profiles.applyProfile(selectedProfile, process.cwd());
      console.log(`[OK] Applied profile '${applied.name}' (excluded: ${(applied.exclude_skills || []).join(', ') || 'none'})`);
    } catch (e) {
      console.warn(`[WARN] Could not apply profile '${selectedProfile}': ${e.message}`);
    }
  }

  console.log('[OK] Your AI assistant now has skills and rules configured.\n');

  // ── Auto-compile skills ───────────────────────────────────────────────────
  if (!flags.skipCompile) {
    const ctxPath = path.join(targetPath, 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      console.log('Compiling skills for Gemini...');
      try {
        const { execFileSync } = require('child_process');
        execFileSync(process.execPath, [ctxPath, 'export', 'gemini'], {
          cwd: process.cwd(),
          stdio: 'inherit',
        });
      } catch (e) {
        console.warn('[WARN] Skill compilation failed — run manually:');
        console.warn('       node .agents/ctx.js export gemini');
      }
    }
  } else {
    console.log('Tip: Run `node .agents/ctx.js export gemini` to compile skills.');
  }

  console.log('\n Next steps:');
  console.log('  1. Open your project in your AI assistant');
  console.log('  2. The assistant will automatically load .agents/AGENTS.md');
  console.log('  3. Skills are pre-compiled in .agents/generated/gemini/skills/');
  console.log('  4. Switch profiles anytime:');
  console.log('       node .agents/ctx.js profile list');
  console.log('       node .agents/ctx.js profile apply mvp');
  console.log('  5. Export to other AI tools:');
  console.log('       node .agents/ctx.js export cursor   → .cursorrules & .cursor/rules');
  console.log('       node .agents/ctx.js export copilot  → .github/copilot-instructions.md');
  console.log('       node .agents/ctx.js export aider    → .aider.conf.yml + CONVENTIONS.md');
  console.log('  6. Add community skills (plugins):');
  console.log('       node .agents/ctx.js skill add   username/my-skill');
  console.log('       node .agents/ctx.js skill list\n');

  // ── --add-skill flag ────────────────────────────────────────────────────────
  if (flags.addSkill) {
    const ctxPath = path.join(targetPath, 'ctx.js');
    if (fs.existsSync(ctxPath)) {
      console.log(`Installing plugin skill: ${flags.addSkill}`);
      try {
        const { execFileSync } = require('child_process');
        execFileSync(process.execPath, [ctxPath, 'skill', 'add', flags.addSkill], {
          cwd: process.cwd(),
          stdio: 'inherit',
        });
      } catch (e) {
        console.warn(`[WARN] Skill install failed — run manually:`);
        console.warn(`       node .agents/ctx.js skill add ${flags.addSkill}`);
      }
    }
  }

} catch (error) {
  console.error('[ERROR] Installation failed:', error.message);
  process.exit(1);
}

} // end of main install else block
