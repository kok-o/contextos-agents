#!/usr/bin/env node

/**
 * ContextOS Execution-Backed Runtime Benchmark Suite
 *
 * Runs paired, sandboxed execution benchmarks comparing:
 * Scenario 1: Baseline (Without Skills / Vanilla LLM)
 * Scenario 2: ContextOS (With Authoritative Skills & Ponytail Mindset)
 *
 * Evaluates real compilation, actual runtime assertions, cryptographic correctness,
 * state machine invariants, and security exploit defenses.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const { LLMClient, sleep } = require('./lib/llm-client');
const { loadSkillContext } = require('./lib/tasks');
const { extractCodeBlocks } = require('./lib/evaluator');
const { RUNTIME_SUITES } = require('./lib/runtime-suites');
const { runRuntimeSuite } = require('./lib/runtime-runner');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    provider: '',
    model: '',
    apiKey: '',
    baseUrl: '',
    task: 'all',
    maxTokens: 4096,
    html: true,
    open: false,
    output: path.join(ROOT, 'benchmarks', 'results'),
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const val = argv[++i];
      if (!val || val.startsWith('--')) throw new Error(`${arg} requires a value`);
      return val;
    };

    if (arg === '--provider') options.provider = next().toLowerCase();
    else if (arg === '--model') options.model = next();
    else if (arg === '--api-key' || arg === '--key') options.apiKey = next();
    else if (arg === '--base-url') options.baseUrl = next();
    else if (arg === '--task') options.task = next();
    else if (arg === '--max-tokens') options.maxTokens = parseInt(next(), 10);
    else if (arg === '--output') options.output = path.resolve(next());
    else if (arg === '--open') options.open = true;
    else if (arg === '--no-html') options.html = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`
ContextOS Execution-Backed Runtime Benchmark Suite

Usage:
  node benchmarks/run-runtime-benchmark.js [options]

Options:
  --provider <name>    LLM Provider: "openai", "gemini", "anthropic", "custom"
  --model <name>       Model name (e.g. gpt-4o, gemini-2.5-flash, deepseek-v4-flash)
  --api-key <key>      API key (or set OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY)
  --base-url <url>     Custom OpenAI-compatible base URL (e.g. https://agentrouter.org/v1)
  --task <id|all>      Run specific task ("auth-security", "ddd-order-invariants", "resilient-api-client", or "all")
  --open               Open generated HTML report in browser automatically
  --output <dir>       Output directory for benchmark reports (default: benchmarks/results)
  --help, -h           Show this help message
`);
}

function generateMarkdownReport(report) {
  const { summary, results, provider, model, timestamp } = report;

  let md = `# ContextOS Runtime Execution Benchmark Report\n\n`;
  md += `**Provider:** \`${provider}\`  \n`;
  md += `**Model:** \`${model}\`  \n`;
  md += `**Timestamp:** ${timestamp}  \n`;
  md += `**Evaluated Scenarios:** ${results.length}\n\n`;
  md += `---\n\n## Executive Summary\n\n`;
  md += `| Metric | Baseline (Without Skills) | With ContextOS Skills | Delta / Impact |\n`;
  md += `|:---|:---:|:---:|:---:|\n`;
  md += `| **Runtime Test Pass Rate** | ${summary.baselinePassRate}% | **${summary.skillPassRate}%** | **${summary.passRateDelta >= 0 ? '+' : ''}${summary.passRateDelta}%** |\n`;
  md += `| **Compilation / Syntax Success** | ${summary.baselineCompilationRate}% | **${summary.skillCompilationRate}%** | **${summary.skillCompilationRate - summary.baselineCompilationRate >= 0 ? '+' : ''}${summary.skillCompilationRate - summary.baselineCompilationRate}%** |\n`;
  md += `| **Average Tests Passed** | ${summary.baselineAvgPassed} / ${summary.avgTotalTests} | **${summary.skillAvgPassed} / ${summary.avgTotalTests}** | **+${(summary.skillAvgPassed - summary.baselineAvgPassed).toFixed(1)} tests** |\n\n`;
  md += `---\n\n## Scenario Details\n\n`;

  for (const r of results) {
    md += `### ${r.title} (\`${r.category}\`)\n\n`;
    md += `- **Skills Activated:** \`${r.skills.join('`, `')}\`\n`;
    md += `- **Baseline Pass Rate:** ${r.baseline.passRate}% (${r.baseline.totalPassed}/${r.baseline.totalTests} tests passed)\n`;
    md += `- **ContextOS Pass Rate:** **${r.withSkills.passRate}%** (${r.withSkills.totalPassed}/${r.withSkills.totalTests} tests passed)\n`;
    md += `- **Net Quality Delta:** **${r.delta >= 0 ? '+' : ''}${r.delta}%**\n\n`;

    md += `#### Concrete Test Assertions:\n\n`;
    for (let i = 0; i < r.withSkills.tests.length; i++) {
      const sTest = r.withSkills.tests[i];
      const bTest = r.baseline.tests.find(t => t.id === sTest.id) || { passed: false };
      const statusIcon = sTest.passed ? '✅ PASS' : '❌ FAIL';
      const bStatusIcon = bTest.passed ? 'PASS' : 'FAIL';
      md += `- ${statusIcon} **${sTest.name}** (Baseline: \`${bStatusIcon}\` → ContextOS: \`${sTest.passed ? 'PASS' : 'FAIL'}\`)\n`;
      if (!sTest.passed && sTest.error) {
        md += `  - *ContextOS Failure:* \`${sTest.error}\`\n`;
      }
      if (!bTest.passed && bTest.error) {
        md += `  - *Baseline Failure:* \`${bTest.error}\`\n`;
      }
    }
    md += `\n---\n\n`;
  }

  return md;
}

function generateHtmlReport(report) {
  const { summary, results, provider, model, timestamp } = report;

  const rows = results.map(r => `
    <tr>
      <td><strong>${r.title}</strong><br><small style="color:#64748b">${r.category}</small></td>
      <td style="text-align:center"><span class="badge ${r.baseline.passRate >= 80 ? 'badge-pass' : 'badge-fail'}">${r.baseline.passRate}%</span><br><small>${r.baseline.totalPassed}/${r.baseline.totalTests} passed</small></td>
      <td style="text-align:center"><span class="badge ${r.withSkills.passRate >= 80 ? 'badge-pass' : 'badge-fail'}">${r.withSkills.passRate}%</span><br><small>${r.withSkills.totalPassed}/${r.withSkills.totalTests} passed</small></td>
      <td style="text-align:center; font-weight:bold; color:${r.delta >= 0 ? '#16a34a' : '#dc2626'}">${r.delta >= 0 ? '+' : ''}${r.delta}%</td>
      <td>
        <ul style="margin:0; padding-left:1.2rem; font-size:0.85rem">
          ${r.withSkills.tests.map(t => `<li style="color:${t.passed ? '#15803d' : '#b91c1c'}">${t.passed ? '✓' : '✗'} ${t.name}</li>`).join('')}
        </ul>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ContextOS Runtime Benchmark — ${model}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; background: #131b2e; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #1e293b; }
    h1 { color: #38bdf8; margin-top: 0; font-size: 1.8rem; }
    .meta { color: #94a3b8; font-size: 0.95rem; margin-bottom: 2rem; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; padding: 1.25rem; border-radius: 8px; border: 1px solid #334155; }
    .card .val { font-size: 2rem; font-weight: bold; color: #38bdf8; }
    .card .label { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #1e293b; }
    th { background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 0.8rem; }
    .badge { display: inline-block; padding: 0.25rem 0.6rem; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; }
    .badge-pass { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 ContextOS Execution-Backed Runtime Benchmark</h1>
    <div class="meta">Model: <strong>${model}</strong> | Provider: <strong>${provider.toUpperCase()}</strong> | Date: <strong>${timestamp}</strong></div>
    <div class="metrics">
      <div class="card"><div class="val">${summary.baselinePassRate}%</div><div class="label">Baseline Pass Rate</div></div>
      <div class="card"><div class="val" style="color:#4ade80">${summary.skillPassRate}%</div><div class="label">ContextOS Pass Rate</div></div>
      <div class="card"><div class="val" style="color:#38bdf8">+${summary.passRateDelta}%</div><div class="label">Net Improvement</div></div>
      <div class="card"><div class="val">${summary.skillCompilationRate}%</div><div class="label">Syntax & Compilation</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th style="text-align:center">Baseline</th>
          <th style="text-align:center">With ContextOS</th>
          <th style="text-align:center">Delta</th>
          <th>Behavioral Assertions</th>
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

async function runBenchmark() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let suitesToRun = Object.values(RUNTIME_SUITES);
  if (options.task && options.task !== 'all') {
    suitesToRun = suitesToRun.filter(s => s.id === options.task);
    if (suitesToRun.length === 0) {
      console.error(`[ERROR] Task "${options.task}" not found. Available tasks:`);
      Object.keys(RUNTIME_SUITES).forEach(k => console.error(`  - ${k}`));
      process.exit(1);
    }
  }

  let llmClient;
  try {
    llmClient = new LLMClient({
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`  ContextOS Execution-Backed Runtime Benchmark Suite`);
  console.log(`  Provider:    ${llmClient.provider.toUpperCase()}`);
  console.log(`  Model:       ${llmClient.model}`);
  console.log(`  Scenarios:   ${suitesToRun.length} live execution suites`);
  console.log(`  Execution:   Real Sandbox Assertions (node:vm + assert)`);
  console.log(`══════════════════════════════════════════════════════════════════\n`);

  const results = [];

  for (let i = 0; i < suitesToRun.length; i++) {
    const suite = suitesToRun[i];
    console.log(`\n[Suite ${i + 1}/${suitesToRun.length}] ${suite.title} (${suite.category})`);

    try {
      // 1. Generate Baseline
      console.log(`  → [Scenario 1] Generating Baseline (Vanilla prompt)...`);
      const contractSection = suite.contract ? `\n=== Required TypeScript Interface & Class Contract ===\n${suite.contract.trim()}\n` : '';
      const concisenessRule = '\nREQUIREMENTS:\n- Keep implementation self-contained. Use internal Maps or arrays for in-memory storage. Do NOT create separate auxiliary store, repository, or logger classes.\n- Keep code concise, direct, and under 150 lines so it never truncates.\n- Output pure code inside exactly ONE ```typescript ... ``` code block without commentary or introductions.\n';
      const baselinePrompt = `Task: ${suite.title}\nCategory: ${suite.category}${contractSection}${concisenessRule}\nProvide the complete, self-contained production-ready implementation in TypeScript/JavaScript with all necessary types, classes, interfaces, and function exports.\n\nCRITICAL REQUIREMENT: Output EXACTLY ONE single self-contained TypeScript file inside a single \`\`\`typescript ... \`\`\` code block. Output pure code immediately without essay introductions or conversational text before/after the code block. All functions and classes must be 100% implemented without placeholders.`;
      const baseResult = await llmClient.generate({
        prompt: baselinePrompt,
        maxTokens: options.maxTokens,
        systemInstruction: 'You are an expert software engineer. Output EXACTLY ONE single self-contained, working production code file inside a single markdown code block (```typescript ... ```). Keep code concise and under 220 lines. Do NOT write introductions, essays, or commentary. All functions and classes must be 100% implemented without placeholders or comments replacing implementation.',
      });
      const baselineCode = extractCodeBlocks(baseResult.text);
      console.log(`     Baseline generation completed in ${baseResult.latencyMs}ms (${baselineCode.length} chars)`);

      await sleep(1000);

      // 2. Generate With Skills
      console.log(`  → [Scenario 2] Generating With ContextOS Skills (${suite.skills.join(', ')})...`);
      const skillRules = suite.skills.map(loadSkillContext).join('\n');
      const skillPrompt = `Task: ${suite.title}\nCategory: ${suite.category}${contractSection}\n=== ContextOS Authoritative Skills & Architecture Guidelines ===\n${skillRules}\n${concisenessRule}\nStrictly implement the complete, self-contained production code adhering to the loaded ContextOS technical rules, invariants, and architecture guidelines above.\n\nCRITICAL REQUIREMENT: Output EXACTLY ONE single self-contained TypeScript file inside a single \`\`\`typescript ... \`\`\` code block. Output pure code immediately without essay introductions or conversational text before/after the code block. All functions and classes must be 100% implemented without placeholders.`;
      const skillResult = await llmClient.generate({
        prompt: skillPrompt,
        maxTokens: options.maxTokens,
        systemInstruction: '[PHASE: Build] [ROLE: Senior Developer] You are an elite principal engineer executing the approved plan. Apply all ContextOS technical rules, zero-placeholder discipline, and domain guidelines. Keep code concise and under 220 lines. Output EXACTLY ONE single self-contained production code file inside a single markdown code block (```typescript ... ```). Do NOT write introductions or commentary. All functions and classes must be 100% implemented.',
      });
      const skillCode = extractCodeBlocks(skillResult.text);
      console.log(`     ContextOS generation completed in ${skillResult.latencyMs}ms (${skillCode.length} chars)`);

      // 3. Run Real Sandbox Test Assertions
      console.log(`  → Executing sandboxed runtime test suite...`);
      const baselineRun = await runRuntimeSuite(suite, baselineCode);
      const skillRun = await runRuntimeSuite(suite, skillCode);
      baselineRun.code = baselineCode;
      skillRun.code = skillCode;

      const delta = skillRun.passRate - baselineRun.passRate;
      console.log(`     Baseline:  ${baselineRun.passRate}% passed (${baselineRun.totalPassed}/${baselineRun.totalTests} tests) [Compiled: ${baselineRun.compiled}]`);
      if (!baselineRun.compiled) console.warn(`       [Baseline Syntax Error]: ${baselineRun.compilationError}`);
      console.log(`     ContextOS: ${skillRun.passRate}% passed (${skillRun.totalPassed}/${skillRun.totalTests} tests) [Compiled: ${skillRun.compiled}]`);
      if (!skillRun.compiled) console.warn(`       [ContextOS Syntax Error]: ${skillRun.compilationError}`);
      console.log(`     Delta:     ${delta >= 0 ? '+' : ''}${delta}%`);

      results.push({
        taskId: suite.id,
        title: suite.title,
        category: suite.category,
        skills: suite.skills,
        baseline: baselineRun,
        withSkills: skillRun,
        delta,
      });
    } catch (suiteErr) {
      console.error(`  [Suite Error] ${suite.id} failed: ${suiteErr.message}`);
    }

    await sleep(1000);
  }

  if (results.length === 0) {
    console.error('[ERROR] No suites completed successfully.');
    process.exit(1);
  }

  const baselinePassRate = Math.round(results.reduce((s, r) => s + r.baseline.passRate, 0) / results.length);
  const skillPassRate = Math.round(results.reduce((s, r) => s + r.withSkills.passRate, 0) / results.length);
  const baselineCompilationRate = Math.round((results.filter(r => r.baseline.compiled).length / results.length) * 100);
  const skillCompilationRate = Math.round((results.filter(r => r.withSkills.compiled).length / results.length) * 100);
  const baselineAvgPassed = Number((results.reduce((s, r) => s + r.baseline.totalPassed, 0) / results.length).toFixed(1));
  const skillAvgPassed = Number((results.reduce((s, r) => s + r.withSkills.totalPassed, 0) / results.length).toFixed(1));
  const avgTotalTests = Number((results.reduce((s, r) => s + r.withSkills.totalTests, 0) / results.length).toFixed(1));

  const report = {
    timestamp: new Date().toISOString(),
    provider: llmClient.provider,
    model: llmClient.model,
    summary: {
      suitesCount: results.length,
      baselinePassRate,
      skillPassRate,
      passRateDelta: skillPassRate - baselinePassRate,
      baselineCompilationRate,
      skillCompilationRate,
      baselineAvgPassed,
      skillAvgPassed,
      avgTotalTests,
    },
    results,
  };

  fs.mkdirSync(options.output, { recursive: true });
  const baseName = `runtime-report-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const jsonPath = path.join(options.output, `${baseName}.json`);
  const mdPath = path.join(options.output, 'runtime-report-latest.md');
  const htmlPath = path.join(options.output, 'runtime-report-latest.html');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf8');
  fs.writeFileSync(htmlPath, generateHtmlReport(report), 'utf8');

  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`  ContextOS Execution Benchmark Completed`);
  console.log(`  Baseline Pass Rate:   ${baselinePassRate}%`);
  console.log(`  ContextOS Pass Rate:  ${skillPassRate}%`);
  console.log(`  Net Quality Delta:    ${skillPassRate - baselinePassRate >= 0 ? '+' : ''}${skillPassRate - baselinePassRate}%`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(`  HTML Dashboard: ${htmlPath}`);
  console.log(`  Markdown Summary: ${mdPath}\n`);

  if (options.open) {
    const openCmd = process.platform === 'win32' ? `start "" "${htmlPath}"` :
      process.platform === 'darwin' ? `open "${htmlPath}"` : `xdg-open "${htmlPath}"`;
    exec(openCmd);
  }
}

if (require.main === module) {
  runBenchmark().catch(err => {
    console.error('\n[FATAL]', err.stack || err);
    process.exit(1);
  });
}

module.exports = {
  runBenchmark,
  parseArgs,
  generateMarkdownReport,
  generateHtmlReport,
};
