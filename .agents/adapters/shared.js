'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..');
const CORE_SKILLS_PATH = path.join(AGENTS_DIR, 'core', 'skills');
const AGENTS_MD_PATH = path.join(AGENTS_DIR, 'AGENTS.md');

/**
 * Return every skill available to an installed ContextOS instance.
 * Plugins intentionally live outside `core/skills`, so adapters must use this
 * helper rather than enumerate the core directory themselves.
 */
function collectSkillDirectories(overrideProfile = null, projectRoot = null) {
  let profile = overrideProfile;
  let root = projectRoot;

  if (overrideProfile && typeof overrideProfile === 'object') {
    if (overrideProfile.projectRoot && !root) {
      root = overrideProfile.projectRoot;
    }
  }

  const effectiveRoot = root ? path.resolve(root) : process.cwd();
  const plugins = require(path.join(AGENTS_DIR, 'plugins.js'));
  let dirs = plugins.collectAllSkillDirs(effectiveRoot)
    .filter(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory())
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  if (!profile) {
    try {
      const profilesEngine = require(path.join(AGENTS_DIR, 'profiles.js'));
      profile = profilesEngine.getActiveProfile(effectiveRoot);
    } catch {
      profile = null;
    }
  }

  if (profile && Array.isArray(profile.exclude_skills) && profile.exclude_skills.length > 0) {
    dirs = dirs.filter(dir => {
      const skillName = path.basename(dir);
      return !profile.exclude_skills.includes(skillName);
    });
  }

  return dirs;
}

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(directory, { recursive: true });
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trimStart();
}

function extractYamlField(yamlText, field) {
  const lines = yamlText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(new RegExp(`^${field}:\\s*(.*)$`));
    if (match) {
      let rest = match[1].trim();
      if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-' || rest === '') {
        const blockLines = [];
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          if (nextLine.trim() === '') {
            blockLines.push('');
            j++;
            continue;
          }
          if (/^(\s{2,}|\t)/.test(nextLine)) {
            blockLines.push(nextLine.trim());
            j++;
          } else {
            break;
          }
        }
        if (blockLines.length > 0) {
          const sep = rest.startsWith('|') ? '\n' : ' ';
          return blockLines.filter(Boolean).join(sep).trim();
        }
      }
      // Strip surrounding quotes if present
      if ((rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'"))) {
        rest = rest.slice(1, -1);
      }
      return rest || null;
    }
  }
  return null;
}

/**
 * Reads a markdown file only if it exists and contains meaningful content
 * (filters out generic placeholder stubs).
 */
function readMeaningfulMarkdown(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return null;
  if (
    content.length < 150 &&
    (
      content.includes('Add detailed code examples') ||
      content.includes('Add common errors, anti-patterns')
    )
  ) {
    return null;
  }
  return content;
}

/** Parse YAML and name the file in the error, so a typo in a rule is easy to find. */
function parseYamlFile(text, file) {
  try {
    return require('../compiler/vendor/yaml.js').parse(text);
  } catch (err) {
    const where = path.relative(process.cwd(), file).split(path.sep).join('/') || file;
    const reason = String(err.message).split(/\r?\n/)[0];
    throw new Error(`Invalid YAML in ${where}: ${reason}`);
  }
}

/** Read the same manifest precedence and entrypoint used by the compiler. */
function readSkillManifest(skillDir) {
  const manifestPath = ['skill.v2.yaml', 'skill.yaml'].map(name => path.join(skillDir, name)).find(file => fs.existsSync(file));
  return manifestPath ? parseYamlFile(fs.readFileSync(manifestPath, 'utf8'), manifestPath) : {};
}

function getSkillEntrypointPath(skillDir) {
  const manifest = readSkillManifest(skillDir);
  return require('../filesystem/index.js').resolveManagedPath(skillDir, manifest?.entrypoint || 'SKILL.md').resolvedPath;
}

/** Routing metadata follows the declared manifest, then the real entrypoint. */
function readSkillMetadata(skillDir, { fallbackDescription } = {}) {
  const manifest = readSkillManifest(skillDir);
  const entrypoint = getSkillEntrypointPath(skillDir);
  const raw = fs.existsSync(entrypoint) ? fs.readFileSync(entrypoint, 'utf8') : '';
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatter = match ? parseYamlFile(match[1], entrypoint) : {};
  const name = manifest?.displayName || manifest?.name || frontmatter?.name || path.basename(skillDir);
  const description = manifest?.description || frontmatter?.description || fallbackDescription || `ContextOS skill for ${name}`;
  return { name, description: typeof description === 'string' ? description.trim() : description };
}

/** Copy declared resources beside exported entrypoints without inlining them. */
function renderSkillResources(skillDir, destinations, metadata) {
  const manifest = readSkillManifest(skillDir);
  const resources = manifest?.resources || [];
  const { resolveManagedPath } = require('../filesystem/index.js');
  const artifacts = [];
  const seen = new Set();
  for (const resource of resources) {
    const rel = typeof resource === 'string' ? resource : resource.path;
    if (rel === 'SKILL.md' || rel === manifest?.entrypoint || seen.has(rel)) continue;
    seen.add(rel);
    const { resolvedPath, relativePosixPath } = resolveManagedPath(skillDir, rel);
    if (!fs.statSync(resolvedPath).isFile()) throw new Error(`Skill resource must be a file: ${rel}`);
    for (const destination of destinations) {
      const mediaType = /\.(md|txt|js|ts|py)$/i.test(rel) ? 'text/plain' : /\.ya?ml$/i.test(rel) ? 'application/yaml' : /\.json$/i.test(rel) ? 'text/plain' : 'application/octet-stream';
      artifacts.push({ ...metadata, path: `${destination}/${relativePosixPath}`, content: fs.readFileSync(resolvedPath), mediaType });
    }
  }
  return artifacts;
}

const ACTIVATION_MODES = ['always', 'auto', 'globs'];

// Path scopes known for the catalog skills. A skill can state its own
// `activation` and `globs`; these only apply when it states neither.
const CATALOG_GLOBS = {
  'react': '**/*.{tsx,jsx}',
  'react-best-practices': '**/*.{tsx,jsx}',
  'nextjs': 'app/**/*,pages/**/*,next.config.*',
  'typescript': '**/*.{ts,tsx}',
  'ui-design': '**/*.{tsx,jsx,css,scss}',
  'ui-ux-pro': '**/*.{tsx,jsx,css,scss}',
  'ux-design': '**/*.{tsx,jsx}',
  'impeccable-design': '**/*.{tsx,jsx,css,scss}',
  'brutalist-design': '**/*.{tsx,jsx,css,scss}',
  'minimalist-design': '**/*.{tsx,jsx,css,scss}',
  'soft-design': '**/*.{tsx,jsx,css,scss}',
  'redesign-audit': '**/*.{tsx,jsx,css,scss}',
  'web-accessibility': '**/*.{tsx,jsx,html}',
  'ddd': '**/domain/**/*,**/entities/**/*,**/aggregates/**/*',
  'microservices': '**/services/**/*,docker-compose.*,**/gateway/**/*',
  'nestjs': '**/*.module.ts,**/*.controller.ts,**/*.service.ts,nest-cli.json',
  'node': '**/*.{ts,js}',
  'database': '**/*.{prisma,sql,sqlite,db,drizzle.config.*}',
  'docker': '**/Dockerfile*,**/docker-compose*.{yml,yaml}',
  'testing': '**/*.{test,spec}.{ts,js,tsx,jsx},vitest.config.*,jest.config.*',
  'state-management': '**/*{store,state,slice,reducer,atom}*.{ts,js,tsx,jsx}',
  'performance': '**/*.{ts,tsx,js,jsx,json}',
  'vercel-optimize': '**/*.{ts,tsx,js,jsx,json}',
  'fastapi': '**/*.{py,requirements.txt,Pipfile,pyproject.toml}',
};

/** Split a comma-separated glob string, ignoring commas inside {a,b} groups. */
function splitGlobs(value) {
  const list = Array.isArray(value) ? value.map(String) : [String(value || '')];
  const result = [];
  for (const item of list) {
    let depth = 0;
    let current = '';
    for (const ch of item) {
      if (ch === '{') depth++;
      if (ch === '}') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
  }
  return result.map(g => g.replace(/['"]/g, '').trim()).filter(Boolean);
}

function readSkillFrontmatter(skillDir) {
  const entrypoint = getSkillEntrypointPath(skillDir);
  const raw = fs.existsSync(entrypoint) ? fs.readFileSync(entrypoint, 'utf8') : '';
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? (parseYamlFile(match[1], entrypoint) || {}) : {};
}

/**
 * How a skill reaches the agent.
 *   always - the rule is part of every session (always-loaded instruction files)
 *   globs  - the rule applies to matching files only
 *   auto   - the agent decides from the description (progressive disclosure)
 *
 * Stated in the skill's frontmatter or manifest as `activation:` and `globs:`.
 * Without either, catalog path scopes apply, then `auto`.
 */
function resolveActivation(skillDir) {
  const name = path.basename(skillDir);
  const manifest = readSkillManifest(skillDir) || {};
  const frontmatter = readSkillFrontmatter(skillDir);
  const stated = manifest.activation ?? frontmatter.activation;
  const statedGlobs = manifest.globs ?? frontmatter.globs ?? manifest.fileGlobs;

  if (stated !== undefined && !ACTIVATION_MODES.includes(stated)) {
    throw new Error(`Skill '${name}': activation must be one of ${ACTIVATION_MODES.join(', ')} (got '${stated}')`);
  }
  if (stated === 'always') return { mode: 'always', globs: [] };
  if (stated === 'auto') return { mode: 'auto', globs: [] };
  if (stated === 'globs') {
    const globs = splitGlobs(statedGlobs);
    if (globs.length === 0) throw new Error(`Skill '${name}': activation 'globs' needs a 'globs' list`);
    return { mode: 'globs', globs };
  }
  if (statedGlobs !== undefined) {
    const globs = splitGlobs(statedGlobs);
    if (globs.length > 0) return { mode: 'globs', globs };
  }

  const yamlPath = path.join(skillDir, 'skill.yaml');
  if (fs.existsSync(yamlPath)) {
    const match = fs.readFileSync(yamlPath, 'utf8').match(/(?:triggers\s*:\s*(?:files|globs))\s*:\s*\[?([^\r\n\]]+)\]?/i);
    const globs = match ? splitGlobs(match[1]) : [];
    if (globs.length > 0) return { mode: 'globs', globs };
  }
  if (CATALOG_GLOBS[name]) return { mode: 'globs', globs: splitGlobs(CATALOG_GLOBS[name]) };
  return { mode: 'auto', globs: [] };
}

/** Project-owned core rules (`.agents/AGENTS.md`); the package's own copy is never injected. */
function readCoreRules(projectRoot) {
  const file = path.join(projectRoot || '.', '.agents', 'AGENTS.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Bodies of the skills that must be part of every session. */
function collectAlwaysRules(skillDirs) {
  const rules = [];
  for (const skillDir of skillDirs) {
    const entrypoint = getSkillEntrypointPath(skillDir);
    if (!fs.existsSync(entrypoint)) continue;
    if (resolveActivation(skillDir).mode !== 'always') continue;
    const { name } = readSkillMetadata(skillDir);
    rules.push({ id: path.basename(skillDir), title: name, body: stripFrontmatter(fs.readFileSync(entrypoint, 'utf8')).trim() });
  }
  return rules;
}

module.exports = {
  AGENTS_DIR,
  AGENTS_MD_PATH,
  CORE_SKILLS_PATH,
  collectSkillDirectories,
  extractYamlField,
  readMeaningfulMarkdown,
  resetDirectory,
  stripFrontmatter,
  renderSkillResources,
  readSkillManifest,
  readSkillMetadata,
  getSkillEntrypointPath,
  ACTIVATION_MODES,
  splitGlobs,
  readSkillFrontmatter,
  resolveActivation,
  readCoreRules,
  collectAlwaysRules,
};
