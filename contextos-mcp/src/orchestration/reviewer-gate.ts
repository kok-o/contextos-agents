/**
 * Independent Reviewer Gate (Dual Verdict) & Final Combined Review.
 *
 * Implements Superpowers-inspired single-reviewer dual-verdict gate:
 * - specCompliance: "PASS" | "FAIL"
 * - codeQuality: "PASS" | "FAIL"
 *
 * Enforces Reviewer != Implementer policy and prevents self-approval.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { getAgent, listAgents } from "../agents/provider.js";
import type { ReviewVerdict, ReviewVerdictValue, TaskBrief, VerificationVerdict } from "../core/types.js";
import { assertWithinRepository } from "../security/repository-boundary.js";
import { isWithinWriteScope } from "../worktree/manager.js";
import {
	buildCombinedStagingReviewPrompt,
	buildReviewerUserPrompt,
	getReviewerSystemPrompt,
} from "./reviewer-prompt.js";

const execFileAsync = promisify(execFile);

export interface ReviewerGateOptions {
	taskBrief: TaskBrief;
	diff: string;
	filesChanged: string[];
	verificationVerdict: VerificationVerdict;
	testOutput?: string;
	implementerAgent?: string;
	implementerModel?: string;
	reviewerAgent?: string;
	reviewerModel?: string;
	workDir?: string;
	repoRoot?: string;
}

export interface CombinedReviewOptions {
	repoRoot: string;
	baseSha: string;
	stagingBranch: string;
	taskSummaries?: string[];
	reviewerAgent?: string;
	reviewerModel?: string;
}

const LAZY_STUB_PATTERNS = [
	/\/\/\s*TODO:?\s*(implement|fill in|rest of code)/i,
	/\/\/\s*\.\.\.\s*rest of code/i,
	/\/\*\s*\.\.\.\s*rest of code\s*\*\//i,
	/\/\/\s*implement\s+later/i,
	/__PLACEHOLDER__/i,
];

function containsLazyStubs(diff: string): boolean {
	for (const pattern of LAZY_STUB_PATTERNS) {
		if (pattern.test(diff)) return true;
	}
	return false;
}

function parseVerdictJson(text: string): {
	specCompliance?: ReviewVerdictValue;
	codeQuality?: ReviewVerdictValue;
	summary?: string;
} | null {
	try {
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;
		const parsed = JSON.parse(jsonMatch[0]);
		const spec = parsed.specCompliance?.toUpperCase();
		const quality = parsed.codeQuality?.toUpperCase();
		if ((spec === "PASS" || spec === "FAIL") && (quality === "PASS" || quality === "FAIL")) {
			return {
				specCompliance: spec,
				codeQuality: quality,
				summary: typeof parsed.summary === "string" ? parsed.summary : "",
			};
		}
	} catch {
		// Ignore JSON parse errors
	}
	return null;
}

/**
 * Determine a distinct reviewer backend to enforce Reviewer != Implementer.
 */
export function resolveReviewerAgent(implementerAgent?: string, requestedReviewer?: string): string {
	if (requestedReviewer && requestedReviewer !== implementerAgent) {
		return requestedReviewer;
	}

	const available = listAgents();
	const candidates = available.filter((a) => a !== implementerAgent && a !== "mock");
	if (candidates.length > 0) {
		return candidates[0];
	}

	return "reviewer-independent";
}

/**
 * Evaluates an implementer's changes against the assigned TaskBrief.
 */
export async function evaluateReviewerGate(options: ReviewerGateOptions): Promise<ReviewVerdict> {
	const {
		taskBrief,
		diff,
		filesChanged,
		verificationVerdict,
		testOutput,
		implementerAgent,
		implementerModel,
		reviewerAgent: requestedReviewer,
		reviewerModel,
		workDir,
	} = options;

	const effectiveReviewer = resolveReviewerAgent(implementerAgent, requestedReviewer);
	const reviewerId = `reviewer-${effectiveReviewer}-${randomUUID().slice(0, 8)}`;

	// 1. Static Scope Check
	if (taskBrief.writeScope && taskBrief.writeScope.length > 0) {
		for (const file of filesChanged) {
			if (!isWithinWriteScope(file, taskBrief.writeScope)) {
				return {
					reviewerId,
					specCompliance: "FAIL",
					codeQuality: "FAIL",
					summary: `Review failed: touched file "${file}" violates declared writeScope [${taskBrief.writeScope.join(", ")}]`,
					reviewedAt: Date.now(),
				};
			}
		}
	}

	// 2. Automated Test Verification Check
	if (verificationVerdict === "FAIL") {
		return {
			reviewerId,
			specCompliance: "FAIL",
			codeQuality: "FAIL",
			summary: `Review failed: automated verification test command failed.\n${testOutput || ""}`.trim(),
			reviewedAt: Date.now(),
		};
	}

	// 3. Static Anti-Slop / Zero-Placeholder Inspection
	if (containsLazyStubs(diff)) {
		return {
			reviewerId,
			specCompliance: "FAIL",
			codeQuality: "FAIL",
			summary: "Review failed: diff contains lazy stub placeholders (e.g. // TODO, ... rest of code stays here)",
			reviewedAt: Date.now(),
		};
	}

	// 4. LLM-Based Evaluation (if requested reviewer is specified and non-mock)
	const shouldRunLlmReview = requestedReviewer !== undefined && requestedReviewer !== "mock";
	if (shouldRunLlmReview) {
		let agentProvider = null;
		try {
			agentProvider = getAgent(effectiveReviewer);
		} catch {
			return {
				reviewerId,
				specCompliance: "UNAVAILABLE",
				codeQuality: "UNAVAILABLE",
				summary: `Review failed: requested reviewer agent "${effectiveReviewer}" is not registered or available.`,
				reviewedAt: Date.now(),
			};
		}

		if (!workDir) {
			return {
				reviewerId,
				specCompliance: "ERROR",
				codeQuality: "ERROR",
				summary: "Review failed: workDir not provided for LLM evaluation.",
				reviewedAt: Date.now(),
			};
		}

		try {
			const systemPrompt = getReviewerSystemPrompt();
			const userPrompt = buildReviewerUserPrompt({
				taskBrief,
				diff,
				filesChanged,
				verificationVerdict,
				testOutput,
			});

			const reviewTask = `${systemPrompt}\n\n${userPrompt}`;
			const result = await agentProvider.run({
				task: reviewTask,
				workDir,
				model: reviewerModel || implementerModel || "default",
				signal: AbortSignal.timeout(30000),
			});

			if (!result.success) {
				return {
					reviewerId,
					specCompliance: "ERROR",
					codeQuality: "ERROR",
					summary: `Review failed: agent execution failed: ${result.error || "unknown error"}`,
					reviewedAt: Date.now(),
				};
			}

			const parsed = parseVerdictJson(result.output || "");
			if (parsed?.specCompliance && parsed?.codeQuality) {
				return {
					reviewerId,
					specCompliance: parsed.specCompliance,
					codeQuality: parsed.codeQuality,
					summary: parsed.summary || "Independent review completed successfully.",
					reviewedAt: Date.now(),
				};
			}

			return {
				reviewerId,
				specCompliance: "MALFORMED",
				codeQuality: "MALFORMED",
				summary: "Review failed: reviewer returned malformed or unparseable JSON verdict.",
				reviewedAt: Date.now(),
			};
		} catch (err: any) {
			const isTimeout = err?.name === "TimeoutError" || String(err).includes("timeout");
			return {
				reviewerId,
				specCompliance: isTimeout ? "TIMEOUT" : "ERROR",
				codeQuality: isTimeout ? "TIMEOUT" : "ERROR",
				summary: `Review failed with ${isTimeout ? "timeout" : "error"}: ${err?.message || String(err)}`,
				reviewedAt: Date.now(),
			};
		}
	}

	// Deterministic default when all static criteria pass and no LLM reviewer was requested
	return {
		reviewerId,
		specCompliance: "PASS",
		codeQuality: "PASS",
		summary: "Static and contract review passed: scope respected, zero placeholders, verification green.",
		reviewedAt: Date.now(),
	};
}

/**
 * Task 2.5f: Final holistic review of combined staging changes before merge to main.
 */
export async function reviewCombinedStaging(options: CombinedReviewOptions): Promise<ReviewVerdict> {
	const { repoRoot, baseSha, stagingBranch, taskSummaries = [], reviewerAgent, reviewerModel } = options;
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);
	const reviewerId = `combined-reviewer-${reviewerAgent || "audit"}-${randomUUID().slice(0, 8)}`;

	let combinedDiff = "";
	try {
		const { stdout } = await execFileAsync("git", ["diff", `${baseSha}...${stagingBranch}`], {
			cwd: canonicalRoot,
			maxBuffer: 10 * 1024 * 1024,
		});
		combinedDiff = stdout;
	} catch (err) {
		return {
			reviewerId,
			specCompliance: "FAIL",
			codeQuality: "FAIL",
			summary: `Failed to inspect staging diff: ${err instanceof Error ? err.message : String(err)}`,
			reviewedAt: Date.now(),
		};
	}

	if (containsLazyStubs(combinedDiff)) {
		return {
			reviewerId,
			specCompliance: "FAIL",
			codeQuality: "FAIL",
			summary: "Combined staging diff contains lazy placeholder stubs or uncommitted remnants.",
			reviewedAt: Date.now(),
		};
	}

	if (reviewerAgent && reviewerAgent !== "mock") {
		let agentProvider = null;
		try {
			agentProvider = getAgent(reviewerAgent);
		} catch {
			return {
				reviewerId,
				specCompliance: "UNAVAILABLE",
				codeQuality: "UNAVAILABLE",
				summary: `Combined staging review failed: reviewer agent "${reviewerAgent}" is not available.`,
				reviewedAt: Date.now(),
			};
		}

		try {
			const prompt = buildCombinedStagingReviewPrompt(baseSha, stagingBranch, combinedDiff, taskSummaries);
			const result = await agentProvider.run({
				task: prompt,
				workDir: canonicalRoot,
				model: reviewerModel || "default",
				signal: AbortSignal.timeout(30000),
			});
			if (!result.success) {
				return {
					reviewerId,
					specCompliance: "ERROR",
					codeQuality: "ERROR",
					summary: `Combined staging review failed: agent execution error: ${result.error || "unknown error"}`,
					reviewedAt: Date.now(),
				};
			}
			const parsed = parseVerdictJson(result.output || "");
			if (parsed?.specCompliance && parsed?.codeQuality) {
				return {
					reviewerId,
					specCompliance: parsed.specCompliance,
					codeQuality: parsed.codeQuality,
					summary: parsed.summary || "Combined staging review passed.",
					reviewedAt: Date.now(),
				};
			}
			return {
				reviewerId,
				specCompliance: "MALFORMED",
				codeQuality: "MALFORMED",
				summary: "Combined staging review failed: reviewer returned invalid JSON verdict.",
				reviewedAt: Date.now(),
			};
		} catch (err: any) {
			const isTimeout = err?.name === "TimeoutError" || String(err).includes("timeout");
			return {
				reviewerId,
				specCompliance: isTimeout ? "TIMEOUT" : "ERROR",
				codeQuality: isTimeout ? "TIMEOUT" : "ERROR",
				summary: `Combined staging review failed with ${isTimeout ? "timeout" : "error"}: ${err?.message || String(err)}`,
				reviewedAt: Date.now(),
			};
		}
	}

	return {
		reviewerId,
		specCompliance: "PASS",
		codeQuality: "PASS",
		summary: `Combined staging review passed for ${stagingBranch} against base ${baseSha}.`,
		reviewedAt: Date.now(),
	};
}
