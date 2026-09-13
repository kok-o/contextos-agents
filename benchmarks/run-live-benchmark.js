#!/usr/bin/env node

/**
 * ContextOS Live Benchmark Engine
 *
 * Runs paired live benchmarks comparing:
 * Scenario 1: Baseline (Without Skills / Vanilla LLM)
 * Scenario 2: ContextOS (With Dynamic Skills, Rules, and Ponytail Mindset)
 *
 * Supports OpenAI (GPT-4o, GPT-5, o1, o3-mini), Google Gemini, Anthropic Claude,
 * and custom OpenAI-compatible endpoints (OpenRouter, DeepSeek, Local LLMs).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const { LLMClient, sleep } = require('./lib/llm-client');
const { sumUsage } = require('./lib/usage');
const { BENCHMARK_TASKS, loadSkillContext } = require('./lib/tasks');
const { evaluateSubmission } = require('./lib/evaluator');
const { printTerminalReport, generateMarkdownReport, generateHtmlReport } = require('./lib/reporter');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    provider: '',
    model: '',
    apiKey: '',
    baseUrl: '',
    task: 'all',
    html: true,
    open: false,
    output: path.join(ROOT, 'benchmarks', 'results', 'legacy', 'live'),
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
ContextOS Live Multi-Model Benchmark Suite

Usage:
  node benchmarks/run-live-benchmark.js [options]

Options:
  --provider <name>    LLM Provider: "openai", "gemini", "anthropic", "custom" (Auto-detected if omitted)
  --model <name>       Model name (e.g. gpt-4o, gpt-4.5-preview, o3-mini, gemini-2.5-flash, claude-3-7-sonnet)
  --api-key <key>      API key (or set OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY)
  --base-url <url>     Custom OpenAI-compatible base URL (e.g. https://openrouter.ai/api/v1)
  --task <id|all>      Run specific benchmark task ID or "all" (default: all)
  --open               Open the generated HTML report in browser automatically
  --output <dir>       Directory for benchmark results (default: benchmarks/results)
  --help, -h           Show this help message

Supported Providers & Environment Variables:
  • OpenAI:            OPENAI_API_KEY (supports gpt-4o, gpt-4.5, o1, o3-mini, etc.)
  • Google Gemini:     GEMINI_API_KEY (supports gemini-2.5-flash, gemini-2.5-pro, etc.)
  • Anthropic Claude:  ANTHROPIC_API_KEY (supports claude-3-7-sonnet, claude-3-5-haiku, etc.)
  • Custom / Router:   OPENAI_BASE_URL (supports OpenRouter, AgentRouter, DeepSeek, Groq, Ollama)

Examples:
  # Run live benchmark with OpenAI GPT-4o:
  node benchmarks/run-live-benchmark.js --provider openai --model gpt-4o --api-key sk-...

  # Run live benchmark with Google Gemini:
  node benchmarks/run-live-benchmark.js --provider gemini --model gemini-2.5-flash

  # Run live benchmark with custom router (e.g. AgentRouter):
  node benchmarks/run-live-benchmark.js --base-url "https://agentrouter.org/v1" --api-key "sk-..." --model "gpt-5.6-sol"
`);
}

async function runBenchmark() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let tasksToRun = BENCHMARK_TASKS;
  if (options.task && options.task !== 'all') {
    tasksToRun = BENCHMARK_TASKS.filter(t => t.id === options.task);
    if (tasksToRun.length === 0) {
      console.error(`[ERROR] Task "${options.task}" not found. Available tasks:`);
      BENCHMARK_TASKS.forEach(t => console.error(`  - ${t.id} (${t.title})`));
      process.exit(1);
    }
  }

  let llmClient = null;
  try {
    llmClient = new LLMClient({
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  } catch (err) {
    console.error(`\n[ERROR] ${err.message}`);
    console.error('        To run a real benchmark, pass --api-key <key> or set environment variables (e.g. OPENAI_API_KEY, GEMINI_API_KEY).\n');
    process.exit(1);
  }

  if (!llmClient.apiKey && llmClient.provider !== 'custom') {
    const envVar = llmClient.provider === 'gemini' ? 'GEMINI_API_KEY' :
      llmClient.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    console.error(`\n[ERROR] API key is required to run live benchmarks on provider "${llmClient.provider}".`);
    console.error(`        Pass --api-key <key> or set environment variable ${envVar}.\n`);
    process.exit(1);
  }

  const providerName = llmClient.provider;
  const modelName = llmClient.model;

  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`  ContextOS Multi-Model Paired Benchmark Suite`);
  console.log(`  Provider:    ${providerName.toUpperCase()}`);
  console.log(`  Model:       ${modelName}`);
  console.log(`  Tasks:       ${tasksToRun.length} high-signal engineering scenarios`);
  console.log(`  Execution:   Live API Calls`);
  console.log(`══════════════════════════════════════════════════════════════════\n`);

  const results = [];
  const taskErrors = [];

  for (let i = 0; i < tasksToRun.length; i++) {
    const task = tasksToRun[i];
    console.log(`\n[Task ${i + 1}/${tasksToRun.length}] ${task.title} (${task.category})`);

    let baseResult = null;
    let skillResult = null;
    let baselineEval = null;
    let skillEval = null;
    try {
      // ── Scenario 1: Baseline (Without Skills) ──────────────────────────────
      console.log(`  → [Scenario 1] Running Baseline (vanilla prompt)...`);
      const baselinePrompt = `Task: ${task.title}\n\n${task.prompt}\n\nProvide the complete, self-contained production-ready code implementation in TypeScript/JavaScript with all necessary types, interfaces, and function exports. Output the complete code directly.`;
      baseResult = await llmClient.generate({
        prompt: baselinePrompt,
        systemInstruction: 'You are an expert software engineer. Output the complete, self-contained, working production code directly in markdown code blocks (```typescript ... ```). Do not request repository access or conversational pauses; deliver the standalone code directly.',
      });
      const baselineResText = baseResult.text;
      console.log(`     Baseline completed in ${baseResult.latencyMs}ms`);

      await sleep(1500);

      // ── Scenario 2: ContextOS (With Authoritative Skills) ───────────────────
      console.log(`  → [Scenario 2] Running With ContextOS Skills (${task.skills.join(', ')})...`);
      const skillRules = task.skills.map(loadSkillContext).join('\n');
      const skillPrompt = `Task: ${task.title}\n\n${task.prompt}\n\n=== ContextOS Authoritative Skills & Architecture Guidelines ===\n${skillRules}\n\nStrictly implement the complete, self-contained production code adhering to the loaded ContextOS technical rules, invariants, and architecture guidelines above. Output the complete TypeScript/JavaScript code directly with all types and exports.`;
      skillResult = await llmClient.generate({
        prompt: skillPrompt,
        systemInstruction: '[PHASE: Build] [ROLE: Senior Developer] You are an elite principal engineer executing the approved plan. Apply all ContextOS technical rules and domain guidelines. Output the complete, self-contained production code directly in markdown code blocks (```typescript ... ```). Do not pause for spec/plan review or request repository access; deliver the complete code directly.',
      });
      const skillResText = skillResult.text;
      console.log(`     ContextOS completed in ${skillResult.latencyMs}ms`);

      // ── Evaluate Both Submissions ──────────────────────────────────────────
      console.log(`  → Evaluating submissions (Static Analysis + Judge)...`);
      baselineEval = await evaluateSubmission({
        llmClient,
        task,
        responseText: baselineResText,
        mode: 'without_skills',
      });

      skillEval = await evaluateSubmission({
        llmClient,
        task,
        responseText: skillResText,
        mode: 'with_skills',
      });

      const delta = skillEval.compositeScore - baselineEval.compositeScore;
      baselineEval.generationUsage = baseResult.usage;
      baselineEval.usage = sumUsage([baseResult.usage, baselineEval.judgeUsage]);
      skillEval.generationUsage = skillResult.usage;
      skillEval.usage = sumUsage([skillResult.usage, skillEval.judgeUsage]);
      console.log(`     Baseline Score:  ${baselineEval.compositeScore}/100 (Static: ${baselineEval.staticScore}%, Judge: ${baselineEval.judgeScore}/100)`);
      console.log(`     ContextOS Score: ${skillEval.compositeScore}/100 (Static: ${skillEval.staticScore}%, Judge: ${skillEval.judgeScore}/100)`);
      console.log(`     Net Delta:       ${delta >= 0 ? '+' : ''}${delta} pts`);

      results.push({
        taskId: task.id,
        title: task.title,
        category: task.category,
        skills: task.skills,
        baseline: baselineEval,
        withSkills: skillEval,
        delta,
      });
    } catch (taskErr) {
      console.error(`  [Task Error] ${task.id} failed: ${taskErr.message}`);
      taskErrors.push({
        taskId: task.id,
        title: task.title,
        error: String(taskErr.message || taskErr),
        baselineUsage: sumUsage([baseResult?.usage, baselineEval?.judgeUsage].filter(Boolean)),
        withSkillsUsage: sumUsage([skillResult?.usage, skillEval?.judgeUsage].filter(Boolean)),
      });
    }

    await sleep(1500);
  }

  if (results.length === 0) {
    console.error('\n[ERROR] No tasks completed successfully.');
    const failureReport = {
      timestamp: new Date().toISOString(),
      provider: providerName,
      model: modelName,
      summary: {
        tasksCount: 0,
        requestedTasks: tasksToRun.length,
        failedTasks: taskErrors.length,
        baselineUsage: sumUsage(taskErrors.map(error => error.baselineUsage)),
        skillUsage: sumUsage(taskErrors.map(error => error.withSkillsUsage)),
      },
      taskErrors,
      results: [],
    };
    fs.mkdirSync(options.output, { recursive: true });
    const failurePath = path.join(options.output, `report-failed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(failurePath, JSON.stringify(failureReport, null, 2));
    console.error(`Token usage/error telemetry saved to ${failurePath}`);
    process.exitCode = 1;
    return;
  }

  // ── Calculate Summaries ───────────────────────────────────────────────────
  const avgBaselineScore = results.reduce((s, r) => s + r.baseline.compositeScore, 0) / results.length;
  const avgSkillScore = results.reduce((s, r) => s + r.withSkills.compositeScore, 0) / results.length;
  const baselinePassRate = (results.reduce((s, r) => s + (r.baseline.isPassing ? 1 : 0), 0) / results.length) * 100;
  const skillPassRate = (results.reduce((s, r) => s + (r.withSkills.isPassing ? 1 : 0), 0) / results.length) * 100;
  const avgBaselineStatic = results.reduce((s, r) => s + r.baseline.staticScore, 0) / results.length;
  const avgSkillStatic = results.reduce((s, r) => s + r.withSkills.staticScore, 0) / results.length;
  const avgDelta = avgSkillScore - avgBaselineScore;

  const report = {
    timestamp: new Date().toISOString(),
    provider: providerName,
    model: modelName,
    summary: {
      tasksCount: results.length,
      requestedTasks: tasksToRun.length,
      failedTasks: taskErrors.length,
      baselineAvgScore: Number(avgBaselineScore.toFixed(1)),
      skillAvgScore: Number(avgSkillScore.toFixed(1)),
      scoreDelta: Number(avgDelta.toFixed(1)),
      baselinePassRate: Number(baselinePassRate.toFixed(1)),
      skillPassRate: Number(skillPassRate.toFixed(1)),
      passRateDelta: Number((skillPassRate - baselinePassRate).toFixed(1)),
      baselineStaticAvg: Number(avgBaselineStatic.toFixed(1)),
      skillStaticAvg: Number(avgSkillStatic.toFixed(1)),
      baselineUsage: sumUsage([
        ...results.map(result => result.baseline.usage),
        ...taskErrors.map(error => error.baselineUsage),
      ]),
      skillUsage: sumUsage([
        ...results.map(result => result.withSkills.usage),
        ...taskErrors.map(error => error.withSkillsUsage),
      ]),
    },
    taskErrors,
    results,
  };

  // ── Print & Save Reports ───────────────────────────────────────────────────
  printTerminalReport(report);

  fs.mkdirSync(options.output, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(options.output, `report-${stamp}.json`);
  const mdPath = path.join(options.output, `report-${stamp}.md`);
  const latestMdPath = path.join(options.output, `report-latest.md`);
  const htmlPath = path.join(options.output, `report-${stamp}.html`);
  const latestHtmlPath = path.join(options.output, `report-latest.html`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdContent = generateMarkdownReport(report);
  fs.writeFileSync(mdPath, mdContent);
  fs.writeFileSync(latestMdPath, mdContent);

  if (options.html) {
    const htmlContent = generateHtmlReport(report);
    fs.writeFileSync(htmlPath, htmlContent);
    fs.writeFileSync(latestHtmlPath, htmlContent);
    console.log(`  Interactive HTML Dashboard: ${latestHtmlPath}`);
  }

  console.log(`  Markdown Report:            ${latestMdPath}`);
  console.log(`  JSON Data Export:           ${jsonPath}\n`);

  if (options.open && options.html) {
    const openCmd = process.platform === 'win32' ? `start "" "${latestHtmlPath}"` :
      process.platform === 'darwin' ? `open "${latestHtmlPath}"` : `xdg-open "${latestHtmlPath}"`;
    exec(openCmd);
  }
}

if (require.main === module) {
  runBenchmark().catch(err => {
    console.error(`[FATAL ERROR] ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  runBenchmark,
  parseArgs,
};
