/**
 * bin/commands/init.js
 * ContextOS CLI — project initialization.
 *
 * A new project receives its rule-source folder and a .gitignore block, nothing
 * else: the compiler, adapters and resolver run from the installed package and
 * are never copied into the project. The bundled core rules (seven general
 * engineering skills, AGENTS.md and the named profiles) are opt-in with
 * --with-core; --profile and --auto bring only the profile definitions.
 *
 * Re-running with --force refreshes the bundled files. It never deletes
 * anything, so project rules, plugins and vendor skills are always kept.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  resolveManagedPath,
  ProjectMutationLock,
  JournaledTransaction,
} = require('../../.agents/filesystem/index.js');
const profiles = require('../../.agents/profiles.js');
const lockfileLib = require('../lib/lockfile.js');
const gitignore = require('../lib/gitignore.js');
const ui = require('../lib/ui.js');
const { detectProjectAttributes } = require('../lib/detector.js');
const pkg = require('../../package.json');

const PACKAGE_AGENTS_DIR = path.join(__dirname, '..', '..', '.agents');
const PACKAGE_CATALOG_DIR = path.join(__dirname, '..', '..', 'catalog', 'skills');

const CORE_SKILLS = [
  'engineering-workflow',
  'ponytail-mindset',
  'gstack-roles',
  'gemini-precision',
  'context-os',
  'context-manager',
  'security',
];

const PRESETS = {
  frontend: [
    'react', 'vercel-react-best-practices', 'nextjs', 'typescript',
    'state-management',
    'frontend-design', 'web-design-guidelines', 'animate',
    'animation-performance', 'review-animations', 'pick-ui-library', 'webapp-testing',
  ],
  backend: [
    'node', 'fastapi', 'nestjs', 'system-design',
    'api-design', 'microservices', 'ddd', 'database',
  ],
  devops: ['docker', 'ci-cd', 'terraform', 'security-audit'],
  full: null,
  all: null,
};

function walkFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/** The bundled files this run would place into the project: [{ rel, source }]. */
function bundledPayload({ withCore, withProfiles }) {
  const payload = [];
  const add = source => {
    const rel = `.agents/${path.relative(PACKAGE_AGENTS_DIR, source).split(path.sep).join('/')}`;
    payload.push({ rel, source });
  };
  if (withCore) {
    for (const skill of CORE_SKILLS) {
      walkFiles(path.join(PACKAGE_AGENTS_DIR, 'core', 'skills', skill)).forEach(add);
    }
    const agentsMd = path.join(PACKAGE_AGENTS_DIR, 'AGENTS.md');
    if (fs.existsSync(agentsMd)) add(agentsMd);
  }
  if (withCore || withProfiles) {
    walkFiles(path.join(PACKAGE_AGENTS_DIR, 'core', 'profiles')).forEach(add);
  }
  return payload;
}

function fail(flags, message, hint) {
  if (flags.json) {
    console.error(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(`[ERROR] ${message}`);
    if (hint) console.error(`        ${hint}`);
  }
  process.exit(1);
}

function runPackageCtx(projectDir, args, { quiet = false, env } = {}) {
  execFileSync(process.execPath, [path.join(PACKAGE_AGENTS_DIR, 'ctx.js'), ...args], {
    cwd: projectDir,
    stdio: quiet ? 'ignore' : 'inherit',
    env: env || process.env,
  });
}

function runInit(flags) {
  const projectDir = flags.project || process.cwd();
  const agentsDir = path.join(projectDir, '.agents');
  const withCore = Boolean(flags.minimal || flags.withCore || flags.all);
  const stack = detectProjectAttributes(projectDir);
  const selectedProfile = flags.profile || (flags.auto || flags.agent === 'auto' ? stack.stack.recommendedProfile : null);
  const targetAgents = (flags.agent === 'auto' || flags.auto)
    ? stack.ide.recommendedAgents
    : (flags.agent ? [flags.agent] : []);
  const payload = bundledPayload({ withCore, withProfiles: Boolean(selectedProfile) });

  if (flags.dryRun) {
    const summary = {
      dryRun: true,
      targetPath: agentsDir,
      layout: withCore ? 'project rules + bundled core' : 'project rules only',
      targetProfile: selectedProfile || 'none',
      detectedStack: stack.stack.detected,
      detectedIde: stack.ide.detected,
      targetAgents,
      filesCount: payload.length,
      minimal: Boolean(flags.minimal),
    };
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('[DRY-RUN] No files will be written.\n');
      console.log(fs.existsSync(agentsDir)
        ? '[WARN] .agents/ already exists; re-run with --force only to refresh the bundled files.'
        : `[OK] Would create .agents/project/skills/ in: ${projectDir}`);
      console.log(`[INFO] Detected stack: ${stack.stack.detected.length ? stack.stack.detected.join(', ') : 'Generic JavaScript'}`);
      console.log(`[INFO] Bundled core rules: ${withCore ? `${CORE_SKILLS.length} skills + AGENTS.md` : 'not installed (use --with-core)'}`);
      console.log(`[INFO] Selected profile: ${summary.targetProfile}`);
      console.log(`[INFO] ${payload.length} bundled file(s) would be copied; a .gitignore block would be added.`);
      console.log('\nRun without --dry-run to apply changes.');
    }
    return;
  }

  if (!fs.existsSync(path.join(PACKAGE_AGENTS_DIR, 'ctx.js'))) {
    fail(flags, 'Package files not found; reinstall contextos-agents.');
  }
  if (path.resolve(PACKAGE_AGENTS_DIR) === path.resolve(agentsDir)) {
    fail(flags, 'Refusing to initialize the package into itself. Run this command from the target project.');
  }
  if (fs.existsSync(agentsDir) && !flags.force) {
    fail(flags, '.agents/ already exists; nothing was changed.',
      'Use --force to refresh the bundled core files. Your rules under .agents/project/ are never touched.');
  }

  if (!flags.json) {
    ui.renderBanner(pkg.version);
    ui.renderStep(1, 2, 'Analyzing project environment',
      stack.stack.detected.length > 0 ? `Detected stack: ${stack.stack.detected.join(', ')}` : 'Detected stack: generic');
    console.log('');
  }

  let lock;
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
    resolveManagedPath(projectDir, '.agents/project/skills');
    fs.mkdirSync(path.join(agentsDir, 'project', 'skills'), { recursive: true });
    lock = new ProjectMutationLock(projectDir);
    const token = lock.acquire({ command: 'init' });
    try {
      const tx = new JournaledTransaction(projectDir);
      let staged = 0;
      for (const file of payload) {
        const target = path.join(projectDir, ...file.rel.split('/'));
        if (fs.existsSync(target) && !flags.force) continue;
        tx.stageWrite(file.rel, fs.readFileSync(file.source));
        staged++;
      }
      const currentIgnore = gitignore.readGitignore(projectDir);
      const nextIgnore = gitignore.withBlock(currentIgnore);
      if (nextIgnore !== currentIgnore) tx.stageWrite('.gitignore', nextIgnore);
      if (tx.operations.length > 0) tx.commit();
      if (!flags.json) {
        ui.renderStep(2, 2, 'Preparing rule sources', [
          'Your rules live in .agents/project/skills/<name>/SKILL.md',
          withCore
            ? `Installed ${CORE_SKILLS.length} bundled core skills and AGENTS.md (${staged} files)`
            : 'No bundled rules installed (add --with-core for the seven general engineering skills)',
          'Added a .gitignore block for derived caches',
        ]);
        console.log('');
      }
    } finally {
      lock.release(token);
    }

    if (payload.length > 0) {
      lockfileLib.migrateExistingInstallation(projectDir, PACKAGE_AGENTS_DIR, {
        selectedProfile: selectedProfile || 'none',
        installedPackage: 'contextos-agents',
        version: pkg.version,
      });
    }
  } catch (error) {
    fail(flags, `Initialization failed: ${error.message}`);
  }

  if (selectedProfile) {
    try {
      const applied = profiles.applyProfile(selectedProfile, projectDir);
      if (!flags.json) console.log(`  [OK] Applied profile '${applied.name}' (excluded: ${(applied.exclude_skills || []).join(', ') || 'none'})\n`);
    } catch (e) {
      fail(flags, `Could not apply profile '${selectedProfile}': ${e.message}`);
    }
  }

  const env = { ...process.env, CONTEXTOS_CATALOG_DIR: PACKAGE_CATALOG_DIR };

  if (flags.addSkill) {
    if (!flags.json) console.log(`Installing plugin skill: ${flags.addSkill}`);
    try {
      runPackageCtx(projectDir, ['skill', 'add', flags.addSkill], { quiet: flags.json, env });
    } catch {
      fail(flags, `Skill install failed for ${flags.addSkill}`, `Run manually: contextos skill add ${flags.addSkill}`);
    }
  }

  if (flags.all || flags.preset) {
    const presetKey = flags.all ? 'full' : flags.preset;
    if (presetKey === 'full' || presetKey === 'all') {
      if (!flags.json) console.log(`\nInstalling all ${fs.readdirSync(PACKAGE_CATALOG_DIR).length} catalog skills (--all)...`);
      try {
        runPackageCtx(projectDir, ['skill', 'add', '--all'], { quiet: flags.json, env });
      } catch (e) {
        if (!flags.json) console.error('  [WARN] Failed to install catalog skills:', e.message);
      }
    } else if (PRESETS[presetKey]) {
      if (!flags.json) console.log(`  Installing preset '${presetKey}' skills:`);
      let count = 0;
      for (const skillName of PRESETS[presetKey]) {
        count++;
        if (!flags.json) ui.renderProgressBar(count, PRESETS[presetKey].length, skillName);
        try {
          runPackageCtx(projectDir, ['skill', 'add', skillName], { quiet: true, env });
        } catch (e) {
          if (!flags.json) console.error(`\n  [WARN] Failed to install preset skill '${skillName}':`, e.message);
        }
      }
      if (!flags.json) console.log('\n');
    } else if (!flags.json) {
      console.error(`  [WARN] Unknown preset '${flags.preset}'. Supported presets: frontend, backend, devops, full`);
    }
  }

  let exported = [];
  if (!flags.skipCompile && targetAgents.length > 0) {
    const hasRules = walkFiles(path.join(agentsDir, 'project', 'skills')).length > 0
      || walkFiles(path.join(agentsDir, 'core', 'skills')).length > 0
      || walkFiles(path.join(agentsDir, 'plugins')).length > 0;
    if (hasRules) {
      for (const agent of targetAgents) {
        try {
          runPackageCtx(projectDir, ['export', agent], { quiet: true });
          exported.push(agent);
        } catch {
          fail(flags, `Export for '${agent}' failed`, `Run manually: contextos export ${agent}`);
        }
      }
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({
      success: true,
      package: 'contextos-agents',
      version: pkg.version,
      projectDir,
      layout: withCore ? 'project rules + bundled core' : 'project rules only',
      profile: selectedProfile || 'default',
      agents: exported,
      minimal: Boolean(flags.minimal),
      all: Boolean(flags.all),
      preset: flags.preset,
    }, null, 2));
    return;
  }

  ui.renderSuccessCard();
}

module.exports = { runInit, CORE_SKILLS, PRESETS, bundledPayload };
