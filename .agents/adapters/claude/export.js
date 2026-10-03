/**
 * .agents/adapters/claude/export.js
 * ContextOS Claude Code Pure Adapter
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, collectSkillDirectories } = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');

const GENERATOR_ID = 'claude@2';
const CLAUDE_START_MARKER = '<!-- CONTEXTOS:START -->';
const CLAUDE_END_MARKER = '<!-- CONTEXTOS:END -->';

function describe() {
  return {
    name: 'claude',
    version: '2.0.0',
    description: 'Compiles clean markdown skills for Claude Code CLI and manages CLAUDE.md entrypoint',
    targetPattern: '{CLAUDE.md,.agents/generated/claude/skills/**/SKILL.md}',
  };
}

function renderClaudeSkill(skillDir, context) {
  const skillName = path.basename(skillDir);
  const existingSkillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(existingSkillMdPath)) {
    return null;
  }

  let content = fs.readFileSync(existingSkillMdPath, 'utf8');

  // Strip YAML frontmatter
  content = content.replace(/^---[\s\S]*?---\r?\n/, '');

  return {
    path: `.agents/generated/claude/skills/${skillName}/SKILL.md`,
    content: (content.trim() + '\n').replace(/\r\n/g, '\n'),
    mediaType: 'text/markdown',
    kind: 'generated-adapter',
    generator: GENERATOR_ID,
    sourceSkillIds: [skillName],
    inputsHash: context?.sourceGraphHash || 'none',
  };
}

function renderClaudeRootIndex(skills, context) {
  const projectRoot = context?.projectRoot || '.';
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  let existingContent = '';
  if (fs.existsSync(claudePath)) {
    try {
      existingContent = fs.readFileSync(claudePath, 'utf8');
    } catch {}
  }

  const skillEntries = skills.map(skillDir => {
    const name = path.basename(skillDir);
    return `- [${name}](.agents/generated/claude/skills/${name}/SKILL.md)`;
  }).join('\n');

  const managedBlock = `${CLAUDE_START_MARKER}
<!-- Do not edit this section directly. Synchronized by ContextOS. -->
# ContextOS Agent Governance

The following skills are managed by ContextOS:
${skillEntries}
${CLAUDE_END_MARKER}`;

  let finalContent;
  if (existingContent.includes(CLAUDE_START_MARKER) || existingContent.includes(CLAUDE_END_MARKER)) {
    if (existingContent.split(CLAUDE_START_MARKER).length !== 2 || existingContent.split(CLAUDE_END_MARKER).length !== 2 || existingContent.indexOf(CLAUDE_END_MARKER) < existingContent.indexOf(CLAUDE_START_MARKER)) {
      throw new Error('Malformed ContextOS block in CLAUDE.md; refusing to overwrite.');
    }
  }
  if (existingContent.includes(CLAUDE_START_MARKER)) {
    const regex = new RegExp(`${CLAUDE_START_MARKER}[\\s\\S]*?${CLAUDE_END_MARKER}`);
    finalContent = existingContent.replace(regex, managedBlock);
  } else if (existingContent.trim()) {
    finalContent = `${existingContent.trimEnd()}\n\n${managedBlock}\n`;
  } else {
    finalContent = `${managedBlock}\n`;
  }

  return {
    path: 'CLAUDE.md',
    preservesUserContent: true,
    expectedBeforeHash: fs.existsSync(claudePath) ? require('../../filesystem/index.js').computeExactHash(Buffer.from(existingContent)) : 'NONE',
    content: finalContent.replace(/\r\n/g, '\n'),
    mediaType: 'text/markdown',
    kind: 'generated-adapter',
    generator: GENERATOR_ID,
    sourceSkillIds: skills.map(s => path.basename(s)),
    inputsHash: context?.sourceGraphHash || 'none',
  };
}

function render(context) {
  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  const artifacts = [];

  for (const skill of skills) {
    const art = renderClaudeSkill(skill, context);
    if (art) artifacts.push(art);
    if (art) artifacts.push(...require('../shared.js').renderSkillResources(skill, [path.posix.dirname(art.path)], {
      kind: art.kind, generator: art.generator, sourceSkillIds: art.sourceSkillIds, inputsHash: art.inputsHash,
    }));
  }

  if (skills.length > 0) {
    const rootIndex = renderClaudeRootIndex(skills, context);
    if (rootIndex) artifacts.push(rootIndex);
  }

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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export claude', context });
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
