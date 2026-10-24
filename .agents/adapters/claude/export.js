/**
 * .agents/adapters/claude/export.js
 * ContextOS Claude Code Pure Adapter
 *
 * Writes the locations Claude Code itself loads, instead of an index of links
 * that the model would have to decide to open:
 *   - activation `always` / `globs` -> .claude/rules/<name>.md
 *       (loaded at launch, or when a matching file is read; `paths` frontmatter)
 *   - activation `auto`             -> .claude/skills/<name>/SKILL.md
 *       (name + description are always visible; the body loads when relevant)
 *
 * CLAUDE.md is not touched. Earlier versions kept a managed block of plain
 * links in it; the next export removes that block and the old
 * .agents/generated/claude/ copies, leaving the user's own text alone.
 */

const fs = require('fs');
const path = require('path');
const {
  getSkillEntrypointPath,
  readSkillMetadata,
  collectSkillDirectories,
  stripFrontmatter,
  renderSkillResources,
  resolveActivation,
} = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');

const GENERATOR_ID = 'claude@2';

function describe() {
  return {
    name: 'claude',
    version: '3.0.0',
    description: 'Compiles rules and skills into the native .claude/rules and .claude/skills locations of Claude Code',
    targetPattern: '{.claude/rules/*.md,.claude/skills/**/SKILL.md}',
  };
}

function ruleFrontmatter(globs) {
  if (globs.length === 0) return '';
  return `---\npaths:\n${globs.map(g => `  - ${JSON.stringify(g)}`).join('\n')}\n---\n\n`;
}

function renderClaudeSkill(skillDir) {
  const skillName = path.basename(skillDir);
  const entrypoint = getSkillEntrypointPath(skillDir);
  if (!fs.existsSync(entrypoint)) return [];

  const { description } = readSkillMetadata(skillDir);
  const body = stripFrontmatter(fs.readFileSync(entrypoint, 'utf8')).trim();
  const activation = resolveActivation(skillDir);
  const base = { mediaType: 'text/markdown', kind: 'generated-adapter', generator: GENERATOR_ID, sourceSkillIds: [skillName] };

  if (activation.mode === 'auto') {
    const artifacts = [{
      ...base,
      path: `.claude/skills/${skillName}/SKILL.md`,
      content: `---\nname: ${skillName}\ndescription: ${JSON.stringify(description)}\n---\n${body}\n`,
    }];
    artifacts.push(...renderSkillResources(skillDir, [`.claude/skills/${skillName}`], base));
    return artifacts;
  }

  // Rule files are all loaded as rules, so declared resources are not copied beside them.
  return [{
    ...base,
    path: `.claude/rules/${skillName}.md`,
    content: `${ruleFrontmatter(activation.mode === 'globs' ? activation.globs : [])}${body}\n`,
  }];
}

function render(context) {
  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  const artifacts = [];
  for (const skill of skills) artifacts.push(...renderClaudeSkill(skill));
  return artifacts;
}

function validate(artifacts) {
  const diagnostics = [];
  for (const art of artifacts) {
    if (!art.content || art.content.length === 0) {
      diagnostics.push({ path: art.path, message: 'Empty artifact content' });
    }
  }
  return diagnostics;
}

function run(options = {}) {
  const { loadCompilerContext } = require('../pure-compiler.js');
  const projectRoot = options.projectRoot || '.';
  const context = loadCompilerContext(projectRoot, options);
  const artifacts = render(context);
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export claude', context, force: options.force });
  console.log(`✓ Claude export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('claude', adapter);

module.exports = adapter;
