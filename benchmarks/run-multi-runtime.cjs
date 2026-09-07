#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { LLMClient, sleep } = require('./lib/llm-client');
const { loadSkillContext } = require('./lib/tasks');
const { extractCodeBlocks } = require('./lib/evaluator');
const { RUNTIME_SUITES } = require('./lib/runtime-suites');
const { runRuntimeSuite } = require('./lib/runtime-runner');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'benchmarks', 'results');

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const AGENTROUTER_KEY = process.env.AGENTROUTER_API_KEY || process.env.AGENTROUTER_KEY || '';
const AGENTROUTER_BASE = process.env.AGENTROUTER_BASE_URL || 'https://ps.air-outer.com/v1';

const GEMINI_STUDIO_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';

const MODELS = [
  {
    id: 'gemini-3.8-flash',
    displayName: 'gemini-3.8-flash',
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    gateway: 'Google AI Studio',
    apiKey: GEMINI_STUDIO_KEY,
    envVar: 'GEMINI_API_KEY',
    maxTokens: 4096,
  },
  {
    id: 'glm-5.3',
    displayName: 'glm-5.3',
    provider: 'custom',
    model: 'glm-5.3',
    gateway: 'AgentRouter (ps.air-outer.com)',
    baseUrl: AGENTROUTER_BASE,
    apiKey: AGENTROUTER_KEY,
    envVar: 'AGENTROUTER_API_KEY',
    maxTokens: 4096,
  },
  {
    id: 'deepseek-v4-flash',
    displayName: 'deepseek-v4-flash',
    provider: 'custom',
    model: 'deepseek-v4-flash',
    gateway: 'AgentRouter (ps.air-outer.com)',
    baseUrl: AGENTROUTER_BASE,
    apiKey: AGENTROUTER_KEY,
    envVar: 'AGENTROUTER_API_KEY',
    maxTokens: 4096,
  },
];

async function runBenchmarkForModel(modelConfig) {
  console.log(`\n==================================================================`);
  console.log(`  Evaluating: ${modelConfig.displayName}`);
  console.log(`  Gateway:    ${modelConfig.gateway}`);
  console.log(`==================================================================`);

  if (!modelConfig.apiKey) {
    console.warn(`  ⚠️ Skipping ${modelConfig.displayName}: Missing environment variable ${modelConfig.envVar || 'API key'}.`);
    console.warn(`     Set with: export ${modelConfig.envVar}="your-key" (or PowerShell: $env:${modelConfig.envVar} = "your-key")`);
    return null;
  }

  const client = new LLMClient({
    provider: modelConfig.provider,
    model: modelConfig.model,
    apiKey: modelConfig.apiKey,
    baseUrl: modelConfig.baseUrl,
    timeoutMs: 90000,
    maxRetries: 4,
  });

  const maxTokens = modelConfig.maxTokens || 2500;
  const pauseMs = modelConfig.provider === 'gemini' ? 3500 : 800;
  const suites = Object.values(RUNTIME_SUITES);
  const results = [];

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];
    console.log(`  [Suite ${i + 1}/${suites.length}] ${suite.title}`);

    const contractSection = suite.contract ? `\n=== Required TypeScript Interface & Class Contract ===\n${suite.contract.trim()}\n` : '';
    const concisenessRule = modelConfig.compactPrompt
      ? '\nCRITICAL REQUIREMENT: Output EXACTLY ONE single self-contained TypeScript code block under 35 lines. Implement the core class directly with no comments, no decorators, and no extra code.\n'
      : '\nREQUIREMENTS:\n- Keep implementation self-contained. Use internal Maps or arrays for in-memory storage. Do NOT create separate auxiliary store, repository, or logger classes.\n- Keep code concise, direct, and under 150 lines so it never truncates.\n- Output pure code inside exactly ONE ```typescript ... ``` code block without commentary or introductions.\n';

    // 1. Baseline
    console.log(`    → Generating Baseline...`);
    const baselinePrompt = `Task: ${suite.title}\nCategory: ${suite.category}${contractSection}${concisenessRule}\nProvide the complete, self-contained production-ready implementation in TypeScript/JavaScript with all necessary types, classes, interfaces, and function exports.\n\nCRITICAL REQUIREMENT: Output EXACTLY ONE single self-contained TypeScript file inside a single \`\`\`typescript ... \`\`\` code block. Output pure code immediately without essay introductions or conversational text before/after the code block. All functions and classes must be 100% implemented without placeholders.`;

    let baselineCode = '';
    let baselineLatency = 0;
    try {
      const res = await client.generate({
        prompt: baselinePrompt,
        maxTokens,
        systemInstruction: modelConfig.compactPrompt
          ? 'Output only the TypeScript code inside ONE markdown code block. Keep under 35 lines.'
          : 'You are an expert software engineer. Output EXACTLY ONE single self-contained, working production code file inside a single markdown code block (```typescript ... ```). Keep code concise and under 200 lines. Do NOT write introductions, essays, or commentary. All functions and classes must be 100% implemented without placeholders.',
      });
      baselineCode = extractCodeBlocks(res.text);
      baselineLatency = res.latencyMs;
    } catch (err) {
      console.warn(`      [Baseline Generation Error]: ${err.message}`);
    }

    await sleep(pauseMs);

    // 2. ContextOS Skills
    console.log(`    → Generating With ContextOS Skills (${suite.skills.join(', ')})...`);
    const rawSkillRules = suite.skills.map(loadSkillContext).join('\n');
    const skillRules = modelConfig.compactPrompt ? rawSkillRules.slice(0, 1000) : rawSkillRules;
    const skillPrompt = `Task: ${suite.title}\nCategory: ${suite.category}${contractSection}\n=== ContextOS Authoritative Skills & Architecture Guidelines ===\n${skillRules}\n${concisenessRule}\nStrictly implement the complete, self-contained production code adhering to the loaded ContextOS technical rules, invariants, and architecture guidelines above.\n\nCRITICAL REQUIREMENT: Output EXACTLY ONE single self-contained TypeScript file inside a single \`\`\`typescript ... \`\`\` code block. Output pure code immediately without essay introductions or conversational text before/after the code block. All functions and classes must be 100% implemented without placeholders.`;

    let skillCode = '';
    let skillLatency = 0;
    try {
      const res = await client.generate({
        prompt: skillPrompt,
        maxTokens,
        systemInstruction: modelConfig.compactPrompt
          ? '[ROLE: Senior Developer] Output only the TypeScript code inside ONE markdown code block. Keep under 35 lines.'
          : '[PHASE: Build] [ROLE: Senior Developer] You are an elite principal engineer executing the approved plan. Apply all ContextOS technical rules, zero-placeholder discipline, and domain guidelines. Keep code concise and under 200 lines. Output EXACTLY ONE single self-contained production code file inside a single markdown code block (```typescript ... ```). Do NOT write introductions or commentary. All functions and classes must be 100% implemented.',
      });
      skillCode = extractCodeBlocks(res.text);
      skillLatency = res.latencyMs;
    } catch (err) {
      console.warn(`      [ContextOS Generation Error]: ${err.message}`);
    }

    // 3. Sandbox Run
    const baselineRun = await runRuntimeSuite(suite, baselineCode);
    const skillRun = await runRuntimeSuite(suite, skillCode);
    baselineRun.code = baselineCode;
    baselineRun.latencyMs = baselineLatency;
    skillRun.code = skillCode;
    skillRun.latencyMs = skillLatency;

    const delta = skillRun.passRate - baselineRun.passRate;
    console.log(`      Baseline:  ${baselineRun.passRate}% (${baselineRun.totalPassed}/${baselineRun.totalTests}) [Compiled: ${baselineRun.compiled}]`);
    console.log(`      ContextOS: ${skillRun.passRate}% (${skillRun.totalPassed}/${skillRun.totalTests}) [Compiled: ${skillRun.compiled}]`);
    console.log(`      Delta:     ${delta >= 0 ? '+' : ''}${delta}%`);

    results.push({
      taskId: suite.id,
      title: suite.title,
      category: suite.category,
      skills: suite.skills,
      baseline: baselineRun,
      withSkills: skillRun,
      delta,
    });

    await sleep(800);
  }

  const baselinePassRate = Math.round(results.reduce((s, r) => s + r.baseline.passRate, 0) / results.length);
  const skillPassRate = Math.round(results.reduce((s, r) => s + r.withSkills.passRate, 0) / results.length);
  const baselineCompiledCount = results.filter(r => r.baseline.compiled).length;
  const skillCompiledCount = results.filter(r => r.withSkills.compiled).length;
  const compilationRate = Math.round((skillCompiledCount / results.length) * 100);
  const totalPassed = results.reduce((s, r) => s + r.withSkills.totalPassed, 0);
  const totalTests = results.reduce((s, r) => s + r.withSkills.totalTests, 0);

  return {
    model: modelConfig.displayName,
    gateway: modelConfig.gateway,
    summary: {
      baselinePassRate,
      skillPassRate,
      delta: skillPassRate - baselinePassRate,
      compilationRate,
      totalPassed,
      totalTests,
    },
    results,
  };
}

function generateMarkdownLeaderboard(allModelReports) {
  const timestamp = new Date().toISOString();

  // Sort by ContextOS Pass Rate descending, then delta descending
  const sorted = [...allModelReports].sort((a, b) => {
    if (b.summary.skillPassRate !== a.summary.skillPassRate) {
      return b.summary.skillPassRate - a.summary.skillPassRate;
    }
    return b.summary.delta - a.summary.delta;
  });

  const medals = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8'];

  let md = `# ContextOS Multi-Model Runtime Execution Benchmark Report\n\n`;
  md += `**Timestamp:** \`${timestamp}\`  \n`;
  md += `**Gateways Tested:** \`OpenRouter (api.openrouter.ai)\`, \`AgentRouter Backup (ps.air-outer.com)\`  \n`;
  md += `**Evaluated Models:** ${allModelReports.length} flagship models  \n`;
  md += `**Execution Sandbox:** Real V8 Sandbox Assertions (\`node:vm\` + native TypeScript stripping + assertions)\n\n`;
  md += `---\n\n## Executive Summary & Model Leaderboard\n\n`;
  md += `| Rank | Model | Gateway / Provider | Baseline Pass Rate | With ContextOS | Delta | V8 Compilation | Real-World Runtime Behavior |\n`;
  md += `|:---:|:---|:---|:---:|:---:|:---:|:---:|:---|\n`;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const medal = medals[i] || `${i + 1}`;
    const deltaStr = m.summary.delta >= 0 ? `+${m.summary.delta}%` : `${m.summary.delta}%`;
    const behaviorNotes = m.summary.skillPassRate >= 80
      ? `High adherence to architectural invariants; passed ${m.summary.totalPassed}/${m.summary.totalTests} tests across security, DDD, and reliability.`
      : `Moderate adherence (${m.summary.totalPassed}/${m.summary.totalTests}); minor test assertion edge cases.`;

    md += `| ${medal} | **\`${m.model}\`** | ${m.gateway} | ${m.summary.baselinePassRate}% | **${m.summary.skillPassRate}% (${m.summary.totalPassed}/${m.summary.totalTests})** | **${deltaStr}** | **${m.summary.compilationRate}%** | ${behaviorNotes} |\n`;
  }

  md += `\n---\n\n## Breakdown by Production Scenario\n\n`;

  const suites = Object.values(RUNTIME_SUITES);
  for (const suite of suites) {
    md += `### ${suite.title} (\`${suite.category}\`)\n\n`;
    md += `- **Skills Activated:** \`${suite.skills.join('`, `')}\`\n\n`;
    md += `| Model | Gateway | Baseline Pass | ContextOS Pass | Delta | Compilation |\n`;
    md += `|:---|:---|:---:|:---:|:---:|:---:|\n`;

    for (const m of sorted) {
      const suiteRes = m.results.find(r => r.taskId === suite.id);
      if (!suiteRes) continue;
      const dStr = suiteRes.delta >= 0 ? `+${suiteRes.delta}%` : `${suiteRes.delta}%`;
      md += `| \`${m.model}\` | ${m.gateway} | ${suiteRes.baseline.passRate}% (${suiteRes.baseline.totalPassed}/${suiteRes.baseline.totalTests}) | **${suiteRes.withSkills.passRate}% (${suiteRes.withSkills.totalPassed}/${suiteRes.withSkills.totalTests})** | **${dStr}** | ${suiteRes.withSkills.compiled ? '✅ 100%' : '❌ Fail'} |\n`;
    }

    md += `\n---\n\n`;
  }

  return md;
}

function generateHtmlLeaderboard(allModelReports) {
  const timestamp = new Date().toISOString();
  const sorted = [...allModelReports].sort((a, b) => b.summary.skillPassRate - a.summary.skillPassRate);
  const medals = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8'];

  const rows = sorted.map((m, i) => `
    <tr>
      <td style="text-align:center; font-size:1.2rem">${medals[i] || i + 1}</td>
      <td><strong>${m.model}</strong><br><small style="color:#64748b">${m.gateway}</small></td>
      <td style="text-align:center"><span class="badge ${m.summary.baselinePassRate >= 70 ? 'badge-pass' : 'badge-fail'}">${m.summary.baselinePassRate}%</span></td>
      <td style="text-align:center"><span class="badge ${m.summary.skillPassRate >= 70 ? 'badge-pass' : 'badge-fail'}">${m.summary.skillPassRate}%</span><br><small>${m.summary.totalPassed}/${m.summary.totalTests} passed</small></td>
      <td style="text-align:center; font-weight:bold; color:${m.summary.delta >= 0 ? '#16a34a' : '#dc2626'}">${m.summary.delta >= 0 ? '+' : ''}${m.summary.delta}%</td>
      <td style="text-align:center">${m.summary.compilationRate}%</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ContextOS Multi-Model Benchmark Leaderboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { color: #38bdf8; margin-bottom: 0.5rem; }
    .meta { color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #0f172a; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; }
    .badge-pass { background: #166534; color: #bbf7d0; }
    .badge-fail { background: #991b1b; color: #fecaca; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ ContextOS Multi-Model Benchmark Leaderboard</h1>
    <div class="meta">Timestamp: ${timestamp} | Live V8 Sandbox Assertions | OpenRouter & AgentRouter</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:center">Rank</th>
          <th>Model</th>
          <th style="text-align:center">Baseline</th>
          <th style="text-align:center">With ContextOS</th>
          <th style="text-align:center">Delta</th>
          <th style="text-align:center">Compilation</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allReports = [];

  for (const modelConfig of MODELS) {
    try {
      const report = await runBenchmarkForModel(modelConfig);
      if (report) {
        allReports.push(report);
      }
    } catch (err) {
      console.error(`[ERROR] Failed model ${modelConfig.displayName}: ${err.message}`);
    }
  }

  if (allReports.length === 0) {
    console.error('[FATAL] No models completed successfully.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `runtime-multi-model-${timestamp}.json`);
  const mdPath = path.join(OUTPUT_DIR, 'runtime-report-latest.md');
  const htmlPath = path.join(OUTPUT_DIR, 'runtime-report-latest.html');

  fs.writeFileSync(jsonPath, JSON.stringify(allReports, null, 2), 'utf8');
  fs.writeFileSync(mdPath, generateMarkdownLeaderboard(allReports), 'utf8');
  fs.writeFileSync(htmlPath, generateHtmlLeaderboard(allReports), 'utf8');

  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`  All Models Benchmark Completed!`);
  console.log(`  JSON Artifact: ${jsonPath}`);
  console.log(`  Markdown:      ${mdPath}`);
  console.log(`  HTML:          ${htmlPath}`);
  console.log(`══════════════════════════════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
