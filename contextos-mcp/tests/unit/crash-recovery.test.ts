import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ThreadState } from "../../src/core/types.js";
import { getPersistedThreads, reconcileSessionStateWithGit, savePersistedState } from "../../src/mcp/state.js";
import { isEligibleForMerge } from "../../src/worktree/merge.js";

function createMockThread(id: string, overrides: Partial<ThreadState> = {}): ThreadState {
	return {
		id,
		config: {
			id,
			task: "Test task", writeScope: ["."],
			context: "",
			agent: { backend: "mock", model: "test-model" },
		},
		status: "completed",
		phase: "completed",
		attempt: 1,
		maxAttempts: 1,
		estimatedCostUsd: 0.05,
		completedAt: Date.now(),
		verification: "PASS",
		review: {
			reviewerId: "rev-1",
			specCompliance: "PASS",
			codeQuality: "PASS",
			summary: "Passed",
			reviewedAt: Date.now(),
		},
		scopeViolation: false,
		...overrides,
	};
}

describe("Crash Recovery for Session State (Task 2.5d)", () => {
	it("reconciles running threads and preserves completed thread merge eligibility across restart", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-recov-"));
		try {
			execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.email", "recov@test.dev"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.name", "Recovery Test"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "README.md"), "# Recovery\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

			// Create a real worktree for thread-running
			const wtDir = path.join(tmpDir, ".swarm-worktrees", "wt-running");
			fs.mkdirSync(path.dirname(wtDir), { recursive: true });
			execFileSync("git", ["worktree", "add", "-b", "swarm/thread-running", wtDir], { cwd: tmpDir });

			const completedThread = createMockThread("thread-completed", {
				branchName: "swarm/thread-completed",
				result: {
					success: true,
					summary: "Finished cleanly",
					filesChanged: ["README.md"],
					diffStats: "1 file changed",
					durationMs: 100,
					estimatedCostUsd: 0.02,
				},
			});

			const runningThread = createMockThread("thread-running", {
				status: "running",
				phase: "agent_running",
				worktreePath: wtDir,
				branchName: "swarm/thread-running",
				result: undefined,
			});

			const deadThreadMissingWt = createMockThread("thread-dead", {
				status: "running",
				phase: "agent_running",
				worktreePath: path.join(tmpDir, ".swarm-worktrees", "wt-nonexistent"),
				branchName: "swarm/thread-dead",
			});

			// Save state as if written before a sudden crash
			savePersistedState(tmpDir, {
				dir: tmpDir,
				ownerPid: 99999999, // dead PID
				createdAt: Date.now() - 10000,
				lastUpdatedAt: Date.now() - 5000,
				sequence: 3,
				threads: {
					"thread-completed": completedThread,
					"thread-running": runningThread,
					"thread-dead": deadThreadMissingWt,
				},
			});

			// Reconcile on startup
			const reconciled = await reconcileSessionStateWithGit(tmpDir);
			expect(reconciled).not.toBeNull();

			const threads = getPersistedThreads(tmpDir);
			const comp = threads.find((t) => t.id === "thread-completed")!;
			const run = threads.find((t) => t.id === "thread-running")!;
			const dead = threads.find((t) => t.id === "thread-dead")!;

			// Completed thread preserved with merge eligibility
			expect(comp.status).toBe("completed");
			expect(comp.verification).toBe("PASS");
			expect(comp.review?.specCompliance).toBe("PASS");
			expect(isEligibleForMerge(comp).eligible).toBe(true);

			// Running thread with live git worktree reconciled to interrupted
			expect(run.status).toBe("interrupted");
			expect(run.phase).toBe("interrupted");
			expect(run.error).toContain("interrupted");

			// Running thread with missing worktree marked as needs_recovery
			expect(dead.status).toBe("needs_recovery");
			expect(dead.phase).toBe("needs_recovery");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
