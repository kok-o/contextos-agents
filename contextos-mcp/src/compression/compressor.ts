/**
 * Context compression — compresses thread output before returning to the orchestrator.
 *
 * Strategies:
 *   - structured (default): status + files + diff stats + key hunks + tail output
 *   - diff-only: just the git diff
 *   - truncate: raw truncation
 *   - llm-summary: use a cheap LLM to summarize thread work
 *
 * Episode quality: All strategies apply filterToSuccessfulOutput() first,
 * stripping failed attempts, retries, and error noise so the orchestrator
 * only sees what contributed to the final result (Slate-style episodes).
 */

import type { SwarmConfig } from "../core/types.js";

export interface CompressionInput {
	agentOutput: string;
	diff: string;
	diffStats: string;
	filesChanged: string[];
	success: boolean;
	durationMs: number;
	error?: string;
}

/** Optional LLM summarizer for llm-summary strategy. */
export type LlmSummarizer = (text: string, instruction: string) => Promise<string>;

// Module-level summarizer — set once by the swarm orchestrator
let _summarizer: LlmSummarizer | undefined;

/** Register an LLM summarizer for the llm-summary compression strategy. */
export function setSummarizer(fn: LlmSummarizer): void {
	_summarizer = fn;
}

// ── Episode quality filter ────────────────────────────────────────────────

/**
 * Patterns that indicate failed attempts, retries, or noise in agent output.
 * These lines are stripped so the orchestrator only sees successful conclusions.
 */
const FAILURE_NOISE_PATTERNS = [
	// Error/retry indicators (anchored to avoid matching "Error handling added")
	/^error: /i,
	/^Error: /,
	/^failed to /i,
	/^retrying/i,
	/^retry attempt/i,
	/^warning: /i,
	/^timed? ?out/i,
	// Common agent noise: stack traces
	/^\s+at\s+\S+\s+\(/,
	/^Traceback \(most recent/,
	/^\s+File ".*", line \d+/,
	// Agent internal chatter
	/^Thinking\.\.\./i,
	/^Searching\.\.\./i,
	/^Reading\.\.\./i,
	/^Running command\.\.\./i,
	// Reverted / undone actions (anchored to start of line)
	/^reverted /i,
	/^undoing /i,
	/^rolling back/i,
];

/** Patterns that indicate successful, conclusive output worth keeping. */
const SUCCESS_SIGNAL_PATTERNS = [
	/^Applied edit to/i,
	/^Wrote /,
	/^Created /i,
	/^Updated /i,
	/^Added /i,
	/^Removed /i,
	/^Fixed /i,
	/^Committing /,
	/tests? pass/i,
	/✓|✔|PASS/,
	/^DONE/i,
	/^SUCCESS/i,
	/^Result:/i,
	/^Summary:/i,
	/^Completed/i,
];

/**
 * Filter agent output to only include lines that contributed to the final result.
 * Strips failed attempts, retries, stack traces, and noise.
 * Keeps: success signals, file-change confirmations, final conclusions, and
 * any line that doesn't match a known noise pattern.
 *
 * Strategy: remove known-bad lines rather than keep only known-good,
 * so novel agent output is preserved by default.
 */
function filterToSuccessfulOutput(agentOutput: string): string {
	if (!agentOutput) return agentOutput;

	const lines = agentOutput.split("\n");
	const filtered: string[] = [];
	let inStackTrace = false;

	for (const line of lines) {
		const trimmed = line.trimStart();

		// Detect start of stack trace blocks (test untrimmed `line` for JS stack traces with leading whitespace)
		if (/^Traceback \(most recent/.test(trimmed) || /^\s+at\s+\S+\s+\(/.test(line)) {
			inStackTrace = true;
			continue;
		}

		// End stack trace on blank line or non-indented line
		if (inStackTrace) {
			if (trimmed === "" || (!trimmed.startsWith(" ") && !trimmed.startsWith("\t"))) {
				inStackTrace = false;
				// Still check if this line itself is noise
			} else {
				continue; // Skip stack trace continuation
			}
		}

		// Always keep lines with success signals
		if (SUCCESS_SIGNAL_PATTERNS.some((p) => p.test(trimmed))) {
			filtered.push(line);
			continue;
		}

		// Skip lines matching failure/noise patterns
		if (FAILURE_NOISE_PATTERNS.some((p) => p.test(trimmed))) {
			continue;
		}

		// Keep everything else (default: preserve novel output)
		filtered.push(line);
	}

	// Collapse runs of blank lines to max 2
	const collapsed: string[] = [];
	let blankRun = 0;
	for (const line of filtered) {
		if (line.trim() === "") {
			blankRun++;
			if (blankRun <= 2) collapsed.push(line);
		} else {
			blankRun = 0;
			collapsed.push(line);
		}
	}

	return collapsed.join("\n").trim();
}

export async function compressResult(
	input: CompressionInput,
	strategy: SwarmConfig["compression_strategy"] = "structured",
	maxChars: number = 1000,
): Promise<string> {
	// Episode quality: filter agent output to successful conclusions only
	const filtered: CompressionInput = {
		...input,
		agentOutput: filterToSuccessfulOutput(input.agentOutput),
	};

	switch (strategy) {
		case "structured":
			return compressStructured(filtered, maxChars);
		case "diff-only":
			return compressDiffOnly(filtered, maxChars);
		case "truncate":
			return compressTruncate(filtered, maxChars);
		case "llm-summary":
			return compressLlmSummary(filtered, maxChars);
		default:
			return compressStructured(filtered, maxChars);
	}
}

function compressStructured(input: CompressionInput, maxChars: number): string {
	const parts: string[] = [];

	// Status line
	parts.push(`Status: ${input.success ? "SUCCESS" : "FAILED"} (${(input.durationMs / 1000).toFixed(1)}s)`);

	if (input.error) {
		parts.push(`Error: ${input.error}`);
	}

	// Files changed
	if (input.filesChanged.length > 0) {
		parts.push(`Files changed (${input.filesChanged.length}):`);
		for (const f of input.filesChanged.slice(0, 20)) {
			parts.push(`  - ${f}`);
		}
		if (input.filesChanged.length > 20) {
			parts.push(`  ... and ${input.filesChanged.length - 20} more`);
		}
	}

	// Diff stats
	if (input.diffStats && input.diffStats !== "(no changes)") {
		parts.push(`\nDiff stats:\n${input.diffStats}`);
	}

	// Key diff hunks (first portion)
	if (input.diff && input.diff !== "(no changes)") {
		const diffBudget = Math.floor(maxChars * 0.4);
		const truncatedDiff =
			input.diff.length > diffBudget ? `${input.diff.slice(0, diffBudget)}\n... [diff truncated]` : input.diff;
		parts.push(`\nKey changes:\n${truncatedDiff}`);
	}

	// Agent output tail
	if (input.agentOutput) {
		const outputBudget = Math.floor(maxChars * 0.3);
		const lines = input.agentOutput.split("\n");
		const tail = lines.slice(-30).join("\n");
		const truncatedOutput = tail.length > outputBudget ? tail.slice(-outputBudget) : tail;
		parts.push(`\nAgent output (last 30 lines):\n${truncatedOutput}`);
	}

	const result = parts.join("\n");

	// Final truncation safety (4x maxChars is the hard cap for combined sections)
	if (result.length > maxChars * 4) {
		return `${result.slice(0, maxChars * 4)}\n... [compressed output truncated]`;
	}

	return result;
}

function compressDiffOnly(input: CompressionInput, maxChars: number): string {
	const status = `Status: ${input.success ? "SUCCESS" : "FAILED"} (${(input.durationMs / 1000).toFixed(1)}s)`;

	if (!input.diff || input.diff === "(no changes)") {
		return `${status}\n(no changes)`;
	}

	if (input.diff.length > maxChars * 4) {
		return `${status}\n${input.diff.slice(0, maxChars * 4)}\n... [diff truncated]`;
	}

	return `${status}\n${input.diff}`;
}

function compressTruncate(input: CompressionInput, maxChars: number): string {
	const raw = [`Status: ${input.success ? "SUCCESS" : "FAILED"}`, input.agentOutput, input.diff]
		.filter(Boolean)
		.join("\n\n");

	if (raw.length > maxChars * 4) {
		// Preserve status line at the head, truncate from the middle
		const statusEnd = raw.indexOf("\n");
		const statusLine = statusEnd !== -1 ? raw.slice(0, statusEnd) : "";
		const remaining = maxChars * 4 - statusLine.length - 20;
		return `${statusLine}\n... [truncated]\n${raw.slice(-remaining)}`;
	}
	return raw;
}

/**
 * LLM-based compression — uses a cheap model to summarize the thread's work.
 * Falls back to structured compression if no summarizer is registered.
 */
async function compressLlmSummary(input: CompressionInput, maxChars: number): Promise<string> {
	if (!_summarizer) {
		// Fall back to structured if no summarizer available
		return compressStructured(input, maxChars);
	}

	// Build the text to summarize
	const parts: string[] = [];
	parts.push(`Task outcome: ${input.success ? "SUCCESS" : "FAILED"} (${(input.durationMs / 1000).toFixed(1)}s)`);

	if (input.error) {
		parts.push(`Error: ${input.error}`);
	}

	if (input.filesChanged.length > 0) {
		parts.push(`Files changed: ${input.filesChanged.join(", ")}`);
	}

	if (input.diffStats && input.diffStats !== "(no changes)") {
		parts.push(`Diff stats:\n${input.diffStats}`);
	}

	// Include truncated diff for context
	if (input.diff && input.diff !== "(no changes)") {
		const diffSlice = input.diff.slice(0, maxChars * 2);
		parts.push(`Diff:\n${diffSlice}`);
	}

	// Include truncated agent output
	if (input.agentOutput) {
		const outputSlice = input.agentOutput.slice(-maxChars);
		parts.push(`Agent output (tail):\n${outputSlice}`);
	}

	const textToSummarize = parts.join("\n\n");

	const instruction = [
		"Summarize this coding agent thread result concisely.",
		"Include: what was done, which files were changed, whether it succeeded, and any key details.",
		`Keep the summary under ${maxChars} characters.`,
		"Be specific about code changes — mention function names, patterns, and key decisions.",
	].join(" ");

	try {
		const summary = await _summarizer(textToSummarize, instruction);

		// Prepend status line
		const status = `Status: ${input.success ? "SUCCESS" : "FAILED"} (${(input.durationMs / 1000).toFixed(1)}s)`;
		const filesLine = input.filesChanged.length > 0 ? `\nFiles: ${input.filesChanged.join(", ")}` : "";
		const result = `${status}${filesLine}\n\n${summary}`;

		// Safety cap
		if (result.length > maxChars * 2) {
			return `${result.slice(0, maxChars * 2)}\n... [summary truncated]`;
		}
		return result;
	} catch {
		// Fall back to structured on LLM failure
		return compressStructured(input, maxChars);
	}
}
