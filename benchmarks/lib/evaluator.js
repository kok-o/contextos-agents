'use strict';

/**
 * Extracts clean code snippets from model output markdown.
 */
function extractCodeBlocks(text) {
  if (!text || typeof text !== 'string') return '';
  const blocks = [];
  const fenceRegex = /```(?:([a-zA-Z0-9_#-]+))?\r?\n([\s\S]*?)(?:```|$)/g;
  let match;
  while ((match = fenceRegex.exec(text)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    const code = match[2].trim();
    if (!code) continue;

    // Filter by language: skip bash, sh, text, txt, lua, json, yaml, sql, etc.
    if (lang && !['typescript', 'ts', 'javascript', 'js', 'node'].includes(lang)) {
      continue;
    }

    // If untagged fence, only include if it starts with valid JS/TS syntax
    if (!lang && !/^\s*(?:import|export|const|let|var|function|class|interface|type)\b/m.test(code)) {
      continue;
    }

    blocks.push(code);
  }
  if (blocks.length === 1) {
    return blocks[0];
  }
  if (blocks.length > 1) {
    // If multiple blocks exist (e.g. model drafted scratchpad snippets), pick the primary implementation
    const candidateBlocks = blocks.filter(b => /class\s+(?:AuthService|Order|ResilientHttpClient|CircuitBreaker|Money)\b/.test(b));
    const primaryBlock = candidateBlocks.length > 0
      ? candidateBlocks.sort((a, b) => b.length - a.length)[0]
      : blocks.slice().sort((a, b) => b.length - a.length)[0];

    if (primaryBlock) {
      // Prepend companion blocks that define valid interfaces, types, or imports
      const companionBlocks = blocks.filter(b => b !== primaryBlock && /^\s*(?:import\b|export\s+(?:interface|type)|(?:interface|type)\s+[\w$]+)/m.test(b) && !b.includes('? //') && b.length > 30);
      if (companionBlocks.length > 0) {
        return companionBlocks.join('\n\n') + '\n\n' + primaryBlock;
      }
      return primaryBlock;
    }

    // Filter out blocks that don't contain any JS declaration keywords
    const codeBlocks = blocks.filter(b => /^\s*(?:import|export|const|let|var|function|class|interface|type)\b/m.test(b));
    if (codeBlocks.length === 1) return codeBlocks[0];
    if (codeBlocks.length > 1) return codeBlocks.join('\n\n');
    return blocks.join('\n\n');
  }
  // Only fall back to raw text if it actually looks like code
  const declMatch = text.match(/^\s*(?:import|export|const|let|var|function|class|interface|type)\b/m);
  if (declMatch) {
    return text.slice(declMatch.index).trim();
  }
  return '';
}

/**
 * Run deterministic static analysis checks against the code.
 */
function runStaticChecks(task, code) {
  if (!task.staticChecks || task.staticChecks.length === 0) {
    return { score: 100, checks: [] };
  }

  const results = [];
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of task.staticChecks) {
    totalWeight += check.weight || 20;
    let passed = false;
    try {
      passed = Boolean(check.test(code));
    } catch {
      passed = false;
    }
    if (passed) {
      earnedWeight += check.weight || 20;
    }
    results.push({
      id: check.id,
      name: check.name,
      weight: check.weight || 20,
      passed,
    });
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 100;
  return { score, checks: results };
}

/**
 * Calculate code brevity, token efficiency, and line metrics.
 */
function calculateMetrics(text, code) {
  const lines = code.split('\n').length;
  const chars = code.length;
  const approxTokens = Math.round(text.length / 4);
  return { lines, chars, approxTokens };
}

/**
 * Runs the LLM Judge against the submission.
 */
/**
 * Robustly parses judge JSON output with fallbacks and regex matchers.
 */
function parseJudgeJson(text) {
  if (!text) return null;
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(clean.slice(first, last + 1));
      return {
        score: Number(parsed.score),
        passedCount: Number(parsed.passedCount),
        summary: String(parsed.summary || ''),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      };
    } catch {}
  }

  // Regex fallback parser for reasoning models that embed markdown within JSON
  const scoreMatch = /"score"\s*:\s*(\d+)/i.exec(text);
  const passedMatch = /"passedCount"\s*:\s*(\d+)/i.exec(text);
  const summaryMatch = /"summary"\s*:\s*"([^"]+)"/i.exec(text);

  if (scoreMatch) {
    return {
      score: Number(scoreMatch[1]),
      passedCount: passedMatch ? Number(passedMatch[1]) : 0,
      summary: summaryMatch ? summaryMatch[1] : 'Evaluation extracted via regex.',
      strengths: [],
      weaknesses: [],
    };
  }

  return null;
}

/**
 * Runs the LLM Judge against the submission.
 */
async function judgeWithLLM(llmClient, task, code, mode, staticScore = 50) {
  const judgePrompt = `Evaluate this code submission for the engineering benchmark task:
Task: "${task.title}"
Category: ${task.category || 'General'}

Evaluation Criteria:
${task.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Code Submission (${mode}):
\`\`\`
${code.slice(0, 8000)}
\`\`\`

Evaluate issue fidelity, correctness, security, architectural boundaries, edge cases, and compliance with the criteria.
Respond ONLY with a valid JSON object without surrounding commentary:
{
  "score": <number 0-100>,
  "passedCount": <number of satisfied criteria from 0 to ${task.criteria.length}>,
  "summary": "<1-2 sentence concise evaluation summary>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"]
}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await llmClient.generate({
        prompt: judgePrompt,
        systemInstruction: 'You are an impartial Principal Software Architect and strict Code Review Judge. Output strictly valid JSON with score, passedCount, summary, strengths, weaknesses.',
        temperature: 0.0,
        maxTokens: 1200,
      });

      const parsed = parseJudgeJson(res.text);
      if (parsed && !isNaN(parsed.score)) {
        return {
          score: Math.min(100, Math.max(0, parsed.score)),
          passedCount: Math.min(task.criteria.length, Math.max(0, parsed.passedCount || 0)),
          summary: parsed.summary || 'Evaluation completed.',
          strengths: parsed.strengths.length > 0 ? parsed.strengths : ['Code evaluated'],
          weaknesses: parsed.weaknesses,
          judgeLatencyMs: res.latencyMs,
        };
      }
    } catch (err) {
      if (attempt === 2) {
        console.warn(`    [Judge Warning] ${err.message}`);
      }
    }
  }

  // Fair fallback proportional to static score
  const fallbackScore = Math.max(20, Math.min(85, staticScore));
  return {
    score: fallbackScore,
    passedCount: Math.round((fallbackScore / 100) * task.criteria.length),
    summary: 'Automated evaluation aligned with verified invariants.',
    strengths: ['Deterministic code invariants verified'],
    weaknesses: ['Qualitative review parsing fallback used'],
    judgeLatencyMs: 0,
  };
}

/**
 * Complete evaluation of a task run combining Static Checks + LLM Judge.
 */
async function evaluateSubmission({ llmClient, task, responseText, mode }) {
  const code = extractCodeBlocks(responseText);
  const metrics = calculateMetrics(responseText, code);
  const staticResult = runStaticChecks(task, code);

  let judgeResult = {
    score: staticResult.score,
    passedCount: Math.round((staticResult.score / 100) * task.criteria.length),
    summary: 'Evaluation based on verified code invariants.',
    strengths: staticResult.checks.filter(c => c.passed).map(c => c.name),
    weaknesses: staticResult.checks.filter(c => !c.passed).map(c => c.name),
    judgeLatencyMs: 0,
  };

  if (llmClient) {
    judgeResult = await judgeWithLLM(llmClient, task, code, mode, staticResult.score);
  }

  // Composite score: 60% Deterministic Static Invariants + 40% Qualitative LLM Judge
  const compositeScore = Math.round((judgeResult.score * 0.4) + (staticResult.score * 0.6));

  return {
    mode,
    code,
    metrics,
    staticScore: staticResult.score,
    staticChecks: staticResult.checks,
    judgeScore: judgeResult.score,
    passedCriteriaCount: judgeResult.passedCount,
    totalCriteriaCount: task.criteria.length,
    summary: judgeResult.summary,
    strengths: judgeResult.strengths,
    weaknesses: judgeResult.weaknesses,
    compositeScore,
    isPassing: compositeScore >= 80,
  };
}

module.exports = {
  extractCodeBlocks,
  runStaticChecks,
  calculateMetrics,
  judgeWithLLM,
  evaluateSubmission,
};
