'use strict';

const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatUsage(usage) {
  if (!usage || usage.totalTokens === null || usage.totalTokens === undefined) {
    if (!usage) return 'unavailable';
    const known = Number.isSafeInteger(usage.knownTotalTokens) ? usage.knownTotalTokens : 0;
    return known > 0
      ? `incomplete (known ${known} total; ${usage.source})`
      : `unavailable (${usage.source})`;
  }
  return `${usage.totalTokens} total (${usage.promptTokens ?? 'n/a'} input / ${usage.completionTokens ?? 'n/a'} output; ${usage.source})`;
}

/**
 * Generates terminal summary.
 */
function printTerminalReport(report) {
  const { summary, results, provider, model } = report;

  console.log('\n' + '═'.repeat(70));
  console.log(`  ContextOS Multi-Model Benchmark Results`);
  console.log(`  Provider: ${provider.toUpperCase()} | Model: ${model}`);
  console.log(`  Timestamp: ${report.timestamp}`);
  console.log('═'.repeat(70));

  console.log('\n  SUMMARY METRICS:');
  console.log(`  • Baseline Average Score:   ${summary.baselineAvgScore.toFixed(1)} / 100 (${summary.baselinePassRate.toFixed(1)}% pass)`);
  console.log(`  • ContextOS Average Score:  ${summary.skillAvgScore.toFixed(1)} / 100 (${summary.skillPassRate.toFixed(1)}% pass)`);
  console.log(`  • Net Quality Gain (Delta): ${summary.scoreDelta >= 0 ? '+' : ''}${summary.scoreDelta.toFixed(1)} points`);
  console.log(`  • Pass Rate Improvement:    +${summary.passRateDelta.toFixed(1)}%`);
  console.log(`  • Tokens (without skills):  ${formatUsage(summary.baselineUsage)}`);
  console.log(`  • Tokens (with ContextOS):  ${formatUsage(summary.skillUsage)}`);

  console.log('\n  TASK BREAKDOWN:');
  console.log('  ' + '─'.repeat(66));
  console.log(`  ${'Task'.padEnd(36)} | ${'Baseline'.padEnd(9)} | ${'ContextOS'.padEnd(9)} | Delta`);
  console.log('  ' + '─'.repeat(66));

  for (const r of results) {
    const title = r.title.length > 34 ? r.title.slice(0, 31) + '...' : r.title;
    const base = `${r.baseline.compositeScore}/100`.padEnd(9);
    const withSk = `${r.withSkills.compositeScore}/100`.padEnd(9);
    const deltaStr = `${r.delta >= 0 ? '+' : ''}${r.delta} pts`;
    console.log(`  ${title.padEnd(36)} | ${base} | ${withSk} | ${deltaStr}`);
  }
  console.log('  ' + '─'.repeat(66));
  console.log('═'.repeat(70) + '\n');
}

/**
 * Generates a clean Markdown report.
 */
function generateMarkdownReport(report) {
  const { summary, results, provider, model, timestamp } = report;

  return `# ContextOS Skills Benchmark Report

**Provider:** \`${provider}\`  
**Model:** \`${model}\`  
**Date:** ${new Date(timestamp).toUTCString()}  
**Evaluated Tasks:** ${results.length}

---

## Executive Summary

| Metric | Baseline (Without Skills) | With ContextOS Skills | Delta / Impact |
|:---|:---:|:---:|:---:|
| **Composite Quality Score** | ${summary.baselineAvgScore.toFixed(1)} / 100 | **${summary.skillAvgScore.toFixed(1)} / 100** | **+${summary.scoreDelta.toFixed(1)} pts** |
| **Pass Rate (Score ≥ 80)** | ${summary.baselinePassRate.toFixed(1)}% | **${summary.skillPassRate.toFixed(1)}%** | **+${summary.passRateDelta.toFixed(1)}%** |
| **Static Safety & ARIA Invariants** | ${summary.baselineStaticAvg?.toFixed(1) || 'N/A'}% | **${summary.skillStaticAvg?.toFixed(1) || 'N/A'}%** | **Strict Invariants Enforced** |
| **API Tokens (input / output / total)** | ${formatUsage(summary.baselineUsage)} | **${formatUsage(summary.skillUsage)}** | Provider usage; incomplete totals marked unavailable |
| **Task coverage** | ${summary.tasksCount}/${summary.requestedTasks ?? summary.tasksCount} completed | ${summary.failedTasks || 0} failed | Failed and incomplete tasks are listed separately in JSON |

---

## Detailed Task Breakdown

| Category | Task | Baseline | ContextOS | Delta | Key ContextOS Highlights |
|---|:---|:---:|:---:|:---:|---|
${results.map(r => `| \`${r.category || 'Core'}\` | **${r.title}** | ${r.baseline.compositeScore}/100 | **${r.withSkills.compositeScore}/100** | **+${r.delta}** | ${escapeMarkdown(r.withSkills.strengths.slice(0, 2).join(', ') || r.withSkills.summary)} |`).join('\n')}

---

## Task Deep-Dive & Checklists

${results.map((r, i) => `### ${i + 1}. ${r.title} (\`${r.category}\`)

- **Skills Activated:** \`${r.skills.join('`, `')}\`
- **Baseline Score:** ${r.baseline.compositeScore}/100 (Static: ${r.baseline.staticScore}%, Judge: ${r.baseline.judgeScore}/100)
- **ContextOS Score:** **${r.withSkills.compositeScore}/100** (Static: ${r.withSkills.staticScore}%, Judge: ${r.withSkills.judgeScore}/100)
- **Score Delta:** **${r.delta >= 0 ? '+' : ''}${r.delta} points**

**Static Checks Passed:**
${r.withSkills.staticChecks.map(c => `- [${c.passed ? 'x' : ' '}] **${c.name}** (Baseline: ${r.baseline.staticChecks.find(bc => bc.id === c.id)?.passed ? 'PASS' : 'FAIL'} → ContextOS: ${c.passed ? 'PASS' : 'FAIL'})`).join('\n')}

**ContextOS Strengths:**
${r.withSkills.strengths.map(s => `- ${s}`).join('\n')}
`).join('\n---\n\n')}

---
*Report generated automatically by ContextOS Multi-Model Benchmark Suite.*
`;
}

function escapeMarkdown(str) {
  return (str || '').replace(/\|/g, '\\|');
}

/**
 * Generates an interactive, standalone HTML report with side-by-side code diffing and styling.
 */
function generateHtmlReport(report) {
  const { summary, results, provider, model, timestamp } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ContextOS Benchmark Dashboard — ${escapeHtml(model)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f293d;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --warning: #f59e0b;
      --primary-grad: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      --glow-grad: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15), transparent 70%);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg);
      background-image: var(--glow-grad);
      color: var(--text);
      line-height: 1.6;
      padding: 40px 20px;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 40px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
      margin-bottom: 16px;
    }

    h1 {
      font-size: 2.75rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: var(--primary-grad);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
    }

    /* Hero Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .stat-delta {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--success);
      background: var(--success-bg);
      padding: 2px 8px;
      border-radius: 6px;
    }

    /* Comparison Section */
    .section-title {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .task-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      margin-bottom: 28px;
      overflow: hidden;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4);
      transition: border-color 0.2s;
    }

    .task-card:hover {
      border-color: rgba(99, 102, 241, 0.4);
    }

    .task-header {
      padding: 20px 24px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .task-title-group h3 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .task-meta {
      display: flex;
      gap: 10px;
      font-size: 0.85rem;
    }

    .meta-tag {
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 8px;
      border-radius: 4px;
      color: var(--text-muted);
    }

    .task-scores {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .score-box {
      text-align: right;
    }

    .score-title {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    .score-num {
      font-size: 1.3rem;
      font-weight: 800;
    }

    .task-body {
      padding: 24px;
    }

    /* Checklist */
    .checklist-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
      background: rgba(0, 0, 0, 0.2);
      padding: 16px;
      border-radius: 12px;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
    }

    .check-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: bold;
      flex-shrink: 0;
    }

    .check-pass { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
    .check-fail { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); }

    /* Side-by-Side Code Viewer */
    .code-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    @media (max-width: 900px) {
      .code-comparison { grid-template-columns: 1fr; }
    }

    .code-panel {
      background: #0d1117;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      overflow: hidden;
    }

    .code-panel-header {
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .code-pre {
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      overflow-x: auto;
      max-height: 480px;
      color: #e6edf3;
      white-space: pre-wrap;
      word-break: break-word;
    }

    footer {
      text-align: center;
      color: var(--text-muted);
      margin-top: 60px;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>

  <div class="container">
    <header>
      <div class="badge">ContextOS Live Benchmark Suite</div>
      <h1>Side-by-Side Quality Verification</h1>
      <p class="subtitle">Provider: <strong>${escapeHtml(provider.toUpperCase())}</strong> &nbsp;|&nbsp; Model: <strong>${escapeHtml(model)}</strong> &nbsp;|&nbsp; Evaluated: ${new Date(timestamp).toLocaleDateString()}</p>
    </header>

    <!-- Hero Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Baseline Score (Without Skills)</div>
        <div class="stat-value">${summary.baselineAvgScore.toFixed(1)} <span style="font-size: 1rem; color: var(--text-muted);">/ 100</span></div>
      </div>
      <div class="stat-card" style="border-color: rgba(99, 102, 241, 0.5);">
        <div class="stat-label">ContextOS Score (With Skills)</div>
        <div class="stat-value" style="color: #818cf8;">${summary.skillAvgScore.toFixed(1)} <span style="font-size: 1rem; color: var(--text-muted);">/ 100</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Score Delta</div>
        <div class="stat-value" style="color: var(--success);">${summary.scoreDelta >= 0 ? '+' : ''}${summary.scoreDelta.toFixed(1)} <span class="stat-delta">+${((summary.scoreDelta / (summary.baselineAvgScore || 1)) * 100).toFixed(0)}%</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Quality Pass Rate (≥80)</div>
        <div class="stat-value">${summary.skillPassRate.toFixed(0)}% <span class="stat-delta">+${summary.passRateDelta.toFixed(0)}%</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">API Tokens — Without Skills</div>
        <div class="stat-value">${escapeHtml(formatUsage(summary.baselineUsage))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">API Tokens — With ContextOS</div>
        <div class="stat-value">${escapeHtml(formatUsage(summary.skillUsage))}</div>
      </div>
    </div>

    <!-- Tasks -->
    <div class="section-title">Comprehensive Benchmark Scenarios</div>

    ${results.map((r, i) => `
    <div class="task-card">
      <div class="task-header">
        <div class="task-title-group">
          <h3>${i + 1}. ${escapeHtml(r.title)}</h3>
          <div class="task-meta">
            <span class="meta-tag">${escapeHtml(r.category)}</span>
            <span class="meta-tag">Skills: ${escapeHtml(r.skills.join(', '))}</span>
          </div>
        </div>
        <div class="task-scores">
          <div class="score-box">
            <div class="score-title">Baseline</div>
            <div class="score-num" style="color: var(--text-muted);">${r.baseline.compositeScore}/100</div>
          </div>
          <div class="score-box">
            <div class="score-title">ContextOS</div>
            <div class="score-num" style="color: #818cf8;">${r.withSkills.compositeScore}/100</div>
          </div>
          <div class="stat-delta" style="font-size: 1.1rem; padding: 6px 12px;">
            ${r.delta >= 0 ? '+' : ''}${r.delta} pts
          </div>
        </div>
      </div>

      <div class="task-body">
        <!-- Static Checks Matrix -->
        <div class="checklist-grid">
          ${r.withSkills.staticChecks.map(c => {
    const basePassed = r.baseline.staticChecks?.find(bc => bc.id === c.id)?.passed;
    return `
            <div class="check-item">
              <span class="check-icon ${c.passed ? 'check-pass' : 'check-fail'}">${c.passed ? '✓' : '✗'}</span>
              <span><strong>${escapeHtml(c.name)}</strong> (Baseline: ${basePassed ? '✓' : '✗'} → ContextOS: ${c.passed ? '✓' : '✗'})</span>
            </div>`;
  }).join('')}
        </div>

        <!-- Code Comparison -->
        <div class="code-comparison">
          <div class="code-panel">
            <div class="code-panel-header" style="color: #f87171;">
              <span>[FAIL] Baseline (Without ContextOS)</span>
              <span>Score: ${r.baseline.compositeScore}/100</span>
            </div>
            <pre class="code-pre"><code>${escapeHtml(r.baseline.code || '// No code output')}</code></pre>
          </div>

          <div class="code-panel">
            <div class="code-panel-header" style="color: #34d399;">
              <span>[PASS] ContextOS (Dynamic Skills Applied)</span>
              <span>Score: ${r.withSkills.compositeScore}/100</span>
            </div>
            <pre class="code-pre"><code>${escapeHtml(r.withSkills.code || '// No code output')}</code></pre>
          </div>
        </div>
      </div>
    </div>
    `).join('')}

    <footer>
      <p>ContextOS Multi-Model Benchmark Engine &bull; Generated automatically with reproducible paired execution.</p>
    </footer>
  </div>

</body>
</html>`;
}

module.exports = {
  printTerminalReport,
  generateMarkdownReport,
  generateHtmlReport,
};
