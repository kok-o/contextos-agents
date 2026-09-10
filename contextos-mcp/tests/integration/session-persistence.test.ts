/**
 * Unit tests for session persistence and orphan management in contextos-mcp.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ThreadState } from "../../src/core/types.js";
import {
	acquireStateLock,
	clearPersistedState,
	getPersistedAsyncTasks,
	getPersistedThreads,
	purgeOrphans,
	reconcileSessionStateWithGit,
	recordAsyncTask,
	recordThreadState,
	scanOrphanWorktrees,
} from "../../src/mcp/state.js";

const TEST_DIR = path.join(__dirname, ".tmp-persistence-test");

describe("MCP Session Persistence & Orphan Management", () => {
	beforeEach(() => {
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
		fs.mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	it("records and loads thread state from disk via ThreadStore", () => {
		const thread: ThreadState = {
			id: "task-101_openai",
			config: {
				id: "task-101_openai",
				task: "Build user auth modal",
				writeScope: ["."],
				allowRepositoryWide: true,
				context: "",
				agent: { backend: "direct-llm", model: "gpt-4o" },
			},
			status: "completed",
			phase: "completed",
			worktreePath: path.join(TEST_DIR, ".swarm-worktrees", "task-101_openai"),
			branchName: "swarm/task-101_openai",
			attempt: 1,
			maxAttempts: 1,
			estimatedCostUsd: 0.045,
			startedAt: Date.now() - 5000,
			completedAt: Date.now(),
		};

		recordThreadState(TEST_DIR, thread);

		const threads = getPersistedThreads(TEST_DIR);
		expect(threads).toHaveLength(1);
		expect(threads[0].id).toBe("task-101_openai");
		expect(threads[0].status).toBe("completed");
	});

	it("updates existing thread status", () => {
		const initial: ThreadState = {
			id: "task-202_anthropic",
			config: {
				id: "task-202_anthropic",
				task: "Run tests",
				writeScope: ["."],
				allowRepositoryWide: true,
				context: "",
				agent: { backend: "direct-llm", model: "claude-sonnet-4-6" },
			},
			status: "running",
			phase: "agent_running",
			attempt: 1,
			maxAttempts: 1,
			estimatedCostUsd: 0.01,
		};

		recordThreadState(TEST_DIR, initial);
		let threads = getPersistedThreads(TEST_DIR);
		expect(threads[0].status).toBe("running");

		const updated: ThreadState = {
			...initial,
			status: "completed",
			phase: "completed",
			completedAt: Date.now(),
		};

		recordThreadState(TEST_DIR, updated);
		threads = getPersistedThreads(TEST_DIR);
		expect(threads).toHaveLength(1);
		expect(threads[0].status).toBe("completed");
		expect(threads[0].completedAt).toBeDefined();
	});

	it("clears persisted state gracefully (no-op for threads, preserves history)", () => {
		const thread: ThreadState = {
			id: "task-303",
			config: {
				id: "task-303",
				task: "A",
				writeScope: [],
				agent: { backend: "direct-llm", model: "gpt-4o" },
			},
			status: "pending",
			phase: "queued",
			attempt: 1,
			maxAttempts: 1,
			estimatedCostUsd: 0,
		};

		recordThreadState(TEST_DIR, thread);
		expect(getPersistedThreads(TEST_DIR)).toHaveLength(1);

		clearPersistedState(TEST_DIR);
		// ThreadStore keeps history!
		expect(getPersistedThreads(TEST_DIR)).toHaveLength(1);
	});

	it("detects and purges orphan worktree directories", async () => {
		const wtDir = path.join(TEST_DIR, ".swarm-worktrees", "orphan-wt");
		fs.mkdirSync(wtDir, { recursive: true });
		fs.writeFileSync(path.join(wtDir, ".contextos-session"), JSON.stringify({ sessionId: "old-session" }));

		const report = await scanOrphanWorktrees(TEST_DIR);
		expect(report.worktreeDirs).toContain(wtDir);

		const result = await purgeOrphans(TEST_DIR);
		expect(result.prunedWorktrees).toBeGreaterThanOrEqual(1);
		expect(fs.existsSync(wtDir)).toBe(false);
	});

	it("recovers running thread to interrupted after process crash via reconcileSessionStateWithGit", async () => {
		const threadId = "task-crash";
		recordThreadState(TEST_DIR, {
			id: threadId,
			config: { id: threadId, task: "X", writeScope: [], agent: { backend: "direct-llm", model: "x" } },
			status: "running",
			phase: "agent_running",
			attempt: 1,
			maxAttempts: 1,
			estimatedCostUsd: 1.5,
		});

		await reconcileSessionStateWithGit(TEST_DIR);
		const threads = getPersistedThreads(TEST_DIR);

		expect(threads).toHaveLength(1);
		expect(threads[0].status).toBe("interrupted");
		expect(threads[0].estimatedCostUsd).toBe(1.5);
	});

	it("acquires state lock, rejects concurrent holder, and releases", () => {
		const release1 = acquireStateLock(TEST_DIR, "session-1");
		expect(release1).toBeTypeOf("function");

		const release2 = acquireStateLock(TEST_DIR, "session-2");
		expect(release2).toBeNull();

		release1!();

		const release3 = acquireStateLock(TEST_DIR, "session-3");
		expect(release3).toBeTypeOf("function");
		release3!();
	});

	it("preserves rapid async task updates", () => {
		const tasks = Array.from({ length: 5 }).map((_, i) => ({
			taskId: `task-${i}`,
			agentCount: 2,
			startedAt: Date.now(),
			status: "running" as const,
		}));

		for (const task of tasks) {
			recordAsyncTask(TEST_DIR, task);
		}

		const stored = getPersistedAsyncTasks(TEST_DIR);
		expect(Object.keys(stored)).toHaveLength(5);
	});

	it("skips orphan worktree if .contextos-session belongs to a different repository fingerprint", async () => {
		const wtDir = path.join(TEST_DIR, ".swarm-worktrees", "other-repo-wt");
		fs.mkdirSync(wtDir, { recursive: true });
		fs.writeFileSync(
			path.join(wtDir, ".contextos-session"),
			JSON.stringify({ sessionId: "other-session", repositoryFingerprint: "fingerprint_of_another_repo" }),
		);

		const report = await scanOrphanWorktrees(TEST_DIR);
		expect(report.worktreeDirs).not.toContain(wtDir);
	});
});
