/**
 * .agents/ctx.js
 * ContextOS — Main CLI Dispatcher and Context Engine
 *
 * Provides subcommands for:
 *   - export: compiling skills for diverse agent formats (Gemini, Claude, Cursor, Copilot, Aider, Zed)
 *   - profile: managing project profiles (list, show, apply, remove)
 *   - resolve: dynamic on-demand skill resolution for prompts and file lists
 *   - index: progressive skills index generation
 *   - detect: tech stack detection
 *   - validate / audit: skill source, frontmatter, and sync validation
 *   - skill: plugin management (add, remove, list, search)
 */

const process = require('process');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0) {
  printHelp();
  process.exit(1);
}

/**
 * Prints usage instructions and supported CLI commands.
 */
function printHelp() {
  console.log('Usage: node ctx.js <command> [args...]');
  console.log('');
  console.log('Commands:');
  console.log('  export gemini [--profile <p>]   Compile skills for Gemini / Antigravity');
  console.log('  export claude [--profile <p>]   Compile skills for Claude Code');
  console.log('  export cursor [--profile <p>]   Compile skills → .cursorrules & .cursor/rules/*.mdc');
  console.log('  export copilot [--profile <p>]  Compile skills → .github/copilot-instructions.md');
  console.log('  export aider [--profile <p>]    Compile skills → .aider.conf.yml + CONVENTIONS.md');
  console.log('  export zed [--profile <p>]      Compile skills → .zed/rules.md & .zed/prompts/*.md');
  console.log('  export all [--profile <p>]      Compile skills for all supported agents');
  console.log('  profile list                    List available project profiles');
  console.log('  profile show <name>             Show profile configuration');
  console.log('  profile apply <name>            Apply a profile (e.g. mvp, startup, enterprise, frontend)');
  console.log('  profile remove                  Remove active profile filter');
  console.log('  resolve <prompt>                Resolve minimal skills needed for a task');
  console.log('  index                           Generate progressive skills-index.json');
  console.log('  detect                          Auto-detect project tech stack');
  console.log('  compile [--check] [--sarif]     Compile skill manifests into deterministic registry v2');
  console.log('  audit                           Alias for validate (check skills)');
  console.log('  validate                        Validate skill sources, frontmatter, deps & sync');
  console.log('  clean-worktrees                 Clean up lingering .swarm-worktrees and swarm/* branches');
  console.log('  doctor                          Run project diagnostic health check');
  console.log('  stats                           Display token context savings report');
  console.log('  watch                           Start continuous file watcher and auto-sync daemon');
  console.log('  init                            Show initialization guide');
  console.log('  install-skill <ref>             Alias for skill add (install a plugin)');
  console.log('  skill add   <ref>               Install a plugin skill (GitHub or npm)');
  console.log('  skill remove <name>             Uninstall a plugin skill');
  console.log('  skill list                      List installed skills (builtin + plugins)');
  console.log('  skill search [query]            Search the community skill registry');
  console.log('');
  console.log('Plugin ref formats:');
  console.log('  username/repo                    GitHub repo root SKILL.md');
  console.log('  username/repo@commit             GitHub repo pinned to a commit');
  console.log('  username/repo/path/to/skill      GitHub subpath skill');
  console.log('  npm-package-name                 npm package');
  console.log('  @scope/npm-package               scoped npm package');
  console.log('');
  console.log('Examples:');
  console.log('  node .agents/ctx.js resolve "Build an accessible modal component"');
  console.log('  node .agents/ctx.js profile list');
  console.log('  node .agents/ctx.js profile apply mvp');
  console.log('  node .agents/ctx.js detect');
  console.log('  node .agents/ctx.js export all --profile frontend');
  console.log('  node .agents/ctx.js skill add alice/my-cool-skill');
}

// ── Helper: parse checksum flag ─────────────────────────────────────────────
function extractChecksum(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--checksum=')) {
      return argv[i].split('=')[1];
    }
    if (argv[i] === '--checksum' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      return argv[i + 1];
    }
  }
  return undefined;
}

const command = args[0];
const target  = args[1];

// ── export ────────────────────────────────────────────────────────────────────
if (command === 'export') {
  const profileFlagIdx = args.indexOf('--profile');
  if (profileFlagIdx !== -1 && args[profileFlagIdx + 1]) {
    const profiles = require('./profiles.js');
    const profileName = args[profileFlagIdx + 1];
    try {
      profiles.applyProfile(profileName);
      console.log(`[PROFILE] Applied profile '${profileName}' for this export.\n`);
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
  }

  const runGemini = () => {
    const adapter = require('./adapters/gemini/export.js');
    adapter.run();
  };

  const runClaude = () => {
    const adapter = require('./adapters/claude/export.js');
    adapter.run();
  };

  const runCursor = () => {
    const adapter = require('./adapters/cursor/export.js');
    adapter.run();
  };

  const runCopilot = () => {
    const adapter = require('./adapters/copilot/export.js');
    adapter.run();
  };

  const runAider = () => {
    const adapter = require('./adapters/aider/export.js');
    adapter.run();
  };

  const runZed = () => {
    const adapter = require('./adapters/zed/export.js');
    adapter.run();
  };

  if (target === 'gemini') {
    runGemini();
  } else if (target === 'claude') {
    runClaude();
  } else if (target === 'cursor') {
    runCursor();
  } else if (target === 'copilot') {
    runCopilot();
  } else if (target === 'aider') {
    runAider();
  } else if (target === 'zed') {
    runZed();
  } else if (target === 'all') {
    console.log('Exporting skills for all agents...\n');
    runGemini();
    console.log('');
    runClaude();
    console.log('');
    runCursor();
    console.log('');
    runCopilot();
    console.log('');
    runAider();
    console.log('');
    runZed();
    console.log('\nAll exports complete.');
  } else {
    console.error(`Adapter for '${target}' not implemented yet.`);
    console.error('Supported agents: gemini, claude, cursor, copilot, aider, zed, all');
    process.exit(1);
  }

// ── profile ───────────────────────────────────────────────────────────────────
} else if (command === 'profile') {
  const subcommand = args[1] || 'list';
  const profileName = args[2];
  const profiles = require('./profiles.js');

  if (subcommand === 'list') {
    const list = profiles.listProfiles();
    const active = profiles.getActiveProfile();
    console.log('\nAvailable ContextOS Profiles:\n');
    for (const p of list) {
      const isActive = active && active.profile === p.id;
      const marker = isActive ? '● [ACTIVE]' : '○';
      console.log(`  ${marker} ${p.id.padEnd(12)} - ${p.name}: ${p.description}`);
      if (p.exclude_skills && p.exclude_skills.length > 0) {
        console.log(`      Excludes: ${p.exclude_skills.join(', ')}`);
      }
    }
    console.log('\nApply a profile: node .agents/ctx.js profile apply <name>');
    if (active) {
      console.log(`Current active profile: ${active.profile} (${active.name})`);
    }
    console.log('');
  } else if (subcommand === 'show') {
    const name = profileName || (profiles.getActiveProfile() || {}).profile;
    if (!name) {
      console.error('[ERROR] Usage: node ctx.js profile show <name>');
      process.exit(1);
    }
    const profile = profiles.getProfile(name);
    if (!profile) {
      console.error(`[ERROR] Profile '${name}' not found.`);
      process.exit(1);
    }
    console.log(`\nProfile: ${profile.name} (${profile.id})`);
    console.log(`Description: ${profile.description}`);
    console.log(`Preferred Skills: ${(profile.prefer_skills || []).join(', ') || 'none'}`);
    console.log(`Excluded Skills: ${(profile.exclude_skills || []).join(', ') || 'none'}\n`);
  } else if (subcommand === 'apply') {
    if (!profileName) {
      console.error('[ERROR] Usage: node ctx.js profile apply <name>');
      process.exit(1);
    }
    try {
      const applied = profiles.applyProfile(profileName);
      console.log(`\n✓ Profile '${applied.name}' successfully applied!`);
      console.log(`  Excluded skills: ${(applied.exclude_skills || []).join(', ') || 'none'}`);
      console.log('  Run: node .agents/ctx.js export all  (to rebuild exports with this profile)\n');
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
  } else if (subcommand === 'remove' || subcommand === 'reset') {
    const removed = profiles.removeActiveProfile();
    if (removed) {
      console.log('\n✓ Active profile filter removed. All skills will be included.\n');
    } else {
      console.log('\nNo active profile was set.\n');
    }
  } else {
    console.error(`Unknown profile subcommand: ${subcommand}`);
    console.error('Valid subcommands: list, show, apply, remove');
    process.exit(1);
  }

// ── resolve ───────────────────────────────────────────────────────────────────
} else if (command === 'resolve') {
  const { CanonicalResolver } = require('./resolver/canonical-resolver.js');
  const promptArgs = args.slice(1).filter(a => !a.startsWith('-')).join(' ');
  const filesIdx = args.indexOf('--files');
  const files = filesIdx !== -1 && args[filesIdx + 1] ? args[filesIdx + 1].split(',') : [];
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx !== -1 && args[phaseIdx + 1] ? args[phaseIdx + 1] : undefined;
  const budgetIdx = args.indexOf('--budget');
  const budget = budgetIdx !== -1 && args[budgetIdx + 1] ? parseInt(args[budgetIdx + 1], 10) : undefined;
  const explain = args.includes('--explain');
  const asJson = args.includes('--json');

  const resolver = new CanonicalResolver({ rootDir: process.cwd() });
  const result = resolver.resolve({
    task: promptArgs,
    files,
    explicitPhase: phase,
    contextBudgetTokens: budget,
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (explain) {
    console.log(resolver.formatExplanation(result));
  } else {
    console.log('\n══════════════════════════════════════════');
    console.log('  ContextOS — Dynamic Skill Resolution');
    console.log('══════════════════════════════════════════');
    console.log(resolver.formatDeclaration(result));
    console.log('──────────────────────────────────────────\n');
  }

// ── index ─────────────────────────────────────────────────────────────────────
} else if (command === 'index') {
  const resolver = require('./resolver.js');
  const index = resolver.buildSkillIndex(process.cwd());
  const fs = require('fs');
  const indexPath = path.join(process.cwd(), '.agents', 'skills-index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ version: '1.0.0', skills: index }, null, 2) + '\n');
  console.log(`\nGenerated progressive skills index with ${index.length} skills → .agents/skills-index.json\n`);

// ── detect ────────────────────────────────────────────────────────────────────
} else if (command === 'detect') {
  const { WorkspaceGraphBuilder } = require('./workspace/workspace-graph.js');
  const profiles = require('./profiles.js');
  const asJson = args.includes('--json');
  const explain = args.includes('--explain');
  const scopeIdx = args.indexOf('--scope');
  const scopeArg = scopeIdx !== -1 && args[scopeIdx + 1] && !args[scopeIdx + 1].startsWith('--')
    ? args[scopeIdx + 1]
    : (args.find(a => a.startsWith('--scope=')) || '').split('=')[1];

  const builder = new WorkspaceGraphBuilder();
  const graph = builder.build(process.cwd());

  if (scopeArg) {
    const nearestPkg = builder.findNearestPackage(scopeArg, graph);
    const evidence = builder.extractPackageEvidence(scopeArg, graph);

    if (asJson) {
      console.log(JSON.stringify({
        scope: scopeArg,
        nearestPackage: nearestPkg,
        evidence,
      }, null, 2));
    } else {
      console.log('\n══════════════════════════════════════════');
      console.log('  ContextOS — Workspace Scoped Detection');
      console.log('══════════════════════════════════════════\n');
      console.log(`  Scope Path       : ${scopeArg}`);
      if (nearestPkg) {
        console.log(`  Nearest Package  : ${nearestPkg.id} (${nearestPkg.ecosystem})`);
        console.log(`  Package Root     : ${nearestPkg.root}`);
        console.log(`  Languages        : ${nearestPkg.languages.join(', ') || 'unspecified'}`);
        console.log(`  Dependencies     : ${nearestPkg.dependencies.length} (${nearestPkg.dependencies.slice(0, 8).join(', ')}${nearestPkg.dependencies.length > 8 ? '...' : ''})`);
        console.log(`  Configs          : ${nearestPkg.configs.join(', ') || 'none'}`);
        if (nearestPkg.internalDependencies.length > 0) {
          console.log(`  Internal Links   : ${nearestPkg.internalDependencies.join(', ')}`);
        }
        if (evidence.length > 0) {
          console.log('\n  Scoped Evidence:');
          for (const ev of evidence.slice(0, 10)) {
            console.log(`    • [${ev.source}] ${ev.target} (+${ev.weight}) — ${ev.description}`);
          }
          if (evidence.length > 10) {
            console.log(`      ... and ${evidence.length - 10} more signals`);
          }
        }
      } else {
        console.log('  Nearest Package  : (none found)');
      }
      console.log('\n──────────────────────────────────────────\n');
    }
  } else if (asJson) {
    const stack = profiles.detectStack(process.cwd());
    console.log(JSON.stringify({
      workspaceGraph: graph,
      stack,
    }, null, 2));
  } else if (explain) {
    console.log('\n══════════════════════════════════════════');
    console.log('  ContextOS — Workspace Evidence Graph');
    console.log('══════════════════════════════════════════\n');
    console.log(`  Repository Root  : ${graph.repositoryRoot}`);
    console.log(`  Fingerprint      : ${graph.fingerprint}`);
    console.log(`  Packages Found   : ${graph.packages.length} ${graph.partial ? '(partial: true)' : ''}\n`);
    for (const pkg of graph.packages) {
      console.log(`  • ${pkg.id} [${pkg.ecosystem}]`);
      console.log(`    Root           : ${pkg.root}`);
      console.log(`    Manifests      : ${pkg.manifests.join(', ')}`);
      console.log(`    Languages      : ${pkg.languages.join(', ') || 'unspecified'}`);
      console.log(`    Dependencies   : ${pkg.dependencies.length}`);
      if (pkg.configs.length > 0) {
        console.log(`    Configs        : ${pkg.configs.join(', ')}`);
      }
      if (pkg.internalDependencies.length > 0) {
        console.log(`    Internal Links : ${pkg.internalDependencies.join(', ')}`);
      }
      console.log('');
    }
    console.log('──────────────────────────────────────────\n');
  } else {
    const detection = profiles.detectStack(process.cwd());
    console.log('\nContextOS — Workspace & Tech Stack Detection\n');
    console.log(`  Repository Root   : ${graph.repositoryRoot}`);
    console.log(`  Packages Detected : ${graph.packages.map(p => `${p.id} (${p.root})`).join(', ')}`);
    if (detection.detected.length === 0) {
      console.log('  Detected Stack    : Generic / Vanilla JavaScript');
    } else {
      console.log(`  Detected Stack    : ${detection.detected.join(', ')}`);
    }
    console.log(`  Recommended Profile: ${detection.recommendedProfile}`);
    console.log(`  Recommended Skills : ${detection.recommendedSkills.join(', ')}`);
    console.log(`\nCommands:`);
    console.log(`  node .agents/ctx.js detect --scope <path>    Scope detection to a specific file/subproject`);
    console.log(`  node .agents/ctx.js detect --explain         Display full workspace evidence graph`);
    console.log(`  node .agents/ctx.js profile apply ${detection.recommendedProfile}\n`);
  }

// ── compile ───────────────────────────────────────────────────────────────────
} else if (command === 'compile') {
  const { ManifestCompiler } = require('./compiler/manifest-compiler.js');
  const checkOnly = args.includes('--check');
  const asSarif = args.includes('--sarif');
  const asJson = args.includes('--json');

  const compiler = new ManifestCompiler();
  const res = checkOnly ? compiler.compile() : compiler.compileAndWrite();

  if (asSarif) {
    console.log(JSON.stringify(compiler.formatSarif(), null, 2));
    process.exit(res.success ? 0 : 1);
  }

  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.success ? 0 : 1);
  }

  if (!res.success) {
    console.error('\n✗ Manifest compilation failed:\n');
    for (const d of res.diagnostics) {
      console.error(`  [${d.code}] ${d.file}${d.path ? ' ' + d.path : ''}: ${d.message}`);
      if (d.remediation) console.error(`    ↳ Remediation: ${d.remediation}`);
    }
    console.error('');
    process.exit(1);
  }

  const skillCount = Object.keys(res.registry.skills).length;
  console.log(`\n✓ Successfully compiled ${skillCount} skills into Registry v2!`);
  console.log(`  Source Graph Hash: ${res.registry.sourceGraphHash}`);
  if (!checkOnly) {
    console.log(`  Registry: .agents/compiled/registry.v2.json`);
    console.log(`  Checksum: .agents/compiled/registry.v2.sha256\n`);
  }

// ── validate / audit ──────────────────────────────────────────────────────────
} else if (command === 'validate' || command === 'audit') {
  const validator = require('./validate.js');
  validator.run();

// ── install-skill ─────────────────────────────────────────────────────────────
} else if (command === 'install-skill') {
  const ref = args[1];
  const dryRun = args.includes('--dry-run');
  const checksum = extractChecksum(args);
  const plugins = require('./plugins.js');
  
  if (!ref) {
    console.error('[ERROR] Usage: ctx.js install-skill <ref> [--checksum <sha256>]');
    process.exit(1);
  }
  
  plugins.add(ref, { dryRun, checksum }).catch(err => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });

// ── skill ─────────────────────────────────────────────────────────────────────
} else if (command === 'skill') {
  const subcommand = args[1];
  const ref        = args[2];
  const dryRun     = args.includes('--dry-run');
  const checksum   = extractChecksum(args);
  const plugins    = require('./plugins.js');

  if (!subcommand || subcommand === 'help') {
    printHelp();
    process.exit(0);
  }

  if (subcommand === 'add') {
    const forceUnsafe = args.includes('--force-unsafe-prompts') || args.includes('--force-unsafe');
    plugins.add(ref, { dryRun, checksum, forceUnsafe }).catch(err => {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    });
  } else if (subcommand === 'remove') {
    plugins.remove(ref);
  } else if (subcommand === 'list') {
    plugins.list();
  } else if (subcommand === 'search') {
    const query = args.slice(2).join(' ');
    plugins.search(query).catch(err => {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    });
  } else {
    console.error(`Unknown skill subcommand: ${subcommand}`);
    console.error('Valid subcommands: add, remove, list, search');
    process.exit(1);
  }

// ── clean-worktrees ──────────────────────────────────────────────────────────
} else if (command === 'clean-worktrees' || command === 'clean') {
  const { execSync, execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const rootDir = path.resolve(__dirname, '..');
  const wtDir = path.join(rootDir, '.swarm-worktrees');
  
  console.log('Cleaning up ContextOS swarm worktrees and branches...');
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: rootDir, stdio: 'pipe' });
  } catch {}

  let branchCount = 0;
  try {
    const branches = execFileSync('git', ['branch', '--list', 'swarm/*'], { cwd: rootDir, encoding: 'utf-8' });
    const list = branches.split('\n').map(b => b.replace(/^[*+\s]+/, '').trim()).filter(Boolean);
    for (const b of list) {
      try {
        execFileSync('git', ['branch', '-D', b], { cwd: rootDir, stdio: 'pipe' });
        branchCount++;
      } catch {}
    }
  } catch {}

  let dirCount = 0;
  if (fs.existsSync(wtDir)) {
    try {
      const entries = fs.readdirSync(wtDir);
      for (const e of entries) {
        const full = path.join(wtDir, e);
        try {
          fs.rmSync(full, { recursive: true, force: true });
          dirCount++;
        } catch {}
      }
    } catch {}
  }

  console.log(`✓ Cleaned up ${dirCount} worktree directory(ies) and ${branchCount} swarm branch(es).`);

// ── doctor ────────────────────────────────────────────────────────────────────
} else if (command === 'doctor') {
  const doctorModule = require('./doctor.js');
  const res = doctorModule.runDoctor(process.cwd(), { json: args.includes('--json') });
  if (res && res.ok === false) {
    process.exit(1);
  }

// ── status ────────────────────────────────────────────────────────────────────
} else if (command === 'status') {
  const commands = require(path.join(__dirname, '..', 'bin', 'commands.js'));
  const status = commands.getStatus(process.cwd());
  if (args.includes('--json')) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(commands.formatStatusText(status));
  }

// ── stats ─────────────────────────────────────────────────────────────────────
} else if (command === 'stats') {
  const statsModule = require('./stats.js');
  statsModule.runStats(process.cwd());

// ── watch ─────────────────────────────────────────────────────────────────────
} else if (command === 'watch') {
  const watchModule = require('./watch.js');
  watchModule.runWatch(process.cwd());

// ── init ──────────────────────────────────────────────────────────────────────
} else if (command === 'init') {
  console.log('\nContextOS — Project Initialization Guide\n');
  console.log('To set up ContextOS in your project:');
  console.log('  npx contextos                    Install .agents/ with auto-detected profile');
  console.log('  npx contextos --minimal          Install with minimal core skills');
  console.log('  npx contextos --profile <name>   Install with specific profile (mvp, startup, enterprise, etc.)');
  console.log('  npx contextos --with-mcp         Install with MCP execution server enabled');
  console.log('\nAfter setup, verify your installation:');
  console.log('  node .agents/ctx.js doctor');
  console.log('  node .agents/ctx.js stats\n');

// ── unknown ───────────────────────────────────────────────────────────────────
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run: node ctx.js (no args) to see help');
  process.exit(1);
}
