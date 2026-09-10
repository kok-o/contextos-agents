/**
 * .agents/adapters/gemini/export.js
 * ContextOS Gemini & Antigravity IDE Pure Adapter
 */

const fs = require('fs');
const path = require('path');
const { collectSkillDirectories, readMeaningfulMarkdown, extractYamlField } = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');

const GENERATOR_ID = 'gemini@2';

function describe() {
  return {
    name: 'gemini',
    version: '2.0.0',
    description: 'Compiles modular skills for Gemini 3.8 and Google Antigravity IDE',
    targetPattern: '.agents/generated/gemini/skills/**/SKILL.md',
  };
}

function renderGeminiSkill(skillDir, context) {
  const skillName = path.basename(skillDir);
  const yamlPath = path.join(skillDir, 'skill.yaml');
  const existingSkillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(existingSkillMdPath) && !fs.existsSync(yamlPath)) {
    return [];
  }

  let name = skillName;
  let description = null;

  if (fs.existsSync(yamlPath)) {
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    name = extractYamlField(yamlText, 'name') || skillName;
    description = extractYamlField(yamlText, 'description');
    if (!description) {
      const descRegex = new RegExp(`^description:\\s*>\\s*\\n\\s*([^\\n]+)`, 'm');
      const descMatch = yamlText.match(descRegex);
      if (descMatch) description = descMatch[1].trim();
    }
  }
  description = description || `ContextOS skill for ${name}`;

  const files = fs.readdirSync(skillDir).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const mdFiles = files.filter(f => f.endsWith('.md'));

  const primaryMd = mdFiles.includes('SKILL.md')
    ? 'SKILL.md'
    : (mdFiles.find(f => f === `${skillName}.md`) || mdFiles[0]);

  let mergedContent = '';
  if (primaryMd) {
    let primaryText = fs.readFileSync(path.join(skillDir, primaryMd), 'utf8');
    primaryText = primaryText.replace(/^---[\s\S]*?---\r?\n/, '');
    mergedContent += primaryText;
  }

  const otherTopicFiles = mdFiles.filter(f => f !== primaryMd && f !== 'EXAMPLES.md' && f !== 'TROUBLESHOOTING.md');
  const orderedExtras = [...otherTopicFiles];
  if (mdFiles.includes('EXAMPLES.md') && primaryMd !== 'EXAMPLES.md') orderedExtras.push('EXAMPLES.md');
  if (mdFiles.includes('TROUBLESHOOTING.md') && primaryMd !== 'TROUBLESHOOTING.md') orderedExtras.push('TROUBLESHOOTING.md');

  for (const mdFile of orderedExtras) {
    if (mergedContent.includes(`<!-- Source: ${mdFile} -->`)) continue;
    const extraContent = readMeaningfulMarkdown(path.join(skillDir, mdFile));
    if (extraContent) {
      mergedContent += `\n\n<!-- Source: ${mdFile} -->\n\n` + extraContent;
    }
  }

  const outputContent = `---
name: ${name}
description: >
  ${description}
---
${mergedContent.trimStart()}
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

  return artifacts;
}

function render(context) {
  const skills = collectSkillDirectories(context?.profile);
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
