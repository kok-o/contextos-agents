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

  for (const dir of dirs) {
    const entrypoint = getSkillEntrypointPath(dir);
    if (!fs.existsSync(entrypoint) || !fs.statSync(entrypoint).isFile()) {
      throw new Error(`Skill '${path.basename(dir)}': entrypoint must be an existing file: ${entrypoint}`);
    }
    resolveActivation(dir);
    readSkillResources(dir);
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
  if (manifestPath) require('../filesystem/index.js').resolveManagedPath(skillDir, path.basename(manifestPath));
  return manifestPath ? parseYamlFile(fs.readFileSync(manifestPath, 'utf8'), manifestPath) : {};
}

function getSkillEntrypointPath(skillDir) {
  const manifest = readSkillManifest(skillDir);
  return require('../filesystem/index.js').resolveManagedPath(skillDir, manifest?.entrypoint || 'SKILL.md').resolvedPath;
}

/** Keep Markdown resource links valid when an entrypoint moves in an export. */
function relocateSkillLinks(content, { skillDir, destination, projectRoot, resourceRoot = null, sourceFile = getSkillEntrypointPath(skillDir) }) {
  const entrypoint = getSkillEntrypointPath(skillDir);
  const sourceDir = path.dirname(sourceFile);
  const outputDir = path.dirname(path.resolve(projectRoot, destination));
  const relocate = target => {
    const link = target.replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(link)) return target;
    const [, file, suffix = ''] = link.match(/^([^?#]*)(.*)$/);
    if (!file) return target;
    let decoded;
    try { decoded = decodeURIComponent(file); } catch { return target; }
    let resolved = path.resolve(sourceDir, decoded);
    if (resourceRoot) resolved = path.resolve(projectRoot, resourceRoot, resolved === entrypoint ? 'SKILL.md' : path.relative(skillDir, resolved));
    const relative = path.relative(outputDir, resolved).split(path.sep).join('/');
    return relative.split('/').map(segment => encodeURIComponent(segment)
      .replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/') + suffix;
  };
  const relocateInlineLinks = text => {
    let output = '';
    let cursor = 0;
    let start;
    while ((start = text.indexOf('](', cursor)) !== -1) {
      const from = start + 2;
      let end = from;
      if (text[from] === '<') {
        const close = text.indexOf('>', from + 1);
        if (close === -1 || /[\r\n]/.test(text.slice(from, close))) break;
        end = close + 1;
      } else {
        let depth = 0;
        for (; end < text.length; end++) {
          const ch = text[end];
          if (ch === '\\' && end + 1 < text.length) { end++; continue; }
          if (ch === '(') depth++;
          else if (ch === ')') { if (!depth) break; depth--; }
          else if (/\s/.test(ch)) break;
        }
        if (depth) break;
      }
      const close = text.indexOf(')', end);
      if (close === -1 || /[\r\n]/.test(text.slice(end, close))) break;
      output += text.slice(cursor, from) + relocate(text.slice(from, end));
      cursor = end;
    }
    return output + text.slice(cursor);
  };
  // Fenced examples describe literal source; do not rewrite their links.
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map((part, index) => index % 2 ? part : relocateInlineLinks(part)
    .replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|[^\s]+)(.*)$/gm, (_, start, target, end) => start + relocate(target) + end)
  ).join('');
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
function readSkillResources(skillDir) {
  const manifest = readSkillManifest(skillDir);
  const resources = manifest?.resources ?? [];
  if (!Array.isArray(resources)) throw new Error(`Skill '${path.basename(skillDir)}': resources must be a list`);
  const { resolveManagedPath } = require('../filesystem/index.js');
  return resources.map(resource => {
    const rel = typeof resource === 'string' ? resource : resource?.path;
    const resolved = resolveManagedPath(skillDir, rel);
    if (!fs.existsSync(resolved.resolvedPath) || !fs.statSync(resolved.resolvedPath).isFile()) {
      throw new Error(`Skill resource must be an existing file: ${rel}`);
    }
    return resolved;
  });
}

function renderSkillResources(skillDir, destinations, metadata, projectRoot) {
  const entrypoint = getSkillEntrypointPath(skillDir);
  const artifacts = [];
  const seen = new Set();
  for (const { resolvedPath, relativePosixPath: rel } of readSkillResources(skillDir)) {
    if (resolvedPath === entrypoint || rel === 'SKILL.md' || seen.has(rel)) continue;
    seen.add(rel);
    for (const destination of destinations) {
      const mediaType = /\.(md|txt|js|ts|py)$/i.test(rel) ? 'text/plain' : /\.ya?ml$/i.test(rel) ? 'application/yaml' : /\.json$/i.test(rel) ? 'text/plain' : 'application/octet-stream';
      const outputPath = `${destination}/${rel}`;
      const raw = fs.readFileSync(resolvedPath);
      const content = /\.md$/i.test(rel) ? relocateSkillLinks(raw.toString('utf8'), { skillDir, destination: outputPath, projectRoot, resourceRoot: destination, sourceFile: resolvedPath }) : raw;
      artifacts.push({ ...metadata, path: outputPath, content, mediaType });
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
  const stated = manifest.activation !== undefined ? manifest.activation : frontmatter.activation;
  const statedGlobs = manifest.globs !== undefined ? manifest.globs : (manifest.fileGlobs !== undefined ? manifest.fileGlobs : frontmatter.globs);

  if (statedGlobs !== undefined && !(typeof statedGlobs === 'string' ||
      (Array.isArray(statedGlobs) && statedGlobs.every(glob => typeof glob === 'string' && glob.trim())))) {
    throw new Error(`Skill '${name}': globs must be a string or a list of non-empty strings`);
  }

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

  if (CATALOG_GLOBS[name]) return { mode: 'globs', globs: splitGlobs(CATALOG_GLOBS[name]) };
  return { mode: 'auto', globs: [] };
}

/** Project-owned core rules (`.agents/AGENTS.md`); the package's own copy is never injected. */
function readCoreRules(projectRoot) {
  const file = path.join(projectRoot || '.', '.agents', 'AGENTS.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Bodies of the skills that must be part of every session. */
function collectAlwaysRules(skillDirs, relocation) {
  const rules = [];
  for (const skillDir of skillDirs) {
    const entrypoint = getSkillEntrypointPath(skillDir);
    if (!fs.existsSync(entrypoint)) continue;
    if (resolveActivation(skillDir).mode !== 'always') continue;
    const { name } = readSkillMetadata(skillDir);
    const body = stripFrontmatter(fs.readFileSync(entrypoint, 'utf8')).trim();
    rules.push({ id: path.basename(skillDir), title: name, body: relocation ? relocateSkillLinks(body, { skillDir, ...relocation }) : body });
  }
  return rules;
}

module.exports = {
  relocateSkillLinks,
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
