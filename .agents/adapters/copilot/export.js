/**
 * .agents/adapters/copilot/export.js
 * ContextOS GitHub Copilot Pure Adapter (.github/copilot-instructions.md)
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, readSkillManifest, readSkillMetadata, collectSkillDirectories, collectAlwaysRules, readCoreRules, stripFrontmatter } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'copilot@2';
const { CONTEXTOS_BLOCK_START, CONTEXTOS_BLOCK_END, replaceManagedBlock } = require('../../filesystem/index.js');

function describe() {
  return {
    name: 'copilot',
    version: '2.0.0',
    description: 'Compiles instructions for GitHub Copilot (.github/copilot-instructions.md)',
    targetPattern: '.github/copilot-instructions.md',
  };
}

function buildSkillSection(skillDir, context) {
  const skillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(skillMdPath)) return null;

  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const body = stripFrontmatter(raw);

  const fallbackDescription = body.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
  const { name: title, description } = readSkillMetadata(skillDir, { fallbackDescription });

  const descLine = description ? `> ${description.replace(/\r?\n+/g, ' ').trim()}\n` : '';
  const sourcePath = path.relative(context?.projectRoot || '.', skillMdPath).split(path.sep).join('/');
  const skillRef = `*Source: \`${sourcePath}\` (Read on demand)*\n`;
  return `\n### ${title}\n${descLine}${skillRef}`;
}

function render(context) {
  const lines = [];

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    profileId: context?.profileId,
  });

  const hasCoreRules = readCoreRules(context?.projectRoot) !== null;
  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  const alwaysRules = collectAlwaysRules(skills, { projectRoot: context.projectRoot, destination: '.github/copilot-instructions.md' });

  lines.push(prov + `# GitHub Copilot Instructions — ContextOS\n\n`);

  if (hasCoreRules) {
    lines.push(
      `## Project Rules\n\n` +
      `### Step 0 — Identify Before Acting\n\n` +
      `When useful for substantial work, identify:\n` +
      `\`\`\`\n1. WHAT DOMAIN?   → Frontend / Backend / Architecture / Full-Stack / DevOps\n2. WHAT PHASE?    → Define / Plan / Build / Verify / Review / Ship\n3. WHAT ROLE?     → Declare specialist role for this phase\n\`\`\`\n\n` +
      `> **Anti-Spam Invariant**: Declare this strictly once at the start of a task or phase. Never repeat before intermediate tool calls or step updates.\n\n` +
      `### Non-Negotiable Rules\n\n` +
      `- **Zero-Assumption Investigation**: Never guess file paths or signatures. Inspect before modifying.\n` +
      `- **Zero-Placeholder Production Code**: Never emit lazy stubs, \`// TODO\`, or partial code.\n` +
      `- **Mandatory Proof-of-Work Verification**: Always run tests and validators before claiming completion.\n` +
      `- **Surgical Blast Radius**: Modify only files strictly within scope.\n` +
      `- **Fast-Track Exception**: Routine maintenance, git commands, version bumps, typo fixes, and diagnostics skip spec/plan ceremonies.\n\n` +
      `---\n\n`
    );
  }

  if (alwaysRules.length > 0) {
    lines.push(`## Always-on Rules\n`);
    for (const rule of alwaysRules) lines.push(`\n### ${rule.title}\n\n${rule.body}\n`);
    lines.push(`\n---\n\n`);
  }

  lines.push(
    `## Skills Library\n\n` +
    `ContextOS uses on-demand progressive disclosure. Read the relevant \`SKILL.md\` file only when your task matches the trigger.\n\n` +
    `### Skill Routing Table\n\n` +
    `| Trigger / Domain | Skill | Path |\n` +
    `| --- | --- | --- |\n`
  );

  for (const skill of skills) {
    const skillName = path.basename(skill);
    const rawTags = readSkillManifest(skill)?.tags;
    const tags = Array.isArray(rawTags) ? rawTags.join(', ') : rawTags || skillName;
    const relPath = path.relative(context?.projectRoot || '.', getSkillEntrypointPath(skill)).replace(/\\/g, '/');
    lines.push(`| \`${tags}\` | **${skillName}** | \`${relPath}\` |\n`);
  }
  lines.push(`\n---\n`);

  for (const skill of skills) {
    const section = buildSkillSection(skill, context);
    if (section) {
      lines.push(section);
    }
  }

  const target = path.join(context?.projectRoot || '.', '.github/copilot-instructions.md');
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const block = `${CONTEXTOS_BLOCK_START}\n${lines.join('').replace(/\r\n/g, '\n')}${CONTEXTOS_BLOCK_END}`;
  let content = replaceManagedBlock(existing, block, CONTEXTOS_BLOCK_START, CONTEXTOS_BLOCK_END, '.github/copilot-instructions.md');
  if (content === null) {
    const { LockfileV2Manager, computeExactHash } = require('../../filesystem/index.js');
    const managed = new LockfileV2Manager(context?.projectRoot || '.').read({ tolerateConflicts: true })?.managedFiles?.['.github/copilot-instructions.md'];
    const legacyManaged = managed?.generator === GENERATOR_ID && managed.exactSha256 === computeExactHash(Buffer.from(existing));
    content = legacyManaged ? block + '\n' : existing + (existing && !existing.endsWith('\n') ? '\n' : '') + (existing ? '\n' : '') + block + '\n';
  }

  return [
    {
      path: '.github/copilot-instructions.md',
      content,
      preservesUserContent: true,
      expectedBeforeHash: fs.existsSync(target) ? require('../../filesystem/index.js').computeExactHash(Buffer.from(existing)) : 'NONE',
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: skills.map(s => path.basename(s)),
    },
  ];
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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export copilot', context, force: options.force });
  console.log(`✓ Copilot export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('copilot', adapter);

module.exports = adapter;
