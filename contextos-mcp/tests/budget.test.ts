/**
 * Tests for real budget tracking with token counts.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Register mock agent (reports usage: 1500 input, 800 output)
import "../src/agents/mock.js";

import { loadConfig } from "../src/config.js";
import { ThreadManager } from "../src/threads/manager.js";

function createTempRepo(): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-budget-test-"));
	execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.email", "test@swarm.dev"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: tmpDir });
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
	execFileSync("git", ["add", "-A"], { cwd: tmpDir });
	execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });
	return tmpDir;
}

function cleanupRepo(dir: string): void {
	try {
		try {
			execFileSync("git", ["worktree", "prune"], { cwd: dir });
		} catch {
			/* ok */
		}
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
}

function getTestConfig() {
	const config = loadConfig();
	config.default_agent = "mock";
	config.default_model = "mock-model";
	config.max_threads = 3;
	config.max_total_threads = 20;
	config.thread_timeout_ms = 30000;
	config.max_session_budget_usd = 100;
	config.max_thread_budget_usd = 50;
	config.thread_retries = 0;
	config.auto_cleanup_worktrees = true;
	return config;
}

describe("Budget Tracking with Token Usage", () => {
	let repoDir: string;
	let tm: ThreadManager;

	beforeEach(async () => {
		repoDir = createTempRepo();
		const config = getTestConfig();
		tm = new ThreadManager(repoDir, config);
		await tm.init();
	});

	afterEach(async () => {
		await tm.cleanup();
		cleanupRepo(repoDir);
	});

	it("should track token usage from mock agent", async () => {
		const result = await tm.spawnThread({
			id: "usage-1",
			task: "add hello function",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(true);
		// Mock agent reports usage: 1500 input, 800 output
		expect(result.usage).toBeDefined();
		expect(result.usage!.inputTokens).toBe(1500);
		expect(result.usage!.outputTokens).toBe(800);
		expect(result.usage!.totalTokens).toBe(2300);
	});

	it("should track budget state with token totals", async () => {
		await tm.spawnThread({
			id: "budget-tok-1",
			task: "task 1",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		await tm.spawnThread({
			id: "budget-tok-2",
			task: "task 2",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		const budget = tm.getBudgetState();
		// 2 threads × 1500 input tokens = 3000
		expect(budget.totalTokens.input).toBe(3000);
		// 2 threads × 800 output tokens = 1600
		expect(budget.totalTokens.output).toBe(1600);
	});

	it("should record cost as estimated when model pricing unknown", async () => {
		// mock-model is not in MODEL_PRICING, so cost should be estimated
		const result = await tm.spawnThread({
			id: "est-cost",
			task: "task with unknown model",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.costIsEstimate).toBe(true);
		const budget = tm.getBudgetState();
		expect(budget.estimatedCostThreads).toBe(1);
	});

	it("should calculate actual cost when model pricing is known", async () => {
		const result = await tm.spawnThread({
			id: "actual-cost",
			task: "task with known model",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		// claude-sonnet-4-6: input=$3/M, output=$15/M
		// mock reports: 1500 input, 800 output
		// cost = (1500 * 3 + 800 * 15) / 1M = (4500 + 12000) / 1M = 0.0165
		expect(result.costIsEstimate).toBe(false);
		expect(result.estimatedCostUsd).toBeCloseTo(0.0165, 4);

		const budget = tm.getBudgetState();
		expect(budget.actualCostThreads).toBe(1);
		expect(budget.estimatedCostThreads).toBe(0);
	});

	it("should enforce budget based on actual spend", async () => {
		const config = getTestConfig();
		config.max_session_budget_usd = 0.02; // Just barely enough for one thread
		const tmBudget = new ThreadManager(repoDir, config);
		await tmBudget.init();

		// First thread with known model pricing should use actual cost
		await tmBudget.spawnThread({
			id: "enforce-1",
			task: "first task",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		// Second thread should be blocked by budget
		const result2 = await tmBudget.spawnThread({
			id: "enforce-2",
			task: "second task",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		expect(result2.success).toBe(false);
		expect(result2.summary).toContain("Budget exceeded");

		await tmBudget.cleanup();
	});

	it("should accumulate costs across multiple threads", async () => {
		await tm.spawnThread({
			id: "accum-1",
			task: "task a",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		await tm.spawnThread({
			id: "accum-2",
			task: "task b",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		const budget = tm.getBudgetState();
		// 2 threads × $0.0165 = $0.033
		expect(budget.totalSpentUsd).toBeCloseTo(0.033, 3);
		expect(budget.threadCosts.size).toBe(2);
		expect(budget.actualCostThreads).toBe(2);
	});
});

describe("Budget State in Compressed Result", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should include usage and cost info in compressed result", async () => {
		const config = getTestConfig();
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		const result = await tm.spawnThread({
			id: "result-check",
			task: "check result structure",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result).toHaveProperty("usage");
		expect(result).toHaveProperty("costIsEstimate");
		expect(result).toHaveProperty("estimatedCostUsd");
		expect(result.estimatedCostUsd).toBeGreaterThan(0);

		await tm.cleanup();
	});
});
