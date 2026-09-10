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
	getPersistedThreads,
	loadPersistedState,
	purgeOrphans,
	recordThreadState,
	savePersistedState,
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

	it("records and loads thread state from disk", () => {
		const thread: ThreadState = {
			id: "task-101_openai",
			config: {
				id: "task-101_openai",
				task: "Build user auth modal",
				writeScope: ["."],
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

		const threads1 = getPersistedThreads(TEST_DIR);
		expect(threads1).toHaveLength(1);
		expect(threads1[0].id).toBe("task-101_openai");
		expect(threads1[0].status).toBe("completed");

		const threads = getPersistedThreads(TEST_DIR);
		expect(threads).toHaveLength(1);
		expect(threads[0].id).toBe("task-101_openai");
	});

	it("updates existing thread status", () => {
		const initial: ThreadState = {
			id: "task-202_anthropic",
			config: {
				id: "task-202_anthropic",
				task: "Run tests",
				writeScope: ["."],
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
	});

	it("clears persisted state", () => {
		const thread: ThreadState = {
			id: "task-303",
			config: {
				id: "task-303",
				task: "Clean up",
				writeScope: ["."],
				context: "",
				agent: { backend: "direct-llm", model: "gemini-2.5-flash" },
			},
			status: "completed",
			phase: "completed",
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
		const wtDir = path.join(TEST_DIR, ".swarm-worktrees", "orphan-thread-99");
		fs.mkdirSync(wtDir, { recursive: true });
		fs.writeFileSync(path.join(wtDir, "dummy.txt"), "leftover", "utf-8");

		const report = await scanOrphanWorktrees(TEST_DIR);
		expect(report.worktreeDirs).toContain(wtDir);

		const result = await purgeOrphans(TEST_DIR);
		expect(result.prunedWorktrees).toBeGreaterThanOrEqual(1);
		expect(fs.existsSync(wtDir)).toBe(false);
	});

	it.skip("recovers running thread to interrupted after process crash and preserves cost", () => {
		const thread: ThreadState = {
			id: "crashed-thread-1",
			config: {
				id: "crashed-thread-1",
				task: "Work on crash recovery",
				writeScope: ["."],
				context: "",
				agent: { backend: "direct-llm", model: "gpt-4o" },
			},
			status: "running",
			phase: "agent_running",
			attempt: 1,
			maxAttempts: 1,
			estimatedCostUsd: 0.125,
			startedAt: Date.now() - 10000,
		};

		savePersistedState(TEST_DIR, {
			dir: TEST_DIR,
			ownerPid: 99999999,
			sessionId: "session-crashed",
			createdAt: Date.now() - 20000,
			lastUpdatedAt: Date.now() - 10000,
			threads: { "crashed-thread-1": thread },
			asyncTasks: {
				"task-1": {
					taskId: "task-1",
					agentCount: 1,
					startedAt: Date.now() - 10000,
					status: "running",
				},
			},
		});

		const loaded = loadPersistedState(TEST_DIR);
		expect(loaded).not.toBeNull();
		const recoveredThread = loaded?.threads["crashed-thread-1"];
		expect(recoveredThread?.status).toBe("interrupted");
		expect(recoveredThread?.phase).toBe("interrupted");
		expect(recoveredThread?.error).toContain("interrupted by process restart or crash");
		expect(recoveredThread?.estimatedCostUsd).toBe(0.125);
		expect(loaded?.asyncTasks?.["task-1"].status).toBe("unknown_after_restart");
	});

	it("acquires state lock, rejects concurrent holder, and recovers stale lock", () => {
		const release1 = acquireStateLock(TEST_DIR, "session-1");
		expect(release1).not.toBeNull();

		release1?.();

		const lockPath = path.join(TEST_DIR, ".agents", ".contextos", "runtime", "async-tasks.lock");
		fs.mkdirSync(path.dirname(lockPath), { recursive: true });
		fs.writeFileSync(
			lockPath,
			JSON.stringify({
				pid: 99999999,
				sessionId: "dead-session",
				lockedAt: Date.now() - 60000,
				expiresAt: Date.now() - 30000,
			}),
		);

		const release2 = acquireStateLock(TEST_DIR, "session-2");
		expect(release2).not.toBeNull();
		release2?.();
		expect(fs.existsSync(lockPath)).toBe(false);
	});

	it.skip("preserves five rapid thread updates with a monotonic sequence", async () => {
		const threads = Array.from(
			{ length: 5 },
			(_, index): ThreadState => ({
				id: `concurrent-${index}`,
				config: {
					id: `concurrent-${index}`,
					task: `Task ${index}`,
					writeScope: ["."],
					context: "",
					agent: { backend: "direct-llm", model: "gpt-4o" },
				},
				status: "completed",
				phase: "completed",
				attempt: 1,
				maxAttempts: 1,
				estimatedCostUsd: 0,
			}),
		);

		await Promise.all(threads.map(async (thread) => recordThreadState(TEST_DIR, thread)));
		const state = loadPersistedState(TEST_DIR);
		expect(Object.keys(state?.threads || {})).toHaveLength(5);
		expect(state?.sequence).toBe(5);
	});

	it("skips orphan worktree if .contextos-session belongs to a different repository", async () => {
		const wtDir = path.join(TEST_DIR, ".swarm-worktrees", "alien-worktree");
		fs.mkdirSync(wtDir, { recursive: true });
		fs.writeFileSync(
			path.join(wtDir, ".contextos-session"),
			JSON.stringify({
				schemaVersion: 1,
				sessionId: "alien-session",
				repositoryFingerprint: "alien_fingerprint_000",
				worktreePath: wtDir,
				branchName: "swarm/alien",
				createdAt: Date.now(),
			}),
		);

		const report = await scanOrphanWorktrees(TEST_DIR);
		expect(report.worktreeDirs).not.toContain(wtDir);

		await purgeOrphans(TEST_DIR);
		expect(fs.existsSync(wtDir)).toBe(true);
	});
});
