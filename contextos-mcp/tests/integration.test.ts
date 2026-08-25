/**
 * End-to-end integration tests for the swarm pipeline.
 *
 * Tests the full lifecycle: worktree creation → agent execution → diff capture →
 * compression → merge. Uses the mock agent backend (no real API keys needed).
 *
 * Each test creates a temporary git repo, exercises the pipeline, and verifies results.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Register mock agent before anything else
import "../src/agents/mock.js";

import { getAgent, listAgents } from "../src/agents/provider.js";
import { compressResult } from "../src/compression/compressor.js";
import { loadConfig } from "../src/config.js";
import type { ThreadState } from "../src/core/types.js";
import { ThreadManager } from "../src/threads/manager.js";
import { WorktreeManager } from "../src/worktree/manager.js";
import { mergeAllThreads, mergeThreadBranch } from "../src/worktree/merge.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTempRepo(): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-test-"));
	execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.email", "test@swarm.dev"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: tmpDir });

	// Create initial commit so HEAD exists
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test Repo\n");
	execFileSync("git", ["add", "-A"], { cwd: tmpDir });
	execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: tmpDir });

	return tmpDir;
}

function cleanupRepo(dir: string): void {
	try {
		// Prune worktrees first to avoid lock issues
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
	config.max_total_threads = 10;
	config.thread_timeout_ms = 30000;
	config.max_session_budget_usd = 100;
	config.max_thread_budget_usd = 50;
	config.thread_retries = 0;
	config.auto_cleanup_worktrees = true;
	config.compression_strategy = "structured";
	return config;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Agent Registry", () => {
	it("should have mock agent registered", () => {
		const agents = listAgents();
		expect(agents).toContain("mock");
	});

	it("should get mock agent by name", () => {
		const agent = getAgent("mock");
		expect(agent.name).toBe("mock");
	});

	it("mock agent should report available", async () => {
		const agent = getAgent("mock");
		expect(await agent.isAvailable()).toBe(true);
	});
});

describe("Worktree Manager", () => {
	let repoDir: string;
	let wm: WorktreeManager;

	beforeEach(async () => {
		repoDir = createTempRepo();
		wm = new WorktreeManager(repoDir);
		await wm.init();
	});

	afterEach(async () => {
		await wm.destroyAll();
		cleanupRepo(repoDir);
	});

	it("should create a worktree", async () => {
		const info = await wm.create("test-wt-1");
		expect(info.id).toBe("test-wt-1");
		expect(info.branch).toBe("swarm/test-wt-1");
		expect(fs.existsSync(info.path)).toBe(true);
		// Worktree should contain the initial README
		expect(fs.existsSync(path.join(info.path, "README.md"))).toBe(true);
	});

	it("should capture diff after file changes", async () => {
		const info = await wm.create("test-wt-2");
		// Write a new file in the worktree
		fs.writeFileSync(path.join(info.path, "new-file.ts"), "export const x = 1;\n");
		const diff = await wm.getDiff("test-wt-2");
		expect(diff).toContain("new-file.ts");
		expect(diff).toContain("export const x = 1;");
	});

	it("should list changed files", async () => {
		const info = await wm.create("test-wt-3");
		fs.writeFileSync(path.join(info.path, "a.ts"), "const a = 1;\n");
		fs.writeFileSync(path.join(info.path, "b.ts"), "const b = 2;\n");
		const files = await wm.getChangedFiles("test-wt-3");
		expect(files).toContain("a.ts");
		expect(files).toContain("b.ts");
	});

	it("should commit changes", async () => {
		const info = await wm.create("test-wt-4");
		fs.writeFileSync(path.join(info.path, "committed.ts"), "export {};\n");
		const committed = await wm.commit("test-wt-4", "test commit");
		expect(committed).toBe(true);

		// Verify commit exists
		const log = execFileSync("git", ["log", "--oneline", "-1"], { cwd: info.path }).toString();
		expect(log).toContain("test commit");
	});

	it("should destroy a worktree and its branch", async () => {
		const info = await wm.create("test-wt-5");
		await wm.destroy("test-wt-5", true);
		expect(fs.existsSync(info.path)).toBe(false);
	});

	it("should handle multiple concurrent worktrees", async () => {
		const infos = await Promise.all([wm.create("multi-1"), wm.create("multi-2"), wm.create("multi-3")]);
		expect(infos).toHaveLength(3);
		for (const info of infos) {
			expect(fs.existsSync(info.path)).toBe(true);
		}
	});
});

describe("Mock Agent Execution", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should execute task and create files", async () => {
		const agent = getAgent("mock");
		const result = await agent.run({ task: "add hello function", workDir: repoDir });
		expect(result.success).toBe(true);
		expect(result.filesChanged).toContain("hello.ts");
		expect(fs.existsSync(path.join(repoDir, "hello.ts"))).toBe(true);
	});

	it("should handle forced failures", async () => {
		const agent = getAgent("mock");
		const result = await agent.run({ task: "__FAIL__ this task", workDir: repoDir });
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	it("should create multiple files for multi tasks", async () => {
		const agent = getAgent("mock");
		const result = await agent.run({ task: "multi file changes", workDir: repoDir });
		expect(result.success).toBe(true);
		expect(result.filesChanged).toContain("hello.ts");
		expect(result.filesChanged).toContain("utils.ts");
	});
});

describe("Compression", () => {
	it("should compress a successful result (structured)", async () => {
		const compressed = await compressResult(
			{
				agentOutput: "Applied edit to hello.ts\nCreated 1 file(s)\nResult: done",
				diff: "diff --git a/hello.ts b/hello.ts\n+export function hello() {}",
				diffStats: " hello.ts | 1 +\n 1 file changed, 1 insertion(+)",
				filesChanged: ["hello.ts"],
				success: true,
				durationMs: 1234,
			},
			"structured",
			1000,
		);
		expect(compressed).toContain("SUCCESS");
		expect(compressed).toContain("hello.ts");
	});

	it("should compress a failed result", async () => {
		const compressed = await compressResult(
			{
				agentOutput: "",
				diff: "",
				diffStats: "",
				filesChanged: [],
				success: false,
				durationMs: 500,
				error: "Agent crashed",
			},
			"structured",
			1000,
		);
		expect(compressed).toContain("FAILED");
		expect(compressed).toContain("Agent crashed");
	});

	it("should handle diff-only strategy", async () => {
		const compressed = await compressResult(
			{
				agentOutput: "lots of noise",
				diff: "diff --git a/x.ts b/x.ts\n+new line",
				diffStats: "",
				filesChanged: ["x.ts"],
				success: true,
				durationMs: 100,
			},
			"diff-only",
			500,
		);
		expect(compressed).toContain("SUCCESS");
		expect(compressed).toContain("diff --git");
		// diff-only should NOT include agent output
		expect(compressed).not.toContain("lots of noise");
	});
});

describe("Thread Manager — Single Thread", () => {
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

	it("should spawn a thread and get compressed result", async () => {
		const result = await tm.spawnThread({
			id: "thread-1",
			task: "add hello function",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(true);
		expect(result.summary).toContain("SUCCESS");
		expect(result.filesChanged).toContain("hello.ts");
		expect(result.durationMs).toBeGreaterThan(0);
	});

	it("should track thread state", async () => {
		const resultPromise = tm.spawnThread({
			id: "thread-state",
			task: "add hello function",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		const _result = await resultPromise;
		const state = tm.getThread("thread-state");
		expect(state).toBeDefined();
		expect(state!.status).toBe("completed");
		expect(state!.phase).toBe("completed");
	});

	it("should handle failed threads", async () => {
		const result = await tm.spawnThread({
			id: "thread-fail",
			task: "__FAIL__ this task",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(false);
	});

	it("should enforce total thread limit", async () => {
		const config = getTestConfig();
		config.max_total_threads = 1;
		const tmLimited = new ThreadManager(repoDir, config);
		await tmLimited.init();

		await tmLimited.spawnThread({
			id: "limit-1",
			task: "first task",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		const result = await tmLimited.spawnThread({
			id: "limit-2",
			task: "second task",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(false);
		expect(result.summary).toContain("Thread limit reached");

		await tmLimited.cleanup();
	});
});

describe("Thread Manager — Parallel Threads", () => {
	let repoDir: string;
	let tm: ThreadManager;

	beforeEach(async () => {
		repoDir = createTempRepo();
		const config = getTestConfig();
		config.max_threads = 3;
		tm = new ThreadManager(repoDir, config);
		await tm.init();
	});

	afterEach(async () => {
		await tm.cleanup();
		cleanupRepo(repoDir);
	});

	it("should run multiple threads in parallel", async () => {
		const results = await Promise.all([
			tm.spawnThread({
				id: "par-1",
				task: "task one",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
			tm.spawnThread({
				id: "par-2",
				task: "task two",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
			tm.spawnThread({
				id: "par-3",
				task: "task three",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
		]);

		expect(results).toHaveLength(3);
		for (const r of results) {
			expect(r.success).toBe(true);
			expect(r.filesChanged).toContain("hello.ts");
		}

		// All threads should be tracked
		const threads = tm.getThreads();
		expect(threads).toHaveLength(3);
		expect(threads.every((t) => t.status === "completed")).toBe(true);
	});
});

describe("Merge Pipeline", () => {
	let repoDir: string;
	let wm: WorktreeManager;

	beforeEach(async () => {
		repoDir = createTempRepo();
		wm = new WorktreeManager(repoDir);
		await wm.init();
	});

	afterEach(async () => {
		await wm.destroyAll();
		cleanupRepo(repoDir);
	});

	it("should merge a single thread branch", async () => {
		// Create worktree, write file, commit
		const info = await wm.create("merge-1");
		fs.writeFileSync(path.join(info.path, "feature.ts"), "export const f = 1;\n");
		await wm.commit("merge-1", "add feature");

		// Merge back to main
		const result = await mergeThreadBranch(repoDir, info.branch, "merge-1");
		expect(result.success).toBe(true);

		// Verify file exists on main
		expect(fs.existsSync(path.join(repoDir, "feature.ts"))).toBe(true);
	});

	it("should merge multiple non-conflicting branches", async () => {
		// Thread A: creates file-a.ts
		const infoA = await wm.create("merge-a");
		fs.writeFileSync(path.join(infoA.path, "file-a.ts"), "export const a = 1;\n");
		await wm.commit("merge-a", "add file-a");

		// Thread B: creates file-b.ts
		const infoB = await wm.create("merge-b");
		fs.writeFileSync(path.join(infoB.path, "file-b.ts"), "export const b = 2;\n");
		await wm.commit("merge-b", "add file-b");

		// Create mock thread states for mergeAllThreads
		const threads: ThreadState[] = [
			{
				id: "merge-a",
				config: { id: "merge-a", task: "a", context: "", agent: { backend: "mock", model: "" } },
				status: "completed",
				phase: "completed",
				branchName: infoA.branch,
				result: {
					success: true,
					summary: "",
					filesChanged: ["file-a.ts"],
					diffStats: "",
					durationMs: 0,
					estimatedCostUsd: 0,
				},
				attempt: 1,
				maxAttempts: 1,
				estimatedCostUsd: 0,
				completedAt: 1000,
			},
			{
				id: "merge-b",
				config: { id: "merge-b", task: "b", context: "", agent: { backend: "mock", model: "" } },
				status: "completed",
				phase: "completed",
				branchName: infoB.branch,
				result: {
					success: true,
					summary: "",
					filesChanged: ["file-b.ts"],
					diffStats: "",
					durationMs: 0,
					estimatedCostUsd: 0,
				},
				attempt: 1,
				maxAttempts: 1,
				estimatedCostUsd: 0,
				completedAt: 2000,
			},
		];

		const results = await mergeAllThreads(repoDir, threads);
		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success)).toBe(true);

		// Both files should exist on main
		expect(fs.existsSync(path.join(repoDir, "file-a.ts"))).toBe(true);
		expect(fs.existsSync(path.join(repoDir, "file-b.ts"))).toBe(true);
	});

	it("should detect merge conflicts", async () => {
		// Thread A: modifies README with distinct content
		const infoA = await wm.create("conflict-a");
		fs.writeFileSync(path.join(infoA.path, "README.md"), "# Modified by thread A\nLine A content\n");
		await wm.commit("conflict-a", "modify readme A");

		// Thread B: modifies README with different content on same lines
		const infoB = await wm.create("conflict-b");
		fs.writeFileSync(path.join(infoB.path, "README.md"), "# Modified by thread B\nLine B content\n");
		await wm.commit("conflict-b", "modify readme B");

		// Merge A (should succeed)
		const resultA = await mergeThreadBranch(repoDir, infoA.branch, "conflict-a");
		expect(resultA.success).toBe(true);

		// Merge B (should conflict on README.md)
		const resultB = await mergeThreadBranch(repoDir, infoB.branch, "conflict-b");
		expect(resultB.success).toBe(false);
		// The merge should fail — check either conflicts array or the error message
		expect(resultB.message).toBeTruthy();
	});
});

describe("Full Pipeline — End-to-End", () => {
	let repoDir: string;
	let tm: ThreadManager;

	beforeEach(async () => {
		repoDir = createTempRepo();
		// Add a source file for the agent to work with
		fs.writeFileSync(path.join(repoDir, "src.ts"), "export const x = 0;\n");
		execFileSync("git", ["add", "-A"], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "add src"], { cwd: repoDir });

		const config = getTestConfig();
		tm = new ThreadManager(repoDir, config);
		await tm.init();
	});

	afterEach(async () => {
		await tm.cleanup();
		cleanupRepo(repoDir);
	});

	it("should complete full pipeline: spawn → execute → diff → compress → merge", async () => {
		// 1. Spawn thread
		const result = await tm.spawnThread({
			id: "e2e-1",
			task: "add hello function",
			context: "Working on a TypeScript project",
			agent: { backend: "mock", model: "mock-model" },
		});

		// 2. Verify thread result
		expect(result.success).toBe(true);
		expect(result.summary).toContain("SUCCESS");
		expect(result.filesChanged).toContain("hello.ts");
		expect(result.durationMs).toBeGreaterThan(0);
		expect(result.diffStats).toBeTruthy();

		// 3. Verify thread state
		const state = tm.getThread("e2e-1");
		expect(state).toBeDefined();
		expect(state!.status).toBe("completed");
		expect(state!.branchName).toBe("swarm/e2e-1");

		// 4. Merge back to main
		const mergeResult = await mergeThreadBranch(repoDir, state!.branchName!, "e2e-1");
		expect(mergeResult.success).toBe(true);

		// 5. Verify file exists on main after merge
		expect(fs.existsSync(path.join(repoDir, "hello.ts"))).toBe(true);
		const content = fs.readFileSync(path.join(repoDir, "hello.ts"), "utf-8");
		expect(content).toContain("hello");

		// 6. Verify budget was tracked
		const budget = tm.getBudgetState();
		expect(budget.totalSpentUsd).toBeGreaterThan(0);
		expect(budget.threadCosts.has("e2e-1")).toBe(true);
	});

	it("should complete full parallel pipeline: 3 threads → merge all", async () => {
		// 1. Spawn 3 parallel threads
		const results = await Promise.all([
			tm.spawnThread({
				id: "e2e-par-1",
				task: "add feature alpha",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
			tm.spawnThread({
				id: "e2e-par-2",
				task: "add feature beta",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
			tm.spawnThread({
				id: "e2e-par-3",
				task: "add feature gamma",
				context: "",
				agent: { backend: "mock", model: "mock-model" },
			}),
		]);

		// 2. All should succeed
		expect(results.every((r) => r.success)).toBe(true);

		// 3. Merge all
		const threads = tm.getThreads();
		const mergeResults = await mergeAllThreads(repoDir, threads);

		// At least some should merge (they all edit hello.ts so later ones may conflict)
		expect(mergeResults.length).toBeGreaterThan(0);
		expect(mergeResults[0].success).toBe(true);

		// 4. First thread's file should exist on main
		expect(fs.existsSync(path.join(repoDir, "hello.ts"))).toBe(true);

		// 5. Concurrency stats
		const stats = tm.getConcurrencyStats();
		expect(stats.total).toBe(3);
	});

	it("should handle abort/cancellation", async () => {
		const config = getTestConfig();
		const ac = new AbortController();
		const tmAbort = new ThreadManager(repoDir, config, undefined, ac.signal);
		await tmAbort.init();

		// Abort immediately
		ac.abort();

		const result = await tmAbort.spawnThread({
			id: "abort-1",
			task: "should not run",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(false);
		expect(result.summary).toContain("abort");

		await tmAbort.cleanup();
	});
});

describe("Budget Enforcement", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should enforce session budget limit", async () => {
		const config = getTestConfig();
		config.max_session_budget_usd = 0.001; // Tiny budget
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		// First thread should succeed (estimated cost is still within budget)
		// But since even the minimum estimate exceeds 0.001, this should fail
		const result = await tm.spawnThread({
			id: "budget-1",
			task: "task",
			context: "",
			agent: { backend: "mock", model: "claude-sonnet-4-6" },
		});

		// With a model that costs $3/M input and $15/M output,
		// estimate = (4000*3 + 2000*15) / 1M = 0.042 > 0.001
		expect(result.success).toBe(false);
		expect(result.summary).toContain("Budget exceeded");

		await tm.cleanup();
	});
});
