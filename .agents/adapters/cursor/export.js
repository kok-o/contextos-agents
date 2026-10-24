/**
 * .agents/adapters/cursor/export.js
 * ContextOS Cursor Pure Adapter (.cursorrules and .cursor/rules/*.mdc)
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, readSkillMetadata, readCoreRules, collectSkillDirectories, stripFrontmatter, resolveActivation } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'cursor@2';

function describe() {
  return {
    name: 'cursor',
    version: '2.0.0',
    description: 'Compiles modular rules for Cursor (.cursor/rules/*.mdc and legacy .cursorrules)',
    targetPattern: '.cursor/rules/*.mdc',
  };
}

function buildSkillSection(skillDir) {
  const skillName = path.basename(skillDir);
  const skillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(skillMdPath)) return null;
  const { name: title, description } = readSkillMetadata(skillDir);

  const descLine = description ? `> ${description.replace(/\r?\n+/g, ' ').trim()}\n` : '';
  return `\n## Skill: ${title}\n${descLine}*Rule file: \`.cursor/rules/${skillName}.mdc\` (load on demand)*\n`;
}

function generateCursorMdc(skillDir, context) {
  const skillName = path.basename(skillDir);
  const skillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(skillMdPath)) return null;

  const { name: title, description } = readSkillMetadata(skillDir);

  let raw = fs.readFileSync(skillMdPath, 'utf8');
  const body = stripFrontmatter(raw).trimEnd();
  const activation = resolveActivation(skillDir);
  const globs = activation.globs.join(',');
  const alwaysApply = activation.mode === 'always';

  let cleanDescription = description.replace(/\r?\n+/g, ' ').replace(/"/g, "'").trim();
  if (activation.mode === 'auto') {
    cleanDescription = `Agent-requested: invoke when working on ${title}. ${cleanDescription}`.trim();
  }
  const mdcContent = `---
description: "${cleanDescription}"
globs: ${globs ? `"${globs}"` : '""'}
alwaysApply: ${alwaysApply}
---

# Skill: ${title}

Resolve supporting resource paths relative to \`${path.relative(context?.projectRoot || process.cwd(), skillDir).replace(/\\/g, '/')}\`. Read examples and references only when needed.

${body}
`;

  return { skillName, mdcContent };
}

function render(context) {
  const agentsMd = readCoreRules(context?.projectRoot);

  const artifacts = [];

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    profileId: context?.profileId,
  });

  // 1. 00-project-rules.mdc
  if (agentsMd !== null) {
    const projectMdc = `---
description: "ContextOS core project rules and role orchestration"
globs: ""
alwaysApply: true
---

${prov}
# ContextOS — Project Operating System Rules

${agentsMd}
`;
    artifacts.push({
      path: '.cursor/rules/00-project-rules.mdc',
      content: projectMdc.replace(/\r\n/g, '\n'),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: ['project-rules'],
    });
  }

  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  for (const skill of skills) {
    const mdc = generateCursorMdc(skill, context);
    if (mdc) {
      const fullMdc = mdc.mdcContent.replace(/\r\n/g, '\n');
      artifacts.push({
        path: `.cursor/rules/${mdc.skillName}.mdc`,
        content: fullMdc,
        mediaType: 'text/markdown',
        kind: 'generated-adapter',
        generator: GENERATOR_ID,
        sourceSkillIds: [mdc.skillName],
      });
    }
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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export cursor', context, force: options.force });
  console.log(`✓ Cursor export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('cursor', adapter);

module.exports = adapter;
