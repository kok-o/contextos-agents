/**
 * Unit tests for session persistence and orphan management in contextos-mcp.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ThreadState } from "../../src/core/types.js";
import {
	clearPersistedState,
	getPersistedThreads,
	loadPersistedState,
	purgeOrphans,
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

	it("records and loads thread state from disk", () => {
		const thread: ThreadState = {
			id: "task-101_openai",
			config: {
				id: "task-101_openai",
				task: "Build user auth modal",
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

		const state = loadPersistedState(TEST_DIR);
		expect(state).not.toBeNull();
		expect(state?.dir).toBe(TEST_DIR);
		expect(state?.threads["task-101_openai"]).toBeDefined();
		expect(state?.threads["task-101_openai"].status).toBe("completed");

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
		expect(getPersistedThreads(TEST_DIR)).toHaveLength(0);
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
});
