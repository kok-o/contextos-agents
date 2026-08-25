/**
 * Thread manager — spawns and manages coding agent threads in isolated worktrees.
 *
 * Features:
 *   - AsyncSemaphore for proper concurrency gating (no polling)
 *   - AbortSignal propagation for thread cancellation
 *   - Per-thread retry logic with exponential backoff
 *   - Error classification: retryable (transient) vs fatal (permanent)
 *   - Agent/model re-routing on failure (fallback to alternative combos)
 *   - Budget tracking and enforcement
 *   - Per-thread error isolation
 */

import { randomBytes } from "node:crypto";
import { getAgent, listAgents } from "../agents/provider.js";
import { compressResult } from "../compression/compressor.js";
import type {
	BudgetState,
	CompressedResult,
	SwarmConfig,
	ThreadConfig,
	ThreadProgressPhase,
	ThreadState,
} from "../core/types.js";
import { MODEL_PRICING as PRICING } from "../core/types.js";
import type { EpisodicMemory } from "../memory/episodic.js";
import { AGENT_CAPABILITIES } from "../routing/model-router.js";
import { WorktreeManager } from "../worktree/manager.js";
import { ThreadCache, type ThreadCacheStats } from "./cache.js";

// ── Async Semaphore ─────────────────────────────────────────────────────────

/**
 * Promise-based semaphore for concurrency control.
 * acquire() resolves when a slot is available, release() frees a slot.
 */
export class AsyncSemaphore {
	private current: number = 0;
	private readonly max: number;
	private waiters: Array<() => void> = [];

	constructor(max: number) {
		this.max = max;
	}

	async acquire(): Promise<void> {
		if (this.current < this.max) {
			this.current++;
			return;
		}
		await new Promise<void>((resolve) => {
			this.waiters.push(resolve);
		});
		// current already accounts for this slot — release() transferred it directly
	}

	release(): void {
		const next = this.waiters.shift();
		if (next) {
			// Transfer the slot directly to the waiter (current stays the same)
			next();
		} else {
			if (this.current <= 0) return; // Guard against double-release
			this.current--;
		}
	}

	get activeCount(): number {
		return this.current;
	}

	get waitingCount(): number {
		return this.waiters.length;
	}
}

// ── Budget Tracker ──────────────────────────────────────────────────────────

class BudgetTracker {
	private totalSpent: number = 0;
	private threadCosts: Map<string, number> = new Map();
	private sessionLimit: number;
	private perThreadLimit: number;
	private totalInputTokens: number = 0;
	private totalOutputTokens: number = 0;
	private actualCostCount: number = 0;
	private estimatedCostCount: number = 0;

	constructor(sessionLimit: number, perThreadLimit: number) {
		this.sessionLimit = sessionLimit;
		this.perThreadLimit = perThreadLimit;
	}

	/** Estimate cost for a thread based on model and assumed token usage. */
	estimateThreadCost(model: string): number {
		const modelName = model.includes("/") ? model.split("/").pop()! : model;
		const pricing = PRICING[modelName];
		if (!pricing) return 0.05;

		// Assume ~4K input tokens, ~2K output tokens per thread execution
		const inputTokens = 4000;
		const outputTokens = 2000;
		return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
	}

	/**
	 * Calculate actual cost from real token usage.
	 * Returns null if pricing for the model is unknown.
	 */
	calculateActualCost(model: string, usage: { inputTokens: number; outputTokens: number }): number | null {
		const modelName = model.includes("/") ? model.split("/").pop()! : model;
		const pricing = PRICING[modelName];
		if (!pricing) return null;

		return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
	}

	/** Check if we can afford to spawn a thread. */
	canAfford(model: string): { allowed: boolean; reason?: string } {
		const estimate = this.estimateThreadCost(model);

		if (this.totalSpent + estimate > this.sessionLimit) {
			return {
				allowed: false,
				reason: `Session budget exceeded: $${this.totalSpent.toFixed(4)} spent of $${this.sessionLimit.toFixed(2)} limit (next thread ~$${estimate.toFixed(4)})`,
			};
		}

		if (estimate > this.perThreadLimit) {
			return {
				allowed: false,
				reason: `Thread cost estimate ($${estimate.toFixed(4)}) exceeds per-thread limit ($${this.perThreadLimit.toFixed(2)})`,
			};
		}

		return { allowed: true };
	}

	/**
	 * Record cost for a completed thread.
	 * Uses actual usage when available, falls back to estimate.
	 */
	recordCost(
		threadId: string,
		model: string,
		usage?: { inputTokens: number; outputTokens: number },
	): { cost: number; isEstimate: boolean } {
		let cost: number;
		let isEstimate: boolean;

		if (usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
			// Use real token counts
			const actual = this.calculateActualCost(model, usage);
			if (actual !== null) {
				cost = actual;
				isEstimate = false;
				this.actualCostCount++;
			} else {
				// Have tokens but no pricing — estimate
				cost = this.estimateThreadCost(model);
				isEstimate = true;
				this.estimatedCostCount++;
			}
			this.totalInputTokens += usage.inputTokens;
			this.totalOutputTokens += usage.outputTokens;
		} else {
			// No usage data — estimate
			cost = this.estimateThreadCost(model);
			isEstimate = true;
			this.estimatedCostCount++;
		}

		this.threadCosts.set(threadId, cost);
		this.totalSpent += cost;
		return { cost, isEstimate };
	}

	get spent(): number {
		return this.totalSpent;
	}

	getState(): BudgetState {
		return {
			totalSpentUsd: this.totalSpent,
			threadCosts: new Map(this.threadCosts),
			sessionLimitUsd: this.sessionLimit,
			perThreadLimitUsd: this.perThreadLimit,
			totalTokens: {
				input: this.totalInputTokens,
				output: this.totalOutputTokens,
			},
			actualCostThreads: this.actualCostCount,
			estimatedCostThreads: this.estimatedCostCount,
		};
	}
}

// ── Error Classification ────────────────────────────────────────────────────

/** Patterns that indicate transient/retryable errors. */
const RETRYABLE_PATTERNS = [
	/timeout/i,
	/timed?\s*out/i,
	/ECONNRESET/i,
	/ECONNREFUSED/i,
	/EPIPE/i,
	/rate limit/i,
	/429/,
	/503/,
	/502/,
	/500/,
	/too many requests/i,
	/temporarily unavailable/i,
	/server error/i,
	/overloaded/i,
	/capacity/i,
	/lock file/i,
	/index\.lock/i,
];

/** Patterns that indicate permanent/fatal errors (don't retry). */
const FATAL_PATTERNS = [
	/authentication/i,
	/unauthorized/i,
	/forbidden/i,
	/invalid api key/i,
	/model not found/i,
	/permission denied/i,
	/quota exceeded/i,
	/billing/i,
];

/** Classify an error as retryable or fatal. Default: retryable (optimistic). */
function isRetryableError(error: string): boolean {
	// Check fatal patterns first (takes priority)
	if (FATAL_PATTERNS.some((p) => p.test(error))) return false;
	// Check retryable patterns
	if (RETRYABLE_PATTERNS.some((p) => p.test(error))) return true;
	// Default: retryable (be optimistic — the retry might work with a different agent)
	return true;
}

/** Calculate exponential backoff delay with jitter. */
function backoffDelay(attempt: number, baseMs: number = 1000): number {
	// Exponential: 1s, 2s, 4s, 8s... capped at 30s
	const exponential = Math.min(baseMs * 2 ** (attempt - 1), 30000);
	// Add jitter (±25%)
	const jitter = exponential * 0.25 * (Math.random() * 2 - 1);
	return Math.max(100, exponential + jitter);
}

/**
 * Pick an alternative agent/model combo for retry.
 * Avoids the agent that just failed and prefers agents with different default models.
 * Uses attempt number to cycle through alternatives on subsequent retries.
 */
function pickAlternativeAgent(
	failedAgent: string,
	failedModel: string,
	_config: SwarmConfig,
	attempt: number = 1,
): { agent: string; model: string } | null {
	const available = listAgents().filter((name) => name !== failedAgent && name !== "mock");
	if (available.length === 0) return null;

	// Build candidates, preferring agents with different default models
	const candidates: Array<{ agent: string; model: string }> = [];
	for (const name of available) {
		const cap = AGENT_CAPABILITIES[name];
		if (cap && cap.defaultModel !== failedModel) {
			candidates.push({ agent: name, model: cap.defaultModel });
		}
	}
	// Also include agents with same model (but different agent) as lower priority
	for (const name of available) {
		const cap = AGENT_CAPABILITIES[name];
		if (cap && cap.defaultModel === failedModel) {
			candidates.push({ agent: name, model: cap.defaultModel });
		}
	}
	// If no capabilities known, add all available with failedModel
	if (candidates.length === 0) {
		for (const name of available) {
			candidates.push({ agent: name, model: failedModel });
		}
	}

	if (candidates.length === 0) return null;

	// Cycle through candidates based on attempt number
	const idx = (attempt - 1) % candidates.length;
	return candidates[idx];
}

// ── Thread Manager ──────────────────────────────────────────────────────────

export type ThreadProgressCallback = (threadId: string, phase: ThreadProgressPhase, detail?: string) => void;
export type ThreadOutputCallback = (threadId: string, chunk: string) => void;

export class ThreadManager {
	private threads: Map<string, ThreadState> = new Map();
	private totalSpawned: number = 0;
	private semaphore: AsyncSemaphore;
	private worktreeManager: WorktreeManager;
	private config: SwarmConfig;
	private budget: BudgetTracker;
	private threadCache: ThreadCache;
	private episodicMemory?: EpisodicMemory;
	private onThreadProgress?: ThreadProgressCallback;
	private onThreadOutput?: ThreadOutputCallback;
	private sessionAbort?: AbortSignal;
	private threadAbortControllers: Map<string, AbortController> = new Map();

	constructor(
		repoRoot: string,
		config: SwarmConfig,
		onThreadProgress?: ThreadProgressCallback,
		sessionAbort?: AbortSignal,
	) {
		this.config = config;
		this.semaphore = new AsyncSemaphore(config.max_threads);
		this.worktreeManager = new WorktreeManager(repoRoot, config.worktree_base_dir);
		this.budget = new BudgetTracker(config.max_session_budget_usd, config.max_thread_budget_usd);
		this.threadCache = new ThreadCache(
			100,
			config.thread_cache_persist ? config.thread_cache_dir : undefined,
			config.thread_cache_ttl_hours,
		);
		this.onThreadProgress = onThreadProgress;
		this.sessionAbort = sessionAbort;
	}

	/** Set the output streaming callback for live agent output. */
	setThreadOutputCallback(cb: ThreadOutputCallback): void {
		this.onThreadOutput = cb;
	}

	/** Set the episodic memory store for recording thread outcomes. */
	setEpisodicMemory(memory: EpisodicMemory): void {
		this.episodicMemory = memory;
	}

	async init(): Promise<void> {
		await this.worktreeManager.init();
		await this.threadCache.init();
	}

	/**
	 * Spawn a thread — creates a worktree, runs the agent, returns compressed result.
	 * Checks the subthread cache first; on cache hit, returns immediately (Slate-style reuse).
	 * Retries up to config.thread_retries times on failure.
	 * Error-isolated: a failure here never throws — always returns a CompressedResult.
	 */
	async spawnThread(threadConfig: ThreadConfig): Promise<CompressedResult> {
		// Subthread cache lookup — return cached result for identical tasks
		const cacheAgent = threadConfig.agent.backend || this.config.default_agent;
		const cacheModel = threadConfig.agent.model || this.config.default_model;
		const cacheFiles = threadConfig.files || [];
		const cached = this.threadCache.get(threadConfig.task, cacheFiles, cacheAgent, cacheModel);
		if (cached) {
			const threadId = threadConfig.id || randomBytes(6).toString("hex");
			this.onThreadProgress?.(threadId, "completed", "cache hit");
			return cached;
		}

		// Enforce total thread limit
		if (this.totalSpawned >= this.config.max_total_threads) {
			return {
				success: false,
				summary: `Thread limit reached (${this.config.max_total_threads} max per session)`,
				filesChanged: [],
				diffStats: "",
				durationMs: 0,
				estimatedCostUsd: 0,
			};
		}

		// Preliminary budget check (definitive check happens inside semaphore)
		const model = threadConfig.agent.model || this.config.default_model;
		const budgetCheck = this.budget.canAfford(model);
		if (!budgetCheck.allowed) {
			return {
				success: false,
				summary: `Budget exceeded: ${budgetCheck.reason}`,
				filesChanged: [],
				diffStats: "",
				durationMs: 0,
				estimatedCostUsd: 0,
			};
		}

		// Check session abort
		if (this.sessionAbort?.aborted) {
			return {
				success: false,
				summary: "Session aborted",
				filesChanged: [],
				diffStats: "",
				durationMs: 0,
				estimatedCostUsd: 0,
			};
		}

		const threadId = threadConfig.id || randomBytes(6).toString("hex");
		const maxAttempts = this.config.thread_retries + 1;
		const state: ThreadState = {
			id: threadId,
			config: threadConfig,
			status: "pending",
			phase: "queued",
			startedAt: Date.now(),
			attempt: 0,
			maxAttempts,
			estimatedCostUsd: 0,
		};
		this.threads.set(threadId, state);
		this.totalSpawned++;

		// Create per-thread abort controller (linked to session abort)
		const threadAc = new AbortController();
		this.threadAbortControllers.set(threadId, threadAc);
		const onSessionAbort = () => threadAc.abort();
		if (this.sessionAbort) {
			if (this.sessionAbort.aborted) {
				threadAc.abort();
			} else {
				this.sessionAbort.addEventListener("abort", onSessionAbort, { once: true });
			}
		}

		// Retry loop with exponential backoff and agent re-routing
		let lastResult: CompressedResult | undefined;
		let currentConfig = threadConfig;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			state.attempt = attempt;

			if (attempt > 1) {
				// Exponential backoff before retry (abort-aware)
				const delay = backoffDelay(attempt - 1);
				state.phase = "retrying";
				this.onThreadProgress?.(
					threadId,
					"retrying",
					`attempt ${attempt}/${maxAttempts}, backoff ${(delay / 1000).toFixed(1)}s`,
				);

				// Race the delay against the abort signal so cancellation is immediate
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, delay);
					if (threadAc.signal.aborted) {
						clearTimeout(timer);
						resolve();
						return;
					}
					const onAbort = () => {
						clearTimeout(timer);
						resolve();
					};
					threadAc.signal.addEventListener("abort", onAbort, { once: true });
				});

				if (threadAc.signal.aborted) break;
			}

			lastResult = await this.executeThread(threadId, currentConfig, state, threadAc.signal);

			if (lastResult.success || threadAc.signal.aborted) {
				break;
			}

			// Don't retry on cancellation or budget issues
			if (state.status === "cancelled") break;

			// Classify the error — don't retry fatal errors
			const errorMsg = state.error || lastResult.summary || "";
			if (!isRetryableError(errorMsg)) {
				this.onThreadProgress?.(threadId, "failed", `fatal error, not retrying: ${errorMsg.slice(0, 80)}`);
				break;
			}

			// Try re-routing to a different agent/model on retry
			if (attempt < maxAttempts) {
				const currentAgent = currentConfig.agent.backend || this.config.default_agent;
				const currentModel = currentConfig.agent.model || this.config.default_model;
				const alt = pickAlternativeAgent(currentAgent, currentModel, this.config, attempt);

				if (alt) {
					currentConfig = {
						...currentConfig,
						agent: { backend: alt.agent, model: alt.model },
					};
					this.onThreadProgress?.(threadId, "retrying", `re-routing: ${currentAgent} → ${alt.agent}`);
				}
			}
		}

		this.sessionAbort?.removeEventListener("abort", onSessionAbort);
		this.threadAbortControllers.delete(threadId);
		return lastResult!;
	}

	/**
	 * Execute a single thread attempt. Acquires semaphore, creates worktree,
	 * runs agent, captures diff, compresses result.
	 */
	private async executeThread(
		threadId: string,
		threadConfig: ThreadConfig,
		state: ThreadState,
		signal: AbortSignal,
	): Promise<CompressedResult> {
		// Wait for a concurrency slot
		state.phase = "queued";
		this.onThreadProgress?.(
			threadId,
			"queued",
			this.semaphore.waitingCount > 0 ? `waiting (${this.semaphore.waitingCount} ahead)` : undefined,
		);

		await this.semaphore.acquire();

		try {
			if (signal.aborted) {
				state.status = "cancelled";
				state.phase = "cancelled";
				state.completedAt = Date.now();
				return this.failResult(state, "Thread cancelled before start");
			}

			// Definitive budget check inside semaphore (prevents race condition)
			const threadModel = threadConfig.agent.model || this.config.default_model;
			const budgetCheck = this.budget.canAfford(threadModel);
			if (!budgetCheck.allowed) {
				state.status = "failed";
				state.phase = "failed";
				state.completedAt = Date.now();
				return {
					success: false,
					summary: `Budget exceeded: ${budgetCheck.reason}`,
					filesChanged: [],
					diffStats: "",
					durationMs: 0,
					estimatedCostUsd: 0,
				};
			}

			state.status = "running";

			// Create worktree
			state.phase = "creating_worktree";
			this.onThreadProgress?.(threadId, "creating_worktree");
			const wtInfo = await this.worktreeManager.create(threadId);
			state.worktreePath = wtInfo.path;
			state.branchName = wtInfo.branch;

			// Run agent
			state.phase = "agent_running";
			this.onThreadProgress?.(threadId, "agent_running");
			const agent = getAgent(threadConfig.agent.backend || this.config.default_agent);

			let fullTask = threadConfig.task;
			if (threadConfig.context) {
				fullTask = `Context:\n${threadConfig.context}\n\nTask:\n${threadConfig.task}`;
			}

			// Combine thread timeout with cancellation signal
			const timeoutSignal = AbortSignal.timeout(this.config.thread_timeout_ms);
			const combinedAc = new AbortController();
			const onAbort = () => combinedAc.abort();
			signal.addEventListener("abort", onAbort, { once: true });
			timeoutSignal.addEventListener("abort", onAbort, { once: true });

			let agentResult;
			try {
				agentResult = await agent.run({
					task: fullTask,
					workDir: wtInfo.path,
					model: threadConfig.agent.model || this.config.default_model,
					files: threadConfig.files,
					signal: combinedAc.signal,
					onOutput: this.onThreadOutput ? (chunk: string) => this.onThreadOutput!(threadId, chunk) : undefined,
				});
			} finally {
				signal.removeEventListener("abort", onAbort);
				timeoutSignal.removeEventListener("abort", onAbort);
			}

			if (signal.aborted) {
				state.status = "cancelled";
				state.phase = "cancelled";
				state.completedAt = Date.now();
				await this.destroyWorktree(threadId);
				return this.failResult(state, "Thread cancelled during execution");
			}

			// Capture diff
			state.phase = "capturing_diff";
			this.onThreadProgress?.(threadId, "capturing_diff");
			const diff = await this.worktreeManager.getDiff(threadId);
			const diffStats = await this.worktreeManager.getDiffStats(threadId);
			const filesChanged = await this.worktreeManager.getChangedFiles(threadId);

			if (filesChanged.length > 0) {
				await this.worktreeManager.commit(threadId, `swarm: ${threadConfig.task.slice(0, 72)}`);
			}

			// Compress
			state.phase = "compressing";
			this.onThreadProgress?.(threadId, "compressing");
			const compressed = await compressResult(
				{
					agentOutput: agentResult.output,
					diff,
					diffStats,
					filesChanged,
					success: agentResult.success,
					durationMs: agentResult.durationMs,
					error: agentResult.error,
				},
				this.config.compression_strategy,
				this.config.compression_max_tokens,
			);

			// Record cost — uses real usage when available, falls back to estimate
			const model = threadConfig.agent.model || this.config.default_model;
			const { cost, isEstimate } = this.budget.recordCost(threadId, model, agentResult.usage);
			state.estimatedCostUsd = cost;

			const costLabel = isEstimate ? `~$${cost.toFixed(4)}` : `$${cost.toFixed(4)}`;
			const usageLabel = agentResult.usage
				? ` (${agentResult.usage.inputTokens}+${agentResult.usage.outputTokens} tokens)`
				: "";

			const result: CompressedResult = {
				success: agentResult.success,
				summary: compressed,
				filesChanged,
				diffStats,
				durationMs: Date.now() - state.startedAt!,
				estimatedCostUsd: cost,
				usage: agentResult.usage,
				costIsEstimate: isEstimate,
			};

			state.status = "completed";
			state.phase = "completed";
			state.result = result;
			state.completedAt = Date.now();
			this.onThreadProgress?.(threadId, "completed", `${filesChanged.length} files, ${costLabel}${usageLabel}`);

			// Cache successful results for subthread reuse
			if (result.success) {
				const cfg = state.config;
				this.threadCache.set(
					cfg.task,
					cfg.files || [],
					cfg.agent.backend || this.config.default_agent,
					cfg.agent.model || this.config.default_model,
					result,
				);

				// Record episode in episodic memory (fire-and-forget)
				// Only records if auto-routing is NOT active (swarm.ts records richer episodes with slot/complexity)
				if (this.episodicMemory && !this.config.auto_model_selection) {
					this.episodicMemory
						.record({
							task: cfg.task,
							agent: cfg.agent.backend || this.config.default_agent,
							model: cfg.agent.model || this.config.default_model,
							slot: "",
							complexity: "",
							success: true,
							durationMs: result.durationMs,
							estimatedCostUsd: cost,
							filesChanged: filesChanged,
							summary: compressed,
						})
						.catch(() => {}); // Non-fatal
				}
			}

			return result;
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			state.status = "failed";
			state.phase = "failed";
			state.error = errorMsg;
			state.completedAt = Date.now();
			this.onThreadProgress?.(threadId, "failed", errorMsg.slice(0, 100));

			// Record estimated cost for failed threads (agent may have consumed tokens before failure)
			const errModel = threadConfig.agent.model || this.config.default_model;
			const { cost } = this.budget.recordCost(threadId, errModel);
			state.estimatedCostUsd = cost;

			// Cleanup worktree on failure
			await this.destroyWorktree(threadId);

			return this.failResult(state, errorMsg);
		} finally {
			this.semaphore.release();
		}
	}

	/** Cancel a specific running thread. */
	cancelThread(threadId: string): boolean {
		const ac = this.threadAbortControllers.get(threadId);
		if (!ac) return false;
		ac.abort();
		const state = this.threads.get(threadId);
		if (state) {
			state.status = "cancelled";
			state.phase = "cancelled";
		}
		return true;
	}

	/** Cancel all running threads. */
	cancelAll(): void {
		for (const [id, ac] of this.threadAbortControllers) {
			ac.abort();
			const state = this.threads.get(id);
			if (state && (state.status === "running" || state.status === "pending")) {
				state.status = "cancelled";
				state.phase = "cancelled";
			}
		}
	}

	/** Get all thread states. */
	getThreads(): ThreadState[] {
		return [...this.threads.values()];
	}

	/** Get a specific thread's state. */
	getThread(threadId: string): ThreadState | undefined {
		return this.threads.get(threadId);
	}

	/** Get the worktree manager for merge operations. */
	getWorktreeManager(): WorktreeManager {
		return this.worktreeManager;
	}

	/** Get current budget state. */
	getBudgetState(): BudgetState {
		return this.budget.getState();
	}

	/** Get subthread cache stats. */
	getCacheStats(): ThreadCacheStats {
		return this.threadCache.getStats();
	}

	/** Get concurrency stats. */
	getConcurrencyStats(): { active: number; waiting: number; total: number; max: number } {
		return {
			active: this.semaphore.activeCount,
			waiting: this.semaphore.waitingCount,
			total: this.totalSpawned,
			max: this.config.max_threads,
		};
	}

	/** Cleanup all worktrees. */
	async cleanup(): Promise<void> {
		this.cancelAll();
		if (this.config.auto_cleanup_worktrees) {
			await this.worktreeManager.destroyAll();
		}
	}

	/** Destroy a specific thread's worktree and branch. */
	async destroyWorktree(threadId: string): Promise<void> {
		try {
			await this.worktreeManager.destroy(threadId, true);
		} catch {
			// Non-fatal
		}
	}

	private failResult(state: ThreadState, message: string): CompressedResult {
		return {
			success: false,
			summary: `Thread failed (attempt ${state.attempt}/${state.maxAttempts}): ${message}`,
			filesChanged: [],
			diffStats: "",
			durationMs: Date.now() - (state.startedAt || Date.now()),
			estimatedCostUsd: state.estimatedCostUsd,
		};
	}
}
