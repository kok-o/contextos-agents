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
  console.log('  profile list [--json]           List available project profiles');
  console.log('  profile show <name> [--json]    Show profile configuration');
  console.log('  profile explain <name> [--json] Detailed explanation of profile skills, policies & defaults');
  console.log('  profile apply <name>            Apply a profile (supports --scope <pkg> --no-export --json)');
  console.log('  profile remove [--scope <pkg>]  Remove active profile or scoped package override');
  console.log('  resolve <prompt>                Resolve minimal skills needed for a task');
  console.log('  explain [id] [--rules]          Inspect rule catalog, enforcement levels, and automated checkers');
  console.log('  index                           Generate progressive skills-index.json');
  console.log('  detect                          Auto-detect project tech stack');
  console.log('  compile [--check] [--sarif]     Compile skill manifests into deterministic registry v2');
  console.log('  audit                           Alias for validate (check skills)');
  console.log('  validate                        Validate skill sources, frontmatter, deps & sync');
  console.log('  clean-worktrees                 Clean up lingering .swarm-worktrees and swarm/* branches');
  console.log('  recover [--status|rollback|cont] Inspect, rollback, or resume interrupted transactions');
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
  const pureCompiler = require('./adapters/pure-compiler.js');
  const driftDetector = require('./adapters/drift-detector.js');

  const profileFlagIdx = args.indexOf('--profile');
  let overrideProfile = null;
  if (profileFlagIdx !== -1 && args[profileFlagIdx + 1]) {
    const profiles = require('./profiles.js');
    overrideProfile = args[profileFlagIdx + 1];
    try {
      profiles.applyProfile(overrideProfile);
      console.log(`[PROFILE] Applied profile '${overrideProfile}' for this export.\n`);
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
  }

  const isCheck = args.includes('--check');
  const isDiff = args.includes('--diff');
  const isDryRun = args.includes('--dry-run');
  const asJson = args.includes('--json');

  const rawTarget = args[1] && !args[1].startsWith('--') ? args[1] : 'all';

  // 1. Drift Check Mode (--check)
  if (isCheck) {
    const drift = driftDetector.detectDrift(process.cwd(), rawTarget, { profile: overrideProfile });
    if (asJson) {
      console.log(JSON.stringify(drift, null, 2));
    } else {
      console.log('\nContextOS — Adapter Output Drift Check\n');
      if (!drift.hasDrift) {
        console.log(`✓ No adapter drift detected. All ${drift.projectedCount} output artifacts are synchronized.`);
      } else {
        console.log(`! Drift detected (${drift.totalFindings} finding(s)):\n`);
        for (const [state, items] of Object.entries(drift.findings)) {
          if (items.length > 0) {
            console.log(`  [${state}] (${items.length}):`);
            for (const item of items) {
              console.log(`    • ${item.path || item.reason || JSON.stringify(item)}`);
            }
          }
        }
        if (drift.collisions.length > 0) {
          console.log(`\n  [PATH_COLLISIONS] (${drift.collisions.length}):`);
          for (const c of drift.collisions) {
            console.log(`    • ${c.path} (between ${c.firstAdapter} and ${c.secondAdapter})`);
          }
        }
        console.log('\nRun: node .agents/ctx.js export all    to synchronize outputs with source skills.\n');
      }
    }
    process.exit(drift.hasDrift ? 1 : 0);
  }

  // 2. Diff Preview Mode (--diff)
  if (isDiff) {
    const drift = driftDetector.detectDrift(process.cwd(), rawTarget, { profile: overrideProfile });
    if (asJson) {
      console.log(JSON.stringify(drift.diffs, null, 2));
    } else {
      console.log('\nContextOS — Adapter Output Projected Diffs\n');
      if (drift.diffs.length === 0) {
        console.log('✓ Disk is in sync with projected render. No diffs found.');
      } else {
        for (const d of drift.diffs) {
          console.log(`--- ${d.path} (${d.type}) ---`);
          console.log(d.diff);
          console.log('');
        }
      }
    }
    process.exit(0);
  }

  // 3. Dry-Run Mode (--dry-run)
  if (isDryRun) {
    const rendered = pureCompiler.renderAdapters(process.cwd(), rawTarget, { profile: overrideProfile });
    if (asJson) {
      console.log(JSON.stringify(rendered, null, 2));
    } else {
      console.log('\nContextOS — Adapter Export Dry Run\n');
      console.log(`Target: ${rawTarget}`);
      console.log(`Planned artifacts: ${rendered.artifacts.length}\n`);
      for (const art of rendered.artifacts) {
        console.log(`  + ${art.path.padEnd(50)} [${art.generator}] (${art.content.length} bytes)`);
      }
      if (rendered.collisions.length > 0) {
        console.log(`\n! Collisions detected: ${rendered.collisions.length}`);
        for (const c of rendered.collisions) {
          console.log(`  • ${c.path} (${c.firstAdapter} vs ${c.secondAdapter})`);
        }
      }
      console.log('\nDry run complete. No files were written to disk.');
    }
    process.exit(0);
  }

  // 4. Live Export Execution
  if (rawTarget === 'all') {
    console.log('Starting pure compiler export for all adapters...');
    const rendered = pureCompiler.renderAdapters(process.cwd(), 'all', { profile: overrideProfile });

    if (rendered.collisions.length > 0) {
      console.error(`[ERROR] Path collisions detected across adapters:`);
      for (const c of rendered.collisions) {
        console.error(`  • ${c.path} (${c.firstAdapter} vs ${c.secondAdapter})`);
      }
      process.exit(1);
    }

    const result = pureCompiler.applyArtifacts(process.cwd(), rendered.artifacts, {
      command: 'export all',
      context: rendered.context,
    });

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✓ All exports complete: ${result.appliedCount} artifacts applied in a single transaction (tx: ${result.txId}).`);
      console.log(`  Active adapters: Gemini, Claude, Cursor, Copilot, Aider, Zed`);
    }
  } else {
    const adapter = pureCompiler.getAdapter(rawTarget);
    if (!adapter) {
      console.error(`Adapter for '${rawTarget}' not implemented yet.`);
      console.error(`Supported agents: ${pureCompiler.listAdapters().join(', ')}, all`);
      process.exit(1);
    }

    const result = adapter.run({ profile: overrideProfile });
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    }
  }

// ── profile ───────────────────────────────────────────────────────────────────
} else if (command === 'profile') {
  const subcommand = args[1] || 'list';
  const profileName = args[2] && !args[2].startsWith('-') ? args[2] : null;
  const profiles = require('./profiles.js');
  const asJson = args.includes('--json');

  const scopeIdx = args.indexOf('--scope');
  const scopeArg = scopeIdx !== -1 && args[scopeIdx + 1] && !args[scopeIdx + 1].startsWith('--')
    ? args[scopeIdx + 1]
    : (args.find(a => a.startsWith('--scope=')) || '').split('=')[1] || null;

  if (subcommand === 'list') {
    const list = profiles.listProfiles();
    const active = profiles.getActiveProfile();
    if (asJson) {
      console.log(JSON.stringify({ active, profiles: list }, null, 2));
    } else {
      console.log('\nAvailable ContextOS Profiles:\n');
      for (const p of list) {
        const isActive = active && active.profile === p.id;
        const marker = isActive ? '● [ACTIVE]' : '○';
        console.log(`  ${marker} ${p.id.padEnd(12)} - ${p.name}: ${p.description}`);
        if (p.exclude_skills && p.exclude_skills.length > 0) {
          console.log(`      Excludes: ${p.exclude_skills.join(', ')}`);
        }
      }
      console.log('\nApply a profile: node .agents/ctx.js profile apply <name> [--scope <pkg>]');
      if (active) {
        console.log(`Current active profile: ${active.profile} (${active.name || active.profile})`);
        if (active.overrides && Object.keys(active.overrides).length > 0) {
          console.log('Package Overrides:');
          for (const [s, oProf] of Object.entries(active.overrides)) {
            console.log(`  • ${s} → ${oProf}`);
          }
        }
      }
      console.log('');
    }
  } else if (subcommand === 'show') {
    const name = profileName || (profiles.getActiveProfile() || {}).profile;
    if (!name) {
      console.error('[ERROR] Usage: node ctx.js profile show <name> [--json]');
      process.exit(1);
    }
    const profile = profiles.getProfile(name);
    if (!profile) {
      console.error(`[ERROR] Profile '${name}' not found.`);
      process.exit(1);
    }
    if (asJson) {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log(`\nProfile: ${profile.name} (${profile.id})`);
      console.log(`Description: ${profile.description}`);
      console.log(`Required Skills: ${(profile.skills?.required || profile.require_skills || []).join(', ') || 'none'}`);
      console.log(`Preferred Skills: ${(profile.skills?.preferred || profile.prefer_skills || []).join(', ') || 'none'}`);
      console.log(`Excluded Skills: ${(profile.skills?.excluded || profile.exclude_skills || []).join(', ') || 'none'}\n`);
    }
  } else if (subcommand === 'explain') {
    const name = profileName || (profiles.getActiveProfile() || {}).profile;
    if (!name) {
      console.error('[ERROR] Usage: node ctx.js profile explain <name> [--json]');
      process.exit(1);
    }
    try {
      const explanation = profiles.explainProfile(name);
      if (asJson) {
        console.log(JSON.stringify(explanation, null, 2));
      } else {
        console.log('\n' + profiles.formatProfileExplanation(explanation) + '\n');
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
  } else if (subcommand === 'apply') {
    if (!profileName) {
      console.error('[ERROR] Usage: node ctx.js profile apply <name> [--scope <pkg>] [--no-export] [--json]');
      process.exit(1);
    }
    try {
      const applied = profiles.applyProfile(profileName, process.cwd(), {
        scope: scopeArg,
        noExport: args.includes('--no-export'),
      });
      if (asJson) {
        console.log(JSON.stringify(applied, null, 2));
      } else {
        if (scopeArg) {
          console.log(`\n✓ Scoped profile override '${profileName}' applied to scope: ${scopeArg}!`);
        } else {
          console.log(`\n✓ Profile '${applied.name || profileName}' successfully applied as root profile!`);
          console.log(`  Excluded skills: ${(applied.exclude_skills || []).join(', ') || 'none'}`);
        }
        if (!args.includes('--no-export')) {
          console.log('  Run: node .agents/ctx.js export all  (to rebuild exports with this profile)\n');
        }
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }
  } else if (subcommand === 'remove' || subcommand === 'reset') {
    const removed = profiles.removeActiveProfile(process.cwd(), { scope: scopeArg });
    if (asJson) {
      console.log(JSON.stringify({ removed, scope: scopeArg }, null, 2));
    } else {
      if (removed) {
        if (scopeArg) {
          console.log(`\n✓ Profile override for scope '${scopeArg}' removed.\n`);
        } else {
          console.log('\n✓ Active profile filter removed. All skills will be included.\n');
        }
      } else {
        console.log(`\nNo active profile${scopeArg ? ` override for '${scopeArg}'` : ''} was found.\n`);
      }
    }
  } else {
    console.error(`Unknown profile subcommand: ${subcommand}`);
    console.error('Valid subcommands: list, show, explain, apply, remove');
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

// ── explain ───────────────────────────────────────────────────────────────────
} else if (command === 'explain') {
  const { RuleCatalog } = require('./rules/rule-catalog.js');
  const catalog = new RuleCatalog({ rootDir: process.cwd() });
  const fs = require('fs');

  // Load compiled registry rules if available
  const registryPath = path.join(process.cwd(), '.agents', 'compiled', 'registry.v2.json');
  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      catalog.loadFromRegistry(reg);
    } catch {
      // ignore
    }
  }

  const asJson = args.includes('--json');
  const showRules = args.includes('--rules');
  const showCheckers = args.includes('--checkers');
  const targetId = args.slice(1).find(a => !a.startsWith('-'));

  if (asJson) {
    if (showCheckers) {
      console.log(JSON.stringify(catalog.getAllCheckers(), null, 2));
    } else if (targetId) {
      const rule = catalog.getRule(targetId);
      if (rule) {
        console.log(JSON.stringify(rule, null, 2));
      } else {
        const skillRules = catalog.getAllRules().filter(r => r.sourceSkill === targetId);
        console.log(JSON.stringify({ skill: targetId, rules: skillRules }, null, 2));
      }
    } else {
      console.log(JSON.stringify({
        rules: catalog.getAllRules(),
        checkers: catalog.getAllCheckers(),
      }, null, 2));
    }
  } else if (showCheckers) {
    console.log(catalog.formatCheckersSummary());
  } else if (showRules) {
    console.log(catalog.formatRulesSummary());
  } else if (targetId) {
    const rule = catalog.getRule(targetId);
    if (rule) {
      console.log(catalog.explainRule(targetId));
    } else {
      console.log(catalog.explainSkill(targetId));
    }
  } else {
    // Default: print both rules summary and checkers
    console.log(catalog.formatRulesSummary());
    console.log(catalog.formatCheckersSummary());
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

// ── recover ───────────────────────────────────────────────────────────────────
} else if (command === 'recover') {
  const { JournaledTransaction, TX_STATES } = require('./filesystem/index.js');
  const isStatus = args.includes('--status') || (!args.includes('--rollback') && !args.includes('--continue'));
  const isRollback = args.includes('--rollback');
  const isContinue = args.includes('--continue');

  const pending = JournaledTransaction.listPending(process.cwd());

  if (isStatus) {
    console.log('\nContextOS — Transaction Recovery Status\n');
    if (pending.length === 0) {
      console.log('✓ No pending or interrupted transactions found. Project state is clean.');
    } else {
      console.log(`! Found ${pending.length} pending/interrupted transaction(s):\n`);
      for (const tx of pending) {
        console.log(`  • ID: ${tx.txId}`);
        console.log(`    State: ${tx.state}`);
        console.log(`    Created: ${tx.createdAt || 'unknown'}`);
        console.log(`    Operations: ${tx.operations ? tx.operations.length : 'unknown'}`);
        console.log('');
      }
      console.log('Run: node .agents/ctx.js recover --rollback [txId]');
      console.log('     node .agents/ctx.js recover --continue [txId]\n');
    }
  } else if (isRollback || isContinue) {
    const txIdArg = args.find(a => !a.startsWith('--') && a !== 'recover');
    const targetTx = txIdArg ? pending.find(p => p.txId === txIdArg) : pending[0];

    if (!targetTx) {
      console.error(txIdArg ? `Transaction '${txIdArg}' not found in pending list.` : 'No pending transactions found to recover.');
      process.exit(1);
    }

    const tx = new JournaledTransaction(process.cwd(), targetTx.txId);
    if (fs.existsSync(tx.journalPath)) {
      const jData = JSON.parse(fs.readFileSync(tx.journalPath, 'utf8'));
      tx.state = jData.state;
      tx.operations = jData.operations || [];
      tx.appliedOperations = tx.operations.filter(o => o.backupFilePath);
    }

    if (isRollback) {
      console.log(`Rolling back transaction '${targetTx.txId}'...`);
      try {
        tx.rollback();
        console.log(`✓ Transaction '${targetTx.txId}' rolled back cleanly.`);
      } catch (err) {
        console.error(`Rollback failed: ${err.message}`);
        process.exit(1);
      }
    } else if (isContinue) {
      console.log(`Continuing transaction '${targetTx.txId}'...`);
      try {
        tx.state = TX_STATES.PREPARED;
        tx.commit();
        console.log(`✓ Transaction '${targetTx.txId}' committed cleanly.`);
      } catch (err) {
        console.error(`Continue failed: ${err.message}`);
        process.exit(1);
      }
    }
  }

// ── thread ──────────────────────────────────────────────────────────────────
} else if (command === 'thread') {
  const { ThreadStore } = require('./runtime/thread-store.js');
  const { evaluateMergeReadiness } = require('./runtime/state-machine.js');
  const store = new ThreadStore({ baseDir: process.cwd() });
  const subcmd = args[1] || 'list';
  const isJson = args.includes('--json');

  if (subcmd === 'list') {
    const list = store.list();
    if (isJson) {
      console.log(JSON.stringify(list, null, 2));
    } else {
      console.log('\n══════════════════════════════════════════');
      console.log('  ContextOS — Runtime Execution Threads');
      console.log('══════════════════════════════════════════\n');
      if (list.length === 0) {
        console.log('  No runtime threads recorded yet.');
      } else {
        for (const th of list) {
          const ready = th.merge?.status === 'READY' ? ' [READY TO MERGE]' : '';
          console.log(`  • ID: ${th.id} (rev: ${th.revision})`);
          console.log(`    Status      : Exec: ${th.execution.status} | Verify: ${th.verification.status} | Review: ${th.review.status} | Merge: ${th.merge.status}${ready}`);
          console.log(`    Task        : ${(th.config?.task || '').slice(0, 70)}`);
          console.log(`    Created     : ${new Date(th.createdAt).toISOString()}`);
          console.log('');
        }
      }
      console.log('──────────────────────────────────────────\n');
    }
  } else if (subcmd === 'get') {
    const threadId = args[2];
    if (!threadId) {
      console.error('Usage: node ctx.js thread get <threadId> [--json]');
      process.exit(1);
    }
    const th = store.get(threadId);
    if (!th) {
      console.error(`Thread "${threadId}" not found.`);
      process.exit(1);
    }
    console.log(JSON.stringify(th, null, 2));
  } else if (subcmd === 'readiness') {
    const threadId = args[2];
    if (!threadId) {
      console.error('Usage: node ctx.js thread readiness <threadId> [--json]');
      process.exit(1);
    }
    const th = store.get(threadId);
    if (!th) {
      console.error(`Thread "${threadId}" not found.`);
      process.exit(1);
    }
    const readiness = evaluateMergeReadiness(th);
    if (isJson) {
      console.log(JSON.stringify(readiness, null, 2));
    } else {
      console.log('\n══════════════════════════════════════════');
      console.log(`  ContextOS — Merge Readiness (${th.id})`);
      console.log('══════════════════════════════════════════\n');
      console.log(`  Overall Verdict: ${readiness.isReady ? 'READY TO MERGE ✓' : 'NOT READY ✗'}\n`);
      for (const c of readiness.checks) {
        const mark = c.passed ? '✓' : '✗';
        console.log(`  ${mark} [${c.name.padEnd(24)}] ${c.message}`);
      }
      console.log('\n──────────────────────────────────────────\n');
    }
  } else {
    console.error(`Unknown thread subcommand: ${subcmd}. Available: list, get, readiness`);
    process.exit(1);
  }

// ── unknown ───────────────────────────────────────────────────────────────────
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run: node ctx.js (no args) to see help');
  process.exit(1);
}
