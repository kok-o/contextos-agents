/**
 * Shared type definitions for swarm-code.
 */

// ── Agent types ─────────────────────────────────────────────────────────────

/** Token usage reported by the agent (when available). */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface AgentResult {
	success: boolean;
	output: string;
	filesChanged: string[];
	diff: string;
	durationMs: number;
	error?: string;
	/** Actual token usage from the agent (if reported). */
	usage?: TokenUsage;
}

export interface AgentRunOptions {
	task: string;
	workDir: string;
	model?: string;
	files?: string[];
	signal?: AbortSignal;
	onOutput?: (chunk: string) => void;
}

export interface AgentProvider {
	readonly name: string;
	readonly isAvailable: () => Promise<boolean>;
	run(options: AgentRunOptions): Promise<AgentResult>;
}

// ── Thread types ────────────────────────────────────────────────────────────

export type ThreadStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type ThreadProgressPhase =
	| "queued"
	| "creating_worktree"
	| "agent_running"
	| "capturing_diff"
	| "compressing"
	| "completed"
	| "failed"
	| "cancelled"
	| "retrying";

export interface ThreadConfig {
	id: string;
	task: string;
	context: string;
	agent: {
		backend: string;
		model: string;
	};
	files?: string[];
}

export interface ThreadState {
	id: string;
	config: ThreadConfig;
	status: ThreadStatus;
	phase: ThreadProgressPhase;
	worktreePath?: string;
	branchName?: string;
	result?: CompressedResult;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	attempt: number;
	maxAttempts: number;
	estimatedCostUsd: number;
}

export interface CompressedResult {
	success: boolean;
	summary: string;
	filesChanged: string[];
	diffStats: string;
	durationMs: number;
	estimatedCostUsd: number;
	/** Actual token usage (when available from agent). */
	usage?: TokenUsage;
	/** Whether cost is based on real usage or estimates. */
	costIsEstimate?: boolean;
}

// ── Worktree types ──────────────────────────────────────────────────────────

export interface WorktreeInfo {
	id: string;
	path: string;
	branch: string;
}

export interface MergeResult {
	success: boolean;
	branch: string;
	conflicts: string[];
	conflictDiff: string;
	message: string;
}

// ── Budget types ────────────────────────────────────────────────────────────

export interface BudgetState {
	totalSpentUsd: number;
	threadCosts: Map<string, number>;
	sessionLimitUsd: number;
	perThreadLimitUsd: number;
	/** Total tokens consumed across all threads. */
	totalTokens: { input: number; output: number };
	/** Number of threads with actual (non-estimated) cost data. */
	actualCostThreads: number;
	/** Number of threads with estimated cost data. */
	estimatedCostThreads: number;
}

/** Rough per-1M-token pricing for cost estimation. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Anthropic
	"claude-sonnet-4-6": { input: 3, output: 15 },
	"claude-opus-4-6": { input: 15, output: 75 },
	"claude-haiku-4-5": { input: 0.8, output: 4 },
	// OpenAI
	"gpt-4o": { input: 2.5, output: 10 },
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
	o3: { input: 10, output: 40 },
	"o3-mini": { input: 1.1, output: 4.4 },
	// Google
	"gemini-2.5-pro": { input: 1.25, output: 10 },
	"gemini-2.5-flash": { input: 0.15, output: 0.6 },
};

// ── Config types (canonical definition in ../config.ts) ─────────────────────

// Re-export from config.ts to avoid circular imports — consumers can import
// SwarmConfig from either location.
export type { ModelSlots, SwarmConfig } from "../config.js";

// ── Protocol messages (Python <-> TS) ───────────────────────────────────────

export interface ThreadRequestMessage {
	type: "thread_request";
	id: string;
	task: string;
	context: string;
	agent_backend: string;
	model: string;
	files: string[];
}

export interface ThreadResultMessage {
	type: "thread_result";
	id: string;
	result: string;
	success: boolean;
	files_changed: string[];
	duration_ms: number;
}

export interface MergeRequestMessage {
	type: "merge_request";
	id: string;
}

export interface MergeResultMessage {
	type: "merge_result";
	id: string;
	result: string;
	success: boolean;
}
