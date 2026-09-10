/**
 * .agents/adapters/claude/export.js
 * ContextOS Claude Code Pure Adapter
 */

const fs = require('fs');
const path = require('path');
const { collectSkillDirectories, readMeaningfulMarkdown } = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');

const GENERATOR_ID = 'claude@2';

function describe() {
  return {
    name: 'claude',
    version: '2.0.0',
    description: 'Compiles clean markdown skills for Claude Code CLI',
    targetPattern: '.agents/generated/claude/skills/**/SKILL.md',
  };
}

function renderClaudeSkill(skillDir, context) {
  const skillName = path.basename(skillDir);
  const existingSkillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(existingSkillMdPath)) {
    return null;
  }

  let content = fs.readFileSync(existingSkillMdPath, 'utf8');

  const examples = readMeaningfulMarkdown(path.join(skillDir, 'EXAMPLES.md'));
  if (examples) {
    content += '\n\n' + examples;
  }

  const troubleshooting = readMeaningfulMarkdown(path.join(skillDir, 'TROUBLESHOOTING.md'));
  if (troubleshooting) {
    content += '\n\n' + troubleshooting;
  }

  // Strip YAML frontmatter
  content = content.replace(/^---[\s\S]*?---\r?\n/, '');

  return {
    path: `.agents/generated/claude/skills/${skillName}/SKILL.md`,
    content: content.trimStart().replace(/\r\n/g, '\n'),
    mediaType: 'text/markdown',
    kind: 'generated-adapter',
    generator: GENERATOR_ID,
    sourceSkillIds: [skillName],
    inputsHash: context?.sourceGraphHash || 'none',
  };
}

function render(context) {
  const skills = collectSkillDirectories(context?.profile);
  const artifacts = [];

  for (const skill of skills) {
    const art = renderClaudeSkill(skill, context);
    if (art) artifacts.push(art);
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
