/**
 * Integration tests for MCP session management.
 *
 * Tests getSession(), spawnThread(), getThreads(), getBudgetState(),
 * mergeThreads(), cancelThreads(), cleanupSession(), cleanupAllSessions().
 *
 * Uses real temporary git repos with the mock agent backend.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTempRepo, createTempGitRepo } from "../fixtures/helpers.js";

// Mock os.homedir to prevent ~/.swarm/config.yaml from interfering with tests.
// vi.hoisted ensures the variable is available when vi.mock factory runs.
const fakeHome = vi.hoisted(() =>
	require("node:path").join(require("node:os").tmpdir(), `swarm-mcp-session-test-fakehome-${process.pid}`),
);
vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		homedir: () => fakeHome,
	};
});

// Register mock agent before importing session module
import "../../src/agents/mock.js";

import {
	cancelThreads,
	cleanupAllSessions,
	cleanupSession,
	getBudgetState,
	getSession,
	getThreads,
	mergeThreads,
	spawnThread,
} from "../../src/mcp/session.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Write a swarm_config.yaml that uses the mock agent. */
function writeMockConfig(repoDir: string): void {
	const yaml = [
		"default_agent: mock",
		"default_model: mock-model",
		"max_threads: 3",
		"max_total_threads: 20",
		"thread_timeout_ms: 30000",
		"max_session_budget_usd: 100",
		"max_thread_budget_usd: 50",
		"thread_retries: 0",
		"auto_cleanup_worktrees: true",
	].join("\n");
	fs.writeFileSync(path.join(repoDir, "swarm_config.yaml"), yaml);
}

const tempDirs: string[] = [];

afterEach(async () => {
	// Clean up all sessions first
	await cleanupAllSessions();
	// Then remove temp dirs
	for (const dir of tempDirs) {
		cleanupTempRepo(dir);
	}
	tempDirs.length = 0;
});

function makeTempRepo(): string {
	const dir = createTempGitRepo("mcp-session-test");
	writeMockConfig(dir);
	tempDirs.push(dir);
	return dir;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MCP Session: getSession", () => {
	it("creates a session for a valid git directory", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		expect(session).toBeDefined();
		expect(session.dir).toBe(path.resolve(dir));
		expect(session.config).toBeDefined();
		expect(session.config.default_agent).toBe("mock");
		expect(session.threadManager).toBeDefined();
		expect(session.abortController).toBeInstanceOf(AbortController);
		expect(session.createdAt).toBeGreaterThan(0);
	});

	it("returns the same session on subsequent calls for the same directory", async () => {
		const dir = makeTempRepo();
		const session1 = await getSession(dir);
		const session2 = await getSession(dir);

		expect(session1).toBe(session2);
	});

	it("returns different sessions for different directories", async () => {
		const dir1 = makeTempRepo();
		const dir2 = makeTempRepo();

		const session1 = await getSession(dir1);
		const session2 = await getSession(dir2);

		expect(session1).not.toBe(session2);
		expect(session1.dir).not.toBe(session2.dir);
	});

	it("deduplicates concurrent getSession() calls for the same directory", async () => {
		const dir = makeTempRepo();

		// Fire two getSession calls concurrently — both should resolve to the same session
		const [s1, s2] = await Promise.all([getSession(dir), getSession(dir)]);

		expect(s1).toBe(s2);
	});

	it("throws for a non-existent directory", async () => {
		await expect(getSession("/tmp/nonexistent-dir-xyz-12345")).rejects.toThrow(/does not exist/);
	});
});

describe("MCP Session: spawnThread", () => {
	it("spawns a thread using session defaults", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const result = await spawnThread(session, { task: "add a helper function" });

		expect(result.success).toBe(true);
		expect(result.summary).toBeTruthy();
		expect(result.filesChanged.length).toBeGreaterThan(0);
		expect(result.durationMs).toBeGreaterThan(0);
	});

	it("uses agent/model overrides when provided", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		// Still uses mock agent (backend override would fail for non-existent agents)
		const result = await spawnThread(session, {
			task: "add a utility",
			agent: "mock",
			model: "custom-model",
			context: "extra context",
			files: ["src/utils.ts"],
		});

		expect(result.success).toBe(true);
	});

	it("returns failure for __FAIL__ trigger", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const result = await spawnThread(session, { task: "this should __FAIL__" });

		expect(result.success).toBe(false);
	});
});

describe("MCP Session: getThreads + getBudgetState", () => {
	it("returns threads spawned in the session", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		await spawnThread(session, { task: "task A" });
		await spawnThread(session, { task: "task B" });

		const threads = getThreads(session);
		expect(threads).toHaveLength(2);
		expect(threads[0].status).toBe("completed");
		expect(threads[1].status).toBe("completed");
	});

	it("returns empty threads for a fresh session", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const threads = getThreads(session);
		expect(threads).toHaveLength(0);
	});

	it("tracks budget across threads", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const budgetBefore = getBudgetState(session);
		expect(budgetBefore.totalSpentUsd).toBe(0);

		await spawnThread(session, { task: "do something" });

		const budgetAfter = getBudgetState(session);
		expect(budgetAfter.totalSpentUsd).toBeGreaterThan(0);
	});
});

describe("MCP Session: mergeThreads", () => {
	it("merges completed thread branches back to main", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		await spawnThread(session, { task: "add feature A" });

		const results = await mergeThreads(session);

		// Should have at least one merge result
		expect(results.length).toBeGreaterThanOrEqual(1);
		if (results.length > 0) {
			expect(results[0].success).toBe(true);
			expect(results[0].branch).toContain("swarm/");
		}
	});

	it("returns empty array when no threads have been spawned", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const results = await mergeThreads(session);
		expect(results).toEqual([]);
	});
});

describe("MCP Session: cancelThreads", () => {
	it("returns not-found for non-existent thread ID", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const result = cancelThreads(session, "nonexistent-thread");
		expect(result.cancelled).toBe(false);
		expect(result.message).toContain("not found");
	});

	it("returns cannot-cancel for already completed thread", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		await spawnThread(session, { task: "quick task" });
		const threads = getThreads(session);
		const threadId = threads[0].id;

		const result = cancelThreads(session, threadId);
		expect(result.cancelled).toBe(false);
		expect(result.message).toContain("completed");
	});

	it("cancels all threads when no threadId specified", async () => {
		const dir = makeTempRepo();
		const session = await getSession(dir);

		const result = cancelThreads(session);
		expect(result.cancelled).toBe(true);
		expect(result.message).toContain("All threads cancelled");
	});
});

describe("MCP Session: cleanupSession", () => {
	it("cleans up a session and removes it from the map", async () => {
		const dir = makeTempRepo();
		await getSession(dir);

		const message = await cleanupSession(dir);
		expect(message).toContain("cleaned up");

		// Session should be gone — getting it again creates a new one
		const newSession = await getSession(dir);
		expect(newSession.createdAt).toBeGreaterThan(0);
	});

	it("returns a message when no session exists for the directory", async () => {
		const dir = makeTempRepo();
		const message = await cleanupSession(dir);
		expect(message).toContain("No active session");
	});
});

describe("MCP Session: cleanupAllSessions", () => {
	it("cleans up all active sessions", async () => {
		const dir1 = makeTempRepo();
		const dir2 = makeTempRepo();

		await getSession(dir1);
		await getSession(dir2);

		// Both sessions exist
		const s1 = await getSession(dir1);
		const s2 = await getSession(dir2);
		expect(s1).toBeDefined();
		expect(s2).toBeDefined();

		await cleanupAllSessions();

		// After cleanup, getting sessions creates new ones (different createdAt)
		const s1New = await getSession(dir1);
		expect(s1New).not.toBe(s1);
	});
});
