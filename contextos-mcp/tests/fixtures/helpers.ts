/**
 * Shared test utilities for swarm-code tests.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SwarmConfig } from "../../src/config.js";
import { loadConfig } from "../../src/config.js";
import type { BudgetState, CompressedResult, ThreadConfig, ThreadState } from "../../src/core/types.js";

/**
 * Create a temporary git repository with an initial commit.
 * Returns the absolute path to the repo.
 */
export function createTempGitRepo(name: string = "swarm-test"): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
	execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.email", "test@swarm.dev"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: tmpDir });
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test Repo\n");
	execFileSync("git", ["add", "-A"], { cwd: tmpDir });
	execFileSync("git", ["commit", "-m", "initial commit"], { cwd: tmpDir });
	return tmpDir;
}

/**
 * Clean up a temporary git repo.
 * Prunes worktrees first to avoid stale references.
 */
export function cleanupTempRepo(dir: string): void {
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

/**
 * Get a test SwarmConfig with sensible defaults for testing.
 * Uses the mock agent backend.
 */
export function getTestConfig(overrides?: Partial<SwarmConfig>): SwarmConfig {
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
	if (overrides) {
		Object.assign(config, overrides);
	}
	return config;
}

/** Create a mock CompressedResult for testing. */
export function mockCompressedResult(overrides?: Partial<CompressedResult>): CompressedResult {
	return {
		success: true,
		summary: "Thread completed successfully",
		filesChanged: ["src/main.ts"],
		diffStats: " 1 file changed, 5 insertions(+), 2 deletions(-)",
		durationMs: 1500,
		estimatedCostUsd: 0.005,
		usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
		...overrides,
	};
}

/** Create a mock ThreadConfig for testing. */
export function mockThreadConfig(overrides?: Partial<ThreadConfig>): ThreadConfig {
	return {
		id: `test-${Date.now().toString(36)}`,
		task: "Fix the authentication bug",
		context: "",
		agent: { backend: "mock", model: "mock-model" },
		files: [],
		...overrides,
	};
}

/** Create a mock ThreadState for testing. */
export function mockThreadState(overrides?: Partial<ThreadState>): ThreadState {
	return {
		config: mockThreadConfig(),
		status: "completed",
		phase: "completed",
		worktreePath: "/tmp/wt-test",
		branchName: "swarm/test-thread",
		result: mockCompressedResult(),
		startedAt: Date.now() - 2000,
		completedAt: Date.now(),
		error: undefined,
		attempt: 1,
		maxAttempts: 1,
		estimatedCostUsd: 0.005,
		...overrides,
	};
}

/** Create a mock BudgetState for testing. */
export function mockBudgetState(overrides?: Partial<BudgetState>): BudgetState {
	return {
		totalSpentUsd: 0.01,
		sessionLimitUsd: 10.0,
		perThreadLimitUsd: 1.0,
		actualCostThreads: 1,
		estimatedCostThreads: 0,
		totalTokens: { input: 1000, output: 500 },
		threadCosts: new Map(),
		...overrides,
	};
}

/** Create a temporary directory and return its path. */
export function createTempDir(prefix: string = "swarm-test-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write a file in a temp repo and stage it. */
export function writeAndStage(repoDir: string, filePath: string, content: string): void {
	const fullPath = path.join(repoDir, filePath);
	const dir = path.dirname(fullPath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(fullPath, content);
	execFileSync("git", ["add", filePath], { cwd: repoDir });
}

/** Commit all staged changes. */
export function commitAll(repoDir: string, message: string = "test commit"): void {
	execFileSync("git", ["add", "-A"], { cwd: repoDir });
	execFileSync("git", ["commit", "-m", message, "--allow-empty"], { cwd: repoDir });
}
