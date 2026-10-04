/**
 * .agents/adapters/gemini/export.js
 * ContextOS Gemini & Antigravity IDE Pure Adapter
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, readSkillMetadata, stripFrontmatter, collectSkillDirectories, renderSkillResources } = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');

const GENERATOR_ID = 'gemini@2';

function describe() {
  return {
    name: 'gemini',
    version: '2.0.0',
    description: 'Compiles shared native skills and supporting resources for documented client discovery paths',
    targetPattern: '.agents/generated/gemini/skills/**/SKILL.md',
  };
}

function renderGeminiSkill(skillDir, context) {
  const skillName = path.basename(skillDir);
  const existingSkillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(existingSkillMdPath)) {
    return [];
  }

  const name = skillName;
  const { description } = readSkillMetadata(skillDir);
  const mergedContent = stripFrontmatter(fs.readFileSync(existingSkillMdPath, 'utf8'));

  const outputContent = `---
name: ${name}
description: ${JSON.stringify(description)}
---
${mergedContent.trim()}
`.replace(/\r\n/g, '\n');

  const artifacts = [
    {
      path: `.agents/generated/gemini/skills/${skillName}/SKILL.md`,
      content: outputContent,
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [skillName],
      inputsHash: context?.sourceGraphHash || 'none',
    },
    {
      path: `.agents/skills/${skillName}/SKILL.md`,
      content: outputContent,
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [skillName],
      inputsHash: context?.sourceGraphHash || 'none',
    },
  ];

  artifacts.push(...renderSkillResources(skillDir, [
    `.agents/generated/gemini/skills/${skillName}`, `.agents/skills/${skillName}`,
  ], { kind: 'generated-adapter', generator: GENERATOR_ID, sourceSkillIds: [skillName], inputsHash: context?.sourceGraphHash || 'none' }));
  return artifacts;
}

function render(context) {
  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  const artifacts = [];

  for (const skill of skills) {
    const rendered = renderGeminiSkill(skill, context);
    artifacts.push(...rendered);
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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export gemini', context });
  console.log(`✓ Gemini export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('gemini', adapter);

module.exports = adapter;
