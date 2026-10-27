/**
 * .agents/adapters/gemini/export.js
 * ContextOS Gemini & Antigravity IDE Pure Adapter
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSkillEntrypointPath, readSkillMetadata, stripFrontmatter, collectSkillDirectories, renderSkillResources, relocateSkillLinks, resolveActivation } = require('../shared.js');
const { registerAdapter, applyArtifacts } = require('../pure-compiler.js');
const { antigravityGlobs, boundedWindowsGlobs } = require('./globs.js');

const GENERATOR_ID = 'gemini@2';

function describe() {
  return {
    name: 'gemini',
    version: '2.2.0',
    description: 'Compiles shared native skills, resources and Antigravity activation rules',
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
      content: relocateSkillLinks(outputContent, { skillDir, destination: `.agents/generated/gemini/skills/${skillName}/SKILL.md`, projectRoot: context.projectRoot, resourceRoot: `.agents/generated/gemini/skills/${skillName}` }),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [skillName],
    },
    {
      path: `.agents/skills/${skillName}/SKILL.md`,
      content: relocateSkillLinks(outputContent, { skillDir, destination: `.agents/skills/${skillName}/SKILL.md`, projectRoot: context.projectRoot, resourceRoot: `.agents/skills/${skillName}` }),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [skillName],
    },
  ];

  // Antigravity skills expose descriptions on demand; activation belongs to
  // native rules. Keep the shared skill projection for Codex/Gemini clients.
  const activation = resolveActivation(skillDir);
  if (activation.mode !== 'auto') {
    const destination = `.agents/rules/contextos-${skillName}.md`;
    const ruleBody = relocateSkillLinks(mergedContent.trim(), {
      skillDir, destination, projectRoot: context.projectRoot,
      resourceRoot: `.agents/skills/${skillName}`,
    });
    const globs = antigravityGlobs(activation.globs, context.projectRoot).join(', ');
    if (/[\r\n]/.test(globs)) throw new Error(`Skill '${skillName}': Antigravity globs must fit on one line`);
    const ruleContent = field => `---\ntrigger: ${activation.mode === 'always' ? 'always_on' : 'glob'}\ndescription: ${JSON.stringify(description)}\n${field === null ? '' : `globs: ${JSON.stringify(field)}\n`}---\n\nSupporting resources are in \`.agents/skills/${skillName}/\` relative to the workspace root. Markdown links are relative to this rule file.\n\n${ruleBody}\n`;
    artifacts.push({
      path: destination,
      content: ruleContent(activation.mode === 'globs' ? globs : null),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [skillName],
    });
    if (activation.mode === 'globs') {
      const bounded = boundedWindowsGlobs(activation.globs, context.projectRoot);
      const chunks = [];
      let chunk = [];
      for (const pattern of bounded) {
        const candidate = [...chunk, pattern].join(', ');
        if (Buffer.byteLength(JSON.stringify(candidate)) > 23000 || Buffer.byteLength(ruleContent(candidate)) > 24000) {
          if (!chunk.length) throw new Error(`Skill '${skillName}': Antigravity bounded rule exceeds the 24000-byte limit`);
          chunks.push(chunk); chunk = [];
          if (Buffer.byteLength(JSON.stringify(pattern)) > 23000 || Buffer.byteLength(ruleContent(pattern)) > 24000) throw new Error(`Skill '${skillName}': Antigravity bounded rule exceeds the 24000-byte limit`);
        }
        chunk.push(pattern);
      }
      if (chunk.length) chunks.push(chunk);
      if (chunks.length > 128) throw new Error(`Skill '${skillName}': Antigravity bounded export exceeds 128 rule files`);
      const id = crypto.createHash('sha256').update(skillName).digest('hex').slice(0, 24);
      chunks.forEach((patterns, i) => artifacts.push({
        path: `.agents/rules/contextos-bounded-${id}-${String(i).padStart(3, '0')}.md`,
        content: ruleContent(patterns.join(', ')),
        mediaType: 'text/markdown', kind: 'generated-adapter', generator: GENERATOR_ID,
        sourceSkillIds: [skillName], requireOwnedExisting: true,
      }));
    }
  }

  artifacts.push(...renderSkillResources(skillDir, [
    `.agents/generated/gemini/skills/${skillName}`, `.agents/skills/${skillName}`,
  ], { kind: 'generated-adapter', generator: GENERATOR_ID, sourceSkillIds: [skillName] }, context.projectRoot));
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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export gemini', context, enabledAdapters: ['gemini'], force: options.force });
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
