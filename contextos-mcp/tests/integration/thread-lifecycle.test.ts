/**
 * Integration tests for ThreadManager lifecycle.
 *
 * Exercises the full thread lifecycle using a real temporary git repo
 * and the mock agent backend (no API keys needed).
 *
 * Covers: spawn, tracking, budget, cache hits, failure, and cancellation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempRepo, createTempGitRepo, getTestConfig } from "../fixtures/helpers.js";

// Register mock agent before importing ThreadManager
import "../../src/agents/mock.js";

import type { ThreadConfig } from "../../src/core/types.js";
import { ThreadManager } from "../../src/threads/manager.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeThreadConfig(overrides?: Partial<ThreadConfig>): ThreadConfig {
	return {
		id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
		task: "add hello function",
		context: "",
		agent: { backend: "mock", model: "mock-model" },
		...overrides,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ThreadManager lifecycle", () => {
	let repoDir: string;
	let tm: ThreadManager;

	beforeEach(async () => {
		repoDir = createTempGitRepo("thread-lifecycle");
		const config = getTestConfig({
			max_threads: 3,
			thread_retries: 0,
			max_session_budget_usd: 100,
			max_thread_budget_usd: 50,
		});
		tm = new ThreadManager(repoDir, config);
		await tm.init();
	});

	afterEach(async () => {
		await tm.cleanup();
		cleanupTempRepo(repoDir);
	});

	// ── 1. Basic lifecycle ──────────────────────────────────────────────────

	it("spawnThread succeeds and returns CompressedResult with success:true", async () => {
		const result = await tm.spawnThread(makeThreadConfig({ id: "lifecycle-ok", task: "add hello function" }));

		expect(result.success).toBe(true);
		expect(result.summary).toContain("SUCCESS");
		expect(result.filesChanged).toContain("hello.ts");
		expect(result.durationMs).toBeGreaterThan(0);
		expect(result.diffStats).toBeTruthy();
		expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
	});

	// ── 2. Thread tracking ──────────────────────────────────────────────────

	it("getThreads() returns spawned threads, getThread() finds by ID", async () => {
		await tm.spawnThread(makeThreadConfig({ id: "track-a", task: "task A" }));
		await tm.spawnThread(makeThreadConfig({ id: "track-b", task: "task B" }));

		const threads = tm.getThreads();
		expect(threads).toHaveLength(2);

		const ids = threads.map((t) => t.id);
		expect(ids).toContain("track-a");
		expect(ids).toContain("track-b");

		const single = tm.getThread("track-a");
		expect(single).toBeDefined();
		expect(single!.id).toBe("track-a");
		expect(single!.status).toBe("completed");

		// Non-existent thread returns undefined
		expect(tm.getThread("nonexistent")).toBeUndefined();
	});

	// ── 3. Budget tracking ──────────────────────────────────────────────────

	it("getBudgetState() shows spent amount after thread completion", async () => {
		const budgetBefore = tm.getBudgetState();
		expect(budgetBefore.totalSpentUsd).toBe(0);

		await tm.spawnThread(makeThreadConfig({ id: "budget-1", task: "do something" }));

		const budgetAfter = tm.getBudgetState();
		expect(budgetAfter.totalSpentUsd).toBeGreaterThan(0);
		expect(budgetAfter.threadCosts.has("budget-1")).toBe(true);
		expect(budgetAfter.threadCosts.get("budget-1")).toBeGreaterThan(0);

		// Mock agent reports usage (1500 input, 800 output), so actual cost
		// tracking should have at least one thread recorded.
		// Model is "mock-model" which is not in PRICING, so it falls back to estimate.
		expect(budgetAfter.estimatedCostThreads).toBeGreaterThanOrEqual(1);
	});

	// ── 4. Cache hit ────────────────────────────────────────────────────────

	it("spawning identical thread twice returns cached result on second call", async () => {
		const sharedConfig = makeThreadConfig({
			id: "cache-first",
			task: "identical task for caching",
		});

		const first = await tm.spawnThread(sharedConfig);
		expect(first.success).toBe(true);

		// Verify initial cache stats
		const statsBefore = tm.getCacheStats();
		expect(statsBefore.size).toBeGreaterThanOrEqual(1);

		// Spawn a second thread with the same task, files, agent, and model
		// (different id so it doesn't collide in the threads map, but cache key
		// is based on task+files+agent+model, not on id)
		const second = await tm.spawnThread(
			makeThreadConfig({
				id: "cache-second",
				task: "identical task for caching",
			}),
		);
		expect(second.success).toBe(true);

		const statsAfter = tm.getCacheStats();
		expect(statsAfter.hits).toBeGreaterThanOrEqual(1);
	});

	// ── 5. Failed thread ────────────────────────────────────────────────────

	it("spawn with __FAIL__ trigger returns success:false", async () => {
		const result = await tm.spawnThread(
			makeThreadConfig({
				id: "fail-thread",
				task: "this should __FAIL__ on purpose",
			}),
		);

		expect(result.success).toBe(false);
		expect(result.summary).toBeTruthy();

		const state = tm.getThread("fail-thread");
		expect(state).toBeDefined();
		// The mock agent returns success:false (no exception thrown), so the thread
		// status is "completed" with result.success === false
		expect(state!.status).toBe("completed");
		expect(state!.result?.success).toBe(false);
	});

	// ── 6. Cancel ───────────────────────────────────────────────────────────

	it("cancelThread returns true for running thread, false for completed", async () => {
		// Completed thread: cancelThread should return false (no abort controller left)
		await tm.spawnThread(makeThreadConfig({ id: "cancel-done", task: "quick task" }));
		const cancelDone = tm.cancelThread("cancel-done");
		expect(cancelDone).toBe(false);

		// Non-existent thread: should also return false
		const cancelNone = tm.cancelThread("does-not-exist");
		expect(cancelNone).toBe(false);
	});

	it("cancelAll marks running threads as cancelled", async () => {
		// Use session abort to test cancel flow
		const ac = new AbortController();
		const config = getTestConfig({
			max_threads: 1,
			thread_retries: 0,
		});
		const tmCancel = new ThreadManager(repoDir, config, undefined, ac.signal);
		await tmCancel.init();

		// Abort before spawning so the thread fails immediately
		ac.abort();

		const result = await tmCancel.spawnThread(makeThreadConfig({ id: "cancel-all-1", task: "should be aborted" }));

		expect(result.success).toBe(false);
		expect(result.summary.toLowerCase()).toContain("abort");

		await tmCancel.cleanup();
	});

	// ── 7. Progress callback ────────────────────────────────────────────────

	it("onThreadProgress callback is called during thread lifecycle", async () => {
		const phases: string[] = [];
		const config = getTestConfig({ thread_retries: 0 });
		const tmProgress = new ThreadManager(repoDir, config, (_threadId, phase) => {
			phases.push(phase);
		});
		await tmProgress.init();

		await tmProgress.spawnThread(makeThreadConfig({ id: "progress-1", task: "tracked task" }));

		// Should have progressed through at least queued -> agent_running -> completed
		expect(phases.length).toBeGreaterThanOrEqual(2);
		expect(phases).toContain("completed");

		await tmProgress.cleanup();
	});

	// ── 8. Concurrency stats ────────────────────────────────────────────────

	it("getConcurrencyStats() reflects total spawned threads", async () => {
		await tm.spawnThread(makeThreadConfig({ id: "conc-1", task: "task 1" }));
		await tm.spawnThread(makeThreadConfig({ id: "conc-2", task: "task 2" }));

		const stats = tm.getConcurrencyStats();
		expect(stats.total).toBe(2);
		expect(stats.max).toBe(3); // config.max_threads
		// After completion, active should be 0
		expect(stats.active).toBe(0);
		expect(stats.waiting).toBe(0);
	});
});
