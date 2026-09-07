/**
 * .agents/plugins.js
 * ContextOS — Skill Plugin Manager
 *
 * Installs third-party skills from:
 *   • npm packages  (contextos-skill-*)
 *   • GitHub repos  (owner/repo or owner/repo/path/to/skill)
 *
 * Usage (via ctx.js):
 *   node .agents/ctx.js skill add   username/my-skill
 *   node .agents/ctx.js skill add   my-npm-package
 *   node .agents/ctx.js skill remove my-skill
 *   node .agents/ctx.js skill list
 *   node .agents/ctx.js skill search <query>
 *
 * Or via npx:
 *   npx contextos-agents --add-skill username/my-skill
 */

'use strict';

const fs      = require('fs');
const os      = require('os');
const path    = require('path');
const https   = require('https');
const crypto  = require('crypto');
const { execFileSync } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT           = process.cwd();
const AGENTS_DIR     = path.join(ROOT, '.agents');
const CORE_SKILLS    = path.join(AGENTS_DIR, 'core', 'skills');
const PLUGINS_DIR    = path.join(AGENTS_DIR, 'plugins');          // installed third-party skills
const PLUGINS_JSON   = path.join(AGENTS_DIR, 'plugins.json');     // local lock file
const REGISTRY_URL   = 'https://raw.githubusercontent.com/kok-o/contextos-agents/main/registry.json';
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// ── Prompt Injection Scanner ──────────────────────────────────────────────────
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous/i,
  /you\s+are\s+now/i,
  /system\s*:\s*/i,
  /\[SYSTEM\]/i,
  /base64\s*,\s*[A-Za-z0-9+/=]{40,}/i,
  /https?:\/\/[^\s)]+\/(?:exfil|steal|leak|webhook|collect)/i,
  /\b(?:eval|exec|Function)\s*\(/i,
];

function scanForPromptInjection(content, options = {}) {
  if (typeof content !== 'string') return false;
  const found = PROMPT_INJECTION_PATTERNS.filter(p => p.test(content));
  if (found.length > 0) {
    console.warn(c.red('  🚨 Potential prompt injection or unsafe pattern detected in skill:'));
    console.warn(c.yellow(`     Pattern matches: ${found.map(p => p.source).join(', ')}`));
    if (options.throwOnMatch) {
      throw new Error(`Security validation failed: prompt injection detected (${found.length} pattern matches). Installation aborted. Pass --force-unsafe-prompts to override.`);
    }
    return true;
  }
  return false;
}

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const c = {
  green:  (s) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red:    (s) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
};

// ── plugins.json lock file ─────────────────────────────────────────────────────
function readLock() {
  if (!fs.existsSync(PLUGINS_JSON)) return { plugins: [] };
  try {
    return JSON.parse(fs.readFileSync(PLUGINS_JSON, 'utf8'));
  } catch {
    return { plugins: [] };
  }
}

function writeLock(lock) {
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  fs.writeFileSync(PLUGINS_JSON, JSON.stringify(lock, null, 2) + '\n');
}

// ── HTTP fetch helper (no deps) ───────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'contextos-agents' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = new URL(res.headers.location, url);
        if (redirect.protocol !== 'https:' || redirect.hostname !== 'raw.githubusercontent.com') {
          return reject(new Error('Refusing redirect outside raw.githubusercontent.com'));
        }
        return fetchText(redirect.toString()).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_DOWNLOAD_BYTES) {
          request.destroy(new Error(`Download exceeds ${MAX_DOWNLOAD_BYTES} bytes`));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    request.setTimeout(15_000, () => request.destroy(new Error('Download timed out')));
    request.on('error', reject);
  });
}

// ── Source resolver ──────────────────────────────────────────────────────────
/**
 * Parse a skill reference into a structured descriptor.
 *
 * Supported formats:
 *   username/repo                    → GitHub: fetch /SKILL.md from repo root
 *   username/repo/path/to/skill      → GitHub: fetch /path/to/skill/SKILL.md
 *   my-npm-package                   → npm: install package, copy skill dir
 */
function isValidNpmPackage(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (name.startsWith('-') || name.includes('/-')) return false;
  return /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(name);
}

function parseRef(ref) {
  if (typeof ref !== 'string' || !ref.trim()) {
    throw new Error('A plugin reference is required');
  }

  // Scoped packages contain a slash but are npm packages, not GitHub refs.
  if (ref.startsWith('@')) {
    if (!isValidNpmPackage(ref)) {
      throw new Error(`Invalid scoped npm package name: '${ref}'`);
    }
    return { type: 'npm', package: ref, raw: ref };
  }

  // GitHub: contains a slash
  if (ref.includes('/')) {
    const parts    = ref.split('/');
    const owner    = parts[0];
    const repoRef  = parts[1];
    const subPath  = parts.slice(2).join('/'); // may be empty
    const [repo, gitRef = 'main'] = repoRef.split('@');
    const safeSegment = /^[A-Za-z0-9._-]+$/;

    const isSafePathPart = part => part !== '.' && part !== '..' && safeSegment.test(part);
    if (!owner || !repo || !isSafePathPart(owner) || !isSafePathPart(repo) ||
        !isSafePathPart(gitRef) || parts.slice(2).some(part => !isSafePathPart(part))) {
      throw new Error('Invalid GitHub plugin reference');
    }

    return { type: 'github', owner, repo, gitRef, isPinned: repoRef.includes('@'), subPath, raw: ref };
  }
  // npm package
  if (!isValidNpmPackage(ref)) {
    throw new Error(`Invalid npm package name: '${ref}'`);
  }
  return { type: 'npm', package: ref, raw: ref };
}

// ── GitHub installer ──────────────────────────────────────────────────────────
async function installFromGitHub(descriptor, skillName, dryRun, checksum, forceUnsafe = false) {
  const { owner, repo, gitRef, isPinned, subPath } = descriptor;
  const skillPath  = subPath || '';
  const base       = `https://raw.githubusercontent.com/${owner}/${repo}/${gitRef}`;
  const skillMdUrl = skillPath
    ? `${base}/${skillPath}/SKILL.md`
    : `${base}/SKILL.md`;

  console.log(c.dim(`  Fetching: ${skillMdUrl}`));
  if (!isPinned) {
    console.log(c.yellow('  [WARN] Unpinned GitHub ref: prefer owner/repo@<commit> for reproducible installs.'));
  }

  let skillMdContent;
  try {
    skillMdContent = await fetchText(skillMdUrl);
  } catch (err) {
    if (gitRef !== 'main') throw err;
    // Try /master branch fallback only for the legacy default branch behavior.
    const masterUrl = skillMdUrl.replace('/main/', '/master/');
    console.log(c.dim(`  Retrying on master branch: ${masterUrl}`));
    skillMdContent = await fetchText(masterUrl);
  }

  if (!skillMdContent || skillMdContent.length < 50) {
    throw new Error('Fetched SKILL.md appears empty or invalid');
  }

  const sha256 = crypto.createHash('sha256').update(skillMdContent).digest('hex');
  if (checksum && sha256.toLowerCase() !== checksum.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${skillName}: expected ${checksum}, got ${sha256}`);
  }
  scanForPromptInjection(skillMdContent, { throwOnMatch: !forceUnsafe });

  // Optionally fetch skill.yaml if it exists
  const yamlUrl = skillPath
    ? `${base}/${skillPath}/skill.yaml`
    : `${base}/skill.yaml`;

  let yamlContent = null;
  try {
    yamlContent = await fetchText(yamlUrl);
  } catch {
    // Optional — not all skills have skill.yaml
  }

  const targetDir = path.join(PLUGINS_DIR, skillName);

  if (dryRun) {
    console.log(c.yellow(`  [DRY-RUN] Would install to: ${targetDir}`));
    console.log(c.yellow(`  [DRY-RUN] SKILL.md size: ${skillMdContent.length} bytes (sha256: ${sha256})`));
    return sha256;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent);
  if (yamlContent) {
    fs.writeFileSync(path.join(targetDir, 'skill.yaml'), yamlContent);
  }

  // Write a source marker so we know where to update from
  fs.writeFileSync(path.join(targetDir, '.source'), JSON.stringify({
    type:    'github',
    owner,
    repo,
    gitRef,
    subPath: skillPath,
    ref:     descriptor.raw,
    sha256,
    installedAt: new Date().toISOString(),
  }, null, 2));

  console.log(c.green(`  ✓ Installed SKILL.md (${skillMdContent.length} bytes, sha256: ${sha256.slice(0, 12)}...)`));
  if (yamlContent) console.log(c.green(`  ✓ Installed skill.yaml`));
  return sha256;
}

// ── npm installer ─────────────────────────────────────────────────────────────
function installFromNpm(descriptor, skillName, dryRun, checksum, forceUnsafe = false) {
  const pkgName = descriptor.package;

  if (dryRun) {
    console.log(c.yellow(`  [DRY-RUN] Would run: npm install ${pkgName}`));
    console.log(c.yellow(`  [DRY-RUN] Would copy skill to: ${path.join(PLUGINS_DIR, skillName)}`));
    return null;
  }

  console.log(c.dim(`  Installing npm package: ${pkgName}`));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const temporaryPrefix = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-plugin-'));

  let sha256 = null;
  try {
    // `--prefix` keeps both node_modules and npm metadata outside the user's
    // project. Lifecycle scripts remain disabled for untrusted packages.
    execFileSync(npm, [
      'install', '--prefix', temporaryPrefix, '--no-save', '--ignore-scripts',
      '--package-lock=false', '--no-audit', '--no-fund', pkgName,
    ], { cwd: temporaryPrefix, stdio: 'pipe' });

    const nmPath    = path.join(temporaryPrefix, 'node_modules', pkgName);
    const skillSrc  = fs.existsSync(path.join(nmPath, 'SKILL.md'))
      ? nmPath
      : path.join(nmPath, 'skill'); // try skill/ subfolder

    if (!fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
      throw new Error(`Package '${pkgName}' does not contain a SKILL.md at its root or skill/ subdirectory`);
    }

    const skillMdContent = fs.readFileSync(path.join(skillSrc, 'SKILL.md'), 'utf8');
    sha256 = crypto.createHash('sha256').update(skillMdContent).digest('hex');
    if (checksum && sha256.toLowerCase() !== checksum.toLowerCase()) {
      throw new Error(`Checksum mismatch for ${skillName}: expected ${checksum}, got ${sha256}`);
    }
    scanForPromptInjection(skillMdContent, { throwOnMatch: !forceUnsafe });

    const targetDir = path.join(PLUGINS_DIR, skillName);
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(skillSrc, targetDir, { recursive: true, force: true });

    // Write source marker
    fs.writeFileSync(path.join(targetDir, '.source'), JSON.stringify({
      type:        'npm',
      package:     pkgName,
      ref:         descriptor.raw,
      sha256,
      installedAt: new Date().toISOString(),
    }, null, 2));
  } finally {
    fs.rmSync(temporaryPrefix, { recursive: true, force: true });
  }

  console.log(c.green(`  ✓ Installed from npm: ${pkgName} (sha256: ${sha256 ? sha256.slice(0, 12) + '...' : 'unknown'})`));
  return sha256;
}

// ── Derive skill name from ref ────────────────────────────────────────────────
function deriveSkillName(ref) {
  // username/repo/path/to/my-skill → my-skill
  // username/my-skill              → my-skill
  // my-npm-package                 → my-npm-package
  const parts = ref.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function isSafeSkillName(skillName) {
  return typeof skillName === 'string' && SAFE_SKILL_NAME.test(skillName);
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * skill add <ref> [--dry-run] [--checksum <sha256>] [--force-unsafe-prompts]
 */
async function add(ref, options = {}) {
  const dryRun   = Boolean(options.dryRun || options['dry-run']);
  const checksum = options.checksum || null;
  const forceUnsafe = Boolean(options.forceUnsafe || options['force-unsafe-prompts']);

  if (!ref) {
    console.error(c.red('Usage: ctx.js skill add <ref> [--checksum <sha256>]'));
    console.error('  ref can be: username/repo, username/repo/path/to/skill, or npm-package-name');
    process.exit(1);
  }

  const descriptor = parseRef(ref);
  const skillName  = deriveSkillName(ref);

  if (!isSafeSkillName(skillName)) {
    throw new Error(`Invalid plugin name derived from reference: '${skillName}'`);
  }

  console.log('');
  console.log(c.bold(`Installing skill: ${c.cyan(skillName)}`));
  console.log(c.dim(`  Source: ${ref} (${descriptor.type})`));

  // Check for conflict with builtin skills
  const builtinPath = path.join(CORE_SKILLS, skillName);
  if (fs.existsSync(builtinPath)) {
    console.error(c.red(`\n[ERROR] '${skillName}' conflicts with a built-in skill.`));
    console.error(c.red('  Built-in skills cannot be overridden via --add-skill.'));
    console.error(c.dim('  To customize a built-in skill, fork the repo and submit a PR.'));
    process.exit(1);
  }

  // Check if already installed
  const lock     = readLock();
  const existing = lock.plugins.find(p => p.name === skillName);
  if (existing && !dryRun) {
    console.log(c.yellow(`\n[WARN] '${skillName}' is already installed (from: ${existing.ref})`));
    console.log(c.yellow('  Re-installing will overwrite it. Continuing...'));
  }

  let installedSha256 = null;
  try {
    if (descriptor.type === 'github') {
      installedSha256 = await installFromGitHub(descriptor, skillName, dryRun, checksum, forceUnsafe);
    } else {
      installedSha256 = installFromNpm(descriptor, skillName, dryRun, checksum, forceUnsafe);
    }
  } catch (err) {
    console.error(c.red(`\n[ERROR] Failed to install '${skillName}': ${err.message}`));
    process.exit(1);
  }

  if (!dryRun) {
    // Update lock file
    const idx = lock.plugins.findIndex(p => p.name === skillName);
    const entry = {
      name:        skillName,
      ref,
      type:        descriptor.type,
      sha256:      installedSha256,
      installedAt: new Date().toISOString(),
    };
    if (idx >= 0) lock.plugins[idx] = entry;
    else lock.plugins.push(entry);
    writeLock(lock);

    console.log('');
    console.log(c.green(c.bold('✓ Skill installed successfully!')));
    console.log(c.dim(`  Location: .agents/plugins/${skillName}/`));
    console.log('');
    console.log('  Next steps:');
    console.log(`    node .agents/ctx.js export all    # recompile with new skill`);
    console.log(`    node .agents/ctx.js validate      # verify everything is consistent`);
    console.log('');
  }
}

/**
 * skill remove <name>
 */
function remove(skillName) {
  if (!skillName) {
    console.error(c.red('Usage: ctx.js skill remove <name>'));
    process.exit(1);
  }

  if (!isSafeSkillName(skillName)) {
    console.error(c.red(`[ERROR] Invalid plugin name: '${skillName}'`));
    process.exit(1);
  }

  const lock    = readLock();
  const entry   = lock.plugins.find(p => p.name === skillName);
  const skillDir = path.join(PLUGINS_DIR, skillName);

  if (!entry && !fs.existsSync(skillDir)) {
    console.error(c.red(`[ERROR] Plugin '${skillName}' is not installed.`));
    console.log(c.dim('  Run: node .agents/ctx.js skill list'));
    process.exit(1);
  }

  // Protect builtins
  const builtinPath = path.join(CORE_SKILLS, skillName);
  if (fs.existsSync(builtinPath)) {
    console.error(c.red(`[ERROR] '${skillName}' is a built-in skill and cannot be removed.`));
    process.exit(1);
  }

  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  lock.plugins = lock.plugins.filter(p => p.name !== skillName);
  writeLock(lock);

  console.log(c.green(`✓ Removed plugin: ${skillName}`));
  console.log(c.dim('  Run: node .agents/ctx.js export all  (to recompile)'));
}

/**
 * skill list
 */
function list() {
  const lock = readLock();

  // Builtin skills
  const builtins = fs.existsSync(CORE_SKILLS)
    ? fs.readdirSync(CORE_SKILLS).filter(n => fs.statSync(path.join(CORE_SKILLS, n)).isDirectory())
    : [];

  // Plugin skills
  const plugins = lock.plugins;

  console.log('');
  console.log(c.bold('ContextOS Skills'));
  console.log('');

  // Built-ins
  console.log(c.bold(`  Built-in (${builtins.length})`));
  for (const name of builtins) {
    console.log(`    ${c.cyan('●')} ${name}  ${c.dim('(core)')}`);
  }

  // Plugins
  console.log('');
  if (plugins.length === 0) {
    console.log(c.bold('  Plugins (0)'));
    console.log(c.dim('    No plugins installed yet.'));
    console.log(c.dim('    Install one: node .agents/ctx.js skill add username/my-skill'));
  } else {
    console.log(c.bold(`  Plugins (${plugins.length})`));
    for (const p of plugins) {
      const when = p.installedAt ? new Date(p.installedAt).toLocaleDateString() : '?';
      console.log(`    ${c.green('●')} ${p.name}  ${c.dim(`← ${p.ref}  (installed ${when})`)}`);
    }
  }

  console.log('');
}

/**
 * skill search <query>  — searches the hosted registry.json
 */
async function search(query) {
  console.log(c.dim(`\nFetching registry from: ${REGISTRY_URL}\n`));

  let registry;
  try {
    const raw = await fetchText(REGISTRY_URL);
    registry  = JSON.parse(raw);
  } catch (err) {
    console.error(c.red(`[ERROR] Could not fetch registry: ${err.message}`));
    console.error(c.dim('  Check your internet connection or try again later.'));
    process.exit(1);
  }

  const q       = (query || '').toLowerCase();
  const results = registry.skills.filter(s =>
    !q ||
    s.name.includes(q) ||
    s.description.toLowerCase().includes(q) ||
    (s.tags || []).some(t => t.includes(q)) ||
    s.author.includes(q)
  );

  if (results.length === 0) {
    console.log(c.yellow(`No skills found matching "${query}".`));
    console.log(c.dim(`  Browse all: ${registry.contributing}`));
    return;
  }

  console.log(c.bold(`Found ${results.length} skill(s)${q ? ` matching "${query}"` : ''}:\n`));

  for (const s of results) {
    const installRef = s.builtin
      ? c.dim('(built-in)')
      : c.cyan(s.github ? `${s.github}${s.path ? '/' + s.path : ''}` : s.npm);

    const builtinBadge = s.builtin ? c.dim(' [built-in]') : '';
    console.log(`  ${c.bold(s.name)}${builtinBadge}`);
    console.log(`    ${s.description}`);
    console.log(`    ${c.dim('author:')} ${s.author}  ${c.dim('tags:')} ${(s.tags || []).join(', ')}`);
    console.log(`    ${c.dim('install:')} node .agents/ctx.js skill add ${installRef}`);
    console.log('');
  }

  console.log(c.dim(`To publish your skill: ${registry.contributing}`));
}

// ═════════════════════════════════════════════════════════════════════════════
//  Plugin-aware skill collection (used by adapters)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns an array of all skill source directories:
 * both core (builtin) and plugins.
 * Adapters call this instead of reading CORE_SKILLS directly.
 */
function collectAllSkillDirs() {
  const dirs = [];

  // Core skills
  if (fs.existsSync(CORE_SKILLS)) {
    for (const name of fs.readdirSync(CORE_SKILLS)) {
      const d = path.join(CORE_SKILLS, name);
      if (fs.statSync(d).isDirectory()) dirs.push(d);
    }
  }

  // Plugin skills
  if (fs.existsSync(PLUGINS_DIR)) {
    for (const name of fs.readdirSync(PLUGINS_DIR)) {
      const d = path.join(PLUGINS_DIR, name);
      if (fs.statSync(d).isDirectory()) dirs.push(d);
    }
  }

  return dirs;
}

module.exports = {
  add,
  remove,
  list,
  search,
  collectAllSkillDirs,
  readLock,
  parseRef,
  deriveSkillName,
  isSafeSkillName,
  scanForPromptInjection,
  PROMPT_INJECTION_PATTERNS,
  PLUGINS_DIR,
};
