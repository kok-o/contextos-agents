/**
 * Reviewer prompt generator for the independent subagent reviewer gate.
 *
 * Provides specialized evaluation prompts enforcing:
 * 1. specCompliance: did the agent fulfill the objective and stay within writeScope?
 * 2. codeQuality: are there syntax errors, placeholder comments, unhandled rejections, or leaks?
 */

import type { TaskBrief, VerificationVerdict } from "../core/types.js";

export interface ReviewPromptContext {
	taskBrief: TaskBrief;
	diff: string;
	filesChanged: string[];
	verificationVerdict: VerificationVerdict;
	testOutput?: string;
}

export function getReviewerSystemPrompt(): string {
	return `You are the ContextOS Independent Code Reviewer.
Your role is to strictly audit changes produced by an implementer agent against their assigned TaskBrief.

You MUST evaluate two discrete dimensions:
1. "specCompliance":
   - PASS: All changes strictly align with the objective. Only files declared in writeScope were touched. No undeclared files were modified or deleted. Acceptance criteria are met.
   - FAIL: Objective is not met, files outside writeScope were altered, or scope was violated.

2. "codeQuality":
   - PASS: The code is clean, robust, and production-ready. Zero placeholder stubs (e.g. "// TODO", "implement later", "..."), proper error handling, no syntax errors, no hardcoded secrets, and no regressions.
   - FAIL: Contains lazy stubs, placeholders, obvious runtime/type bugs, security vulnerabilities, or broken logic.

You MUST reply ONLY with a valid JSON object matching this schema:
{
  "specCompliance": "PASS" | "FAIL",
  "codeQuality": "PASS" | "FAIL",
  "summary": "Concise 1-3 sentence evaluation explaining verdicts and required fixes if any"
}`;
}

export function buildReviewerUserPrompt(ctx: ReviewPromptContext): string {
	const { taskBrief, diff, filesChanged, verificationVerdict, testOutput } = ctx;

	const scopeList = taskBrief.writeScope.length > 0 ? taskBrief.writeScope.join(", ") : "(any)";
	const filesList = filesChanged.length > 0 ? filesChanged.join(", ") : "(no files changed)";

	return `Task Brief:
- Task ID: ${taskBrief.taskId}
- Base SHA: ${taskBrief.baseSha}
- Objective: ${taskBrief.objective}
- Declared writeScope: ${scopeList}
- Test Command: ${taskBrief.testCommand || "(none)"}
- Expected Result: ${taskBrief.expectedResult || "(none)"}

Implementer Changes:
- Files Changed: ${filesList}
- Automated Verification: ${verificationVerdict}
${testOutput ? `- Verification Output:\n\`\`\`\n${testOutput.slice(0, 3000)}\n\`\`\`` : ""}

Git Diff:
\`\`\`diff
${diff.slice(0, 15000)}
\`\`\`

Evaluate the diff against the TaskBrief and output your JSON verdict.`;
}

export function buildCombinedStagingReviewPrompt(
	baseSha: string,
	stagingBranch: string,
	combinedDiff: string,
	taskSummaries: string[],
): string {
	return `Staging Branch Audit:
- Base SHA: ${baseSha}
- Staging Branch: ${stagingBranch}
- Tasks Merged:
${taskSummaries.map((s, idx) => `  ${idx + 1}. ${s}`).join("\n")}

Combined Diff:
\`\`\`diff
${combinedDiff.slice(0, 20000)}
\`\`\`

Perform a holistic integration review across all merged tasks. Check for cross-thread incompatibilities, global regressions, or conflicting changes.
Return your JSON verdict with "specCompliance", "codeQuality", and "summary".`;
}
