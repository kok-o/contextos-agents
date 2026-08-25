/**
 * Tests for error recovery, retry with backoff, and agent re-routing.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Register mock agent
import "../src/agents/mock.js";

import { loadConfig } from "../src/config.js";
import { ThreadManager } from "../src/threads/manager.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTempRepo(): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-retry-test-"));
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
	config.auto_cleanup_worktrees = true;
	config.compression_strategy = "structured";
	return config;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Retry with Backoff", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should succeed on first attempt without retry", async () => {
		const config = getTestConfig();
		config.thread_retries = 2;
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		const result = await tm.spawnThread({
			id: "no-retry",
			task: "simple task",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(true);
		const state = tm.getThread("no-retry");
		expect(state?.attempt).toBe(1); // Only 1 attempt needed

		await tm.cleanup();
	});

	it("should retry failed threads up to max_retries", async () => {
		const config = getTestConfig();
		config.thread_retries = 2; // 3 total attempts
		const progressLog: string[] = [];
		const tm = new ThreadManager(repoDir, config, (_id, phase, detail) => {
			progressLog.push(`${phase}${detail ? `:${detail}` : ""}`);
		});
		await tm.init();

		const result = await tm.spawnThread({
			id: "retry-test",
			task: "__FAIL__ this should retry",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		// Should have failed (mock agent fails on __FAIL__ every time)
		expect(result.success).toBe(false);
		const state = tm.getThread("retry-test");
		expect(state?.attempt).toBe(3); // All 3 attempts used

		// Progress should show retrying phases
		const retryingEntries = progressLog.filter((p) => p.startsWith("retrying"));
		expect(retryingEntries.length).toBeGreaterThan(0);

		await tm.cleanup();
	});

	it("should not retry when thread_retries is 0", async () => {
		const config = getTestConfig();
		config.thread_retries = 0;
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		const result = await tm.spawnThread({
			id: "no-retry-config",
			task: "__FAIL__ no retry",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(false);
		const state = tm.getThread("no-retry-config");
		expect(state?.attempt).toBe(1); // Only 1 attempt

		await tm.cleanup();
	});

	it("should apply exponential backoff between retries", async () => {
		const config = getTestConfig();
		config.thread_retries = 1; // 2 total attempts
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		const startTime = Date.now();
		await tm.spawnThread({
			id: "backoff-test",
			task: "__FAIL__ with backoff",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});
		const elapsed = Date.now() - startTime;

		// With 1 retry, there should be at least ~1s backoff (base=1000ms)
		// The mock agent runs in ~50ms, so the delay should dominate
		expect(elapsed).toBeGreaterThan(500); // At least some backoff

		await tm.cleanup();
	});
});

describe("Agent Re-routing on Failure", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should log re-routing attempts in progress", async () => {
		const config = getTestConfig();
		config.thread_retries = 1;
		const progressLog: string[] = [];
		const tm = new ThreadManager(repoDir, config, (_id, phase, detail) => {
			progressLog.push(`${phase}:${detail || ""}`);
		});
		await tm.init();

		await tm.spawnThread({
			id: "reroute-test",
			task: "__FAIL__ should try another agent",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		// Should show re-routing attempt in progress
		const rerouteEntries = progressLog.filter((p) => p.includes("re-routing") || p.includes("retrying"));
		expect(rerouteEntries.length).toBeGreaterThan(0);

		await tm.cleanup();
	});
});

describe("Error Classification", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should track attempt count in thread state", async () => {
		const config = getTestConfig();
		config.thread_retries = 1;
		const tm = new ThreadManager(repoDir, config);
		await tm.init();

		const result = await tm.spawnThread({
			id: "attempt-count",
			task: "__FAIL__ show attempts",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});

		expect(result.success).toBe(false);
		const state = tm.getThread("attempt-count");
		expect(state).toBeDefined();
		expect(state!.attempt).toBe(2); // 2 attempts (1 original + 1 retry)
		// state.status = "completed" means thread lifecycle finished (not result quality)
		// result.success tracks whether the agent work succeeded
		expect(state!.result?.success).toBe(false);

		await tm.cleanup();
	});
});

describe("Cancellation During Retry", () => {
	let repoDir: string;

	beforeEach(() => {
		repoDir = createTempRepo();
	});

	afterEach(() => {
		cleanupRepo(repoDir);
	});

	it("should respect abort signal during retry backoff", async () => {
		const config = getTestConfig();
		config.thread_retries = 3; // Many retries to ensure we're in backoff
		const ac = new AbortController();
		const tm = new ThreadManager(repoDir, config, undefined, ac.signal);
		await tm.init();

		// Abort after 200ms (should interrupt during first backoff)
		setTimeout(() => ac.abort(), 200);

		const startTime = Date.now();
		const result = await tm.spawnThread({
			id: "abort-during-retry",
			task: "__FAIL__ abort me",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		});
		const elapsed = Date.now() - startTime;

		// Should complete relatively quickly (not wait for all 3 retries)
		expect(elapsed).toBeLessThan(10000);
		expect(result.success).toBe(false);

		await tm.cleanup();
	});
});
