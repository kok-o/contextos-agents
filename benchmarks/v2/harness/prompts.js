'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ARMS } = require('../arms/arm-definitions');

const ROOT = path.resolve(__dirname, '../../..');
const AGENTS_DIR = path.join(ROOT, '.agents');
const CORE_AGENT_INSTRUCTIONS = path.join(AGENTS_DIR, 'AGENTS.md');
const EMPTY_PROJECT_ROOT = path.join(ROOT, 'benchmarks', 'v2', '.isolated-empty-project');
const EMPTY_WORKSPACE_GRAPH = Object.freeze({
  fingerprint: 'sha256:contextos-benchmark-empty-workspace-v1',
  packages: Object.freeze([]),
});
const contextCache = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileFingerprint(filePath) {
  return `sha256:${sha256(fs.readFileSync(filePath))}`;
}

function stripFrontmatter(content) {
  return content.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function canonicalTaskText(task) {
  return [
    `Task: ${task.title || task.id || 'Benchmark task'}`,
    `Category: ${task.category || 'General'}`,
    task.description || task.prompt || '',
    'Required public contract:',
    task.contract || '',
  ].join('\n');
}

function taskCacheKey(task, arm) {
  return JSON.stringify({
    armId: arm.id,
    id: task.id,
    title: task.title,
    category: task.category,
    description: task.description,
    prompt: task.prompt,
    contract: task.contract,
    taskSkillAnnotations: task.skills,
  });
}

function installedSkillPath(registrySkill) {
  if (!registrySkill || typeof registrySkill.source !== 'string') return null;
  const skillDirectory = path.dirname(path.resolve(ROOT, registrySkill.source));
  const documentPath = path.resolve(skillDirectory, registrySkill.entrypoint || 'SKILL.md');
  const relativeToAgents = path.relative(AGENTS_DIR, documentPath);
  if (relativeToAgents.startsWith('..') || path.isAbsolute(relativeToAgents)) return null;
  return documentPath;
}

function compileContextOSRegistry() {
  const { ManifestCompiler } = require('../../../.agents/compiler/manifest-compiler');
  const compiler = new ManifestCompiler({ rootDir: ROOT, agentsDir: AGENTS_DIR });
  const result = compiler.compile();
  if (!result.success || !result.registry) {
    throw new Error('ContextOS benchmark context could not compile the installed skill manifests.');
  }
  const errors = (result.diagnostics || []).filter(item => item.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`ContextOS benchmark manifest compilation has ${errors.length} error(s).`);
  }
  return result.registry;
}

function loadResolvedDocuments(resolution, registry) {
  const documents = [];
  const missingSkillIds = [];

  for (const id of resolution.skills || []) {
    const registrySkill = registry.skills?.[id];
    const documentPath = installedSkillPath(registrySkill);
    if (!documentPath || !fs.existsSync(documentPath)) {
      missingSkillIds.push(id);
      continue;
    }

    const content = fs.readFileSync(documentPath, 'utf8');
    documents.push({
      id,
      path: path.relative(ROOT, documentPath).replace(/\\/g, '/'),
      content,
      sha256: sha256(content),
    });
  }

  return { documents, missingSkillIds };
}

function buildContextMetadata({ arm, registry, resolver, resolution, documents, missingSkillIds, coreInstruction, resolverFingerprint, compilerFingerprint }) {
  const selectedSkillIds = [...(resolution.skills || [])];
  const includedSkillIds = documents.map(document => document.id);
  const annotations = [...new Set(Array.isArray(resolution.taskSkillAnnotations) ? resolution.taskSkillAnnotations : [])];
  const unresolvedAnnotations = annotations.filter(id => !includedSkillIds.includes(id));

  return {
    source: 'contextos-canonical-resolver',
    contextVersion: 'contextos-benchmark-context-v2',
    armId: arm.id,
    projectFixture: 'empty-workspace-v1',
    workspaceFingerprint: resolution.workspaceFingerprint,
    resolverFingerprint,
    compilerFingerprint,
    manifestFingerprint: resolution.registryFingerprint,
    selectedSkillIds,
    includedSkillIds,
    missingSkillIds,
    taskSkillAnnotations: annotations,
    unresolvedTaskSkillAnnotations: unresolvedAnnotations,
    // The resolver formatter calls every selected ID "loaded". Give it the IDs
    // whose exact installed documents were actually included in this prompt.
    resolverDeclaration: resolver.formatDeclaration({ ...resolution, skills: includedSkillIds }),
    risk: resolution.risk?.value || 'standard',
    workflowName: resolution.workflow?.name || null,
    workflowSteps: [...(resolution.workflow?.steps || [])],
    applicableRules: (resolution.rules || []).map(rule => ({ id: rule.id, summary: rule.summary })),
    skillDocuments: documents.map(({ id, path: relativePath, sha256: digest }) => ({
      id,
      path: relativePath,
      sha256: digest,
    })),
    coreInstruction: {
      path: path.relative(ROOT, CORE_AGENT_INSTRUCTIONS).replace(/\\/g, '/'),
      sha256: sha256(coreInstruction),
    },
  };
}

function buildResolvedContext(task, arm) {
  const registry = compileContextOSRegistry();
  const { CanonicalResolver } = require('../../../.agents/resolver/canonical-resolver');
  const resolver = new CanonicalResolver({
    rootDir: EMPTY_PROJECT_ROOT,
    agentsDir: AGENTS_DIR,
    registry,
    workspaceGraph: EMPTY_WORKSPACE_GRAPH,
  });

  const resolution = resolver.resolve({
    task: canonicalTaskText(task),
    projectDir: EMPTY_PROJECT_ROOT,
    workspaceGraph: EMPTY_WORKSPACE_GRAPH,
    explicitPhase: 'Build',
    contextBudgetTokens: 8000,
  });
  // Runtime-suite annotations are evidence for auditing only. Selection comes from
  // the actual resolver's task analysis and installed manifest registry.
  resolution.taskSkillAnnotations = [...new Set(Array.isArray(task.skills) ? task.skills : [])];

  const { documents, missingSkillIds } = loadResolvedDocuments(resolution, registry);
  if (!fs.existsSync(CORE_AGENT_INSTRUCTIONS)) throw new Error('ContextOS core AGENTS.md instructions are missing.');
  const coreInstruction = fs.readFileSync(CORE_AGENT_INSTRUCTIONS, 'utf8');
  const resolverFingerprint = fileFingerprint(path.join(AGENTS_DIR, 'resolver', 'canonical-resolver.js'));
  const compilerFingerprint = fileFingerprint(path.join(AGENTS_DIR, 'compiler', 'manifest-compiler.js'));
  const metadata = buildContextMetadata({
    arm,
    registry,
    resolver,
    resolution,
    documents,
    missingSkillIds,
    coreInstruction,
    resolverFingerprint,
    compilerFingerprint,
  });

  const header = arm.id === ARMS.ARM_C_CONTEXTOS_CORE.id
    ? arm.buildSystemPrompt(metadata.includedSkillIds)
    : [
      `[ContextOS Expanded Guidance — prompt-only] [RISK: ${metadata.risk.toUpperCase()}] [Skills: ${metadata.includedSkillIds.join(', ')}]`,
      'Use the canonical resolver declaration and compiled rules below. The benchmark harness runs the same runtime oracle after generation; this prompt does not run a worktree or independent reviewer.',
    ].join('\n');

  const missingNote = missingSkillIds.length > 0
    ? `\n[UNRESOLVED CONTEXTOS SKILL IDS: ${missingSkillIds.join(', ')}. No skill document for these IDs is included; do not assume their rules.]`
    : '';
  const declarations = [
    '[ContextOS Canonical Resolver Declaration]',
    metadata.resolverDeclaration,
    missingNote.trim(),
  ].filter(Boolean).join('\n');

  const ruleText = arm.id === ARMS.ARM_D_EXPANDED_GUIDANCE.id && metadata.applicableRules.length > 0
    ? `\n\n[Compiled ContextOS Rules]\n${metadata.applicableRules.map(rule => `- ${rule.id}: ${rule.summary}`).join('\n')}`
    : '';
  const workflowText = arm.id === ARMS.ARM_D_EXPANDED_GUIDANCE.id && metadata.workflowSteps.length > 0
    ? `\n\n[ContextOS Risk Workflow: ${metadata.workflowName}]\n${metadata.workflowSteps.join('\n')}`
    : '';
  const documentText = documents.map(document =>
    `[Installed ContextOS Skill: ${document.id} | sha256:${document.sha256}]\n${document.content}`
  ).join('\n\n');
  const coreInstructionText = `[ContextOS Core Agent Instructions | sha256:${metadata.coreInstruction.sha256}]\n${coreInstruction}`;
  const systemInstruction = [header, coreInstructionText, declarations, ruleText.trim(), workflowText.trim(), documentText]
    .filter(Boolean)
    .join('\n\n');

  return { systemInstruction, contextMetadata: metadata };
}

function buildPromptContext(arm, task) {
  if (arm.id === ARMS.ARM_A_VANILLA.id || arm.id === ARMS.ARM_B_CONCISE_CHECKLIST.id) {
    return {
      systemInstruction: arm.buildSystemPrompt(),
      contextMetadata: {
        source: 'none',
        contextVersion: 'contextos-benchmark-context-v2',
        armId: arm.id,
        selectedSkillIds: [],
        includedSkillIds: [],
        missingSkillIds: [],
        skillDocuments: [],
      },
    };
  }

  const key = taskCacheKey(task, arm);
  if (!contextCache.has(key)) contextCache.set(key, buildResolvedContext(task, arm));
  const context = contextCache.get(key);
  return {
    systemInstruction: context.systemInstruction,
    contextMetadata: { ...context.contextMetadata, skillDocuments: context.contextMetadata.skillDocuments.map(doc => ({ ...doc })) },
  };
}

function buildTaskPrompt(task) {
  return [
    `Task: ${task.title}`,
    `Category: ${task.category || 'General'}`,
    '',
    task.description || task.prompt || '',
    '',
    'Required public contract:',
    task.contract || '',
    '',
    'Return one complete, self-contained TypeScript implementation in exactly one fenced code block. Include all required exports. Do not use placeholders, TODOs, or omitted sections.',
  ].join('\n');
}

function buildSystemInstruction(arm, task) {
  return buildPromptContext(arm, task).systemInstruction;
}

function buildChatPrompt(arm, task) {
  return `SYSTEM INSTRUCTIONS FOR THIS BENCHMARK\n\n${buildSystemInstruction(arm, task)}\n\nUSER TASK\n\n${buildTaskPrompt(task)}`;
}

function resolveSkills(task, arm) {
  if (arm.id === ARMS.ARM_A_VANILLA.id || arm.id === ARMS.ARM_B_CONCISE_CHECKLIST.id) {
    return { selected: [], missing: [], metadata: buildPromptContext(arm, task).contextMetadata };
  }
  const { contextMetadata } = buildPromptContext(arm, task);
  return {
    selected: [...contextMetadata.includedSkillIds],
    missing: [...contextMetadata.missingSkillIds],
    metadata: contextMetadata,
  };
}

module.exports = {
  buildTaskPrompt,
  buildSystemInstruction,
  buildChatPrompt,
  buildPromptContext,
  resolveSkills,
};
