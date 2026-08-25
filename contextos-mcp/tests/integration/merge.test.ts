/**
 * Integration tests for merge functions using real temporary git repos.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeAllThreads, mergeThreadBranch } from "../../src/worktree/merge.js";

/** Create a real temporary git repo with an initial commit. */
function createTempRepo(): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-merge-test-"));
	execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.email", "test@swarm.dev"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: tmpDir });
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
	fs.writeFileSync(path.join(tmpDir, "shared.txt"), "line 1\nline 2\nline 3\n");
	execFileSync("git", ["add", "-A"], { cwd: tmpDir });
	execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });
	return tmpDir;
}

/** Create a branch with a commit modifying a specific file. */
function createBranchWithChange(
	repoDir: string,
	branchName: string,
	fileName: string,
	content: string,
	commitMsg: string,
): void {
	execFileSync("git", ["checkout", "-b", branchName], { cwd: repoDir });
	fs.writeFileSync(path.join(repoDir, fileName), content);
	execFileSync("git", ["add", "-A"], { cwd: repoDir });
	execFileSync("git", ["commit", "-m", commitMsg], { cwd: repoDir });
	execFileSync("git", ["checkout", "main"], { cwd: repoDir });
}

/** Build a mock ThreadState object with the required fields. */
function makeThread(id: string, branchName: string, overrides: Record<string, unknown> = {}): any {
	return {
		id,
		status: "completed",
		phase: "completed",
		branchName,
		result: { success: true, summary: "done", filesChanged: [], diffStats: "", durationMs: 100, estimatedCostUsd: 0 },
		completedAt: Date.now(),
		config: { id, task: "test", context: "", agent: { backend: "test", model: "test" } },
		attempt: 1,
		maxAttempts: 1,
		estimatedCostUsd: 0,
		...overrides,
	};
}

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
	tempDirs = [];
});

describe("mergeThreadBranch", () => {
	it("succeeds with a clean merge of non-conflicting changes", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		// Create a branch that adds a new file (no conflict with main)
		createBranchWithChange(
			repoDir,
			"swarm/thread-clean",
			"feature.ts",
			"export const feature = true;\n",
			"add feature",
		);

		const result = await mergeThreadBranch(repoDir, "swarm/thread-clean", "thread-clean");

		expect(result.success).toBe(true);
		expect(result.branch).toBe("swarm/thread-clean");
		expect(result.conflicts).toEqual([]);
		expect(result.conflictDiff).toBe("");

		// Verify the file actually exists on main after merge
		const merged = fs.readFileSync(path.join(repoDir, "feature.ts"), "utf-8");
		expect(merged).toContain("export const feature = true");
	});

	it("detects conflict when two branches modify the same line", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		// Create a branch that modifies shared.txt
		createBranchWithChange(
			repoDir,
			"swarm/thread-conflict",
			"shared.txt",
			"CONFLICT LINE\nline 2\nline 3\n",
			"modify shared on branch",
		);

		// Also modify shared.txt on main (same line)
		fs.writeFileSync(path.join(repoDir, "shared.txt"), "MAIN CHANGE\nline 2\nline 3\n");
		execFileSync("git", ["add", "-A"], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "modify shared on main"], { cwd: repoDir });

		const result = await mergeThreadBranch(repoDir, "swarm/thread-conflict", "thread-conflict");

		expect(result.success).toBe(false);
		expect(result.branch).toBe("swarm/thread-conflict");
		expect(result.conflicts).toContain("shared.txt");

		// Main should be in a clean state after abort
		const status = execFileSync("git", ["status", "--porcelain"], { cwd: repoDir }).toString().trim();
		expect(status).toBe("");
	});

	it("returns a failure result for a non-existent branch", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		const result = await mergeThreadBranch(repoDir, "swarm/nonexistent", "nonexistent");

		expect(result.success).toBe(false);
		expect(result.branch).toBe("swarm/nonexistent");
	});
});

describe("mergeAllThreads", () => {
	it("merges multiple non-conflicting branches in order", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		// Create two branches that change different files
		createBranchWithChange(repoDir, "swarm/thread-1", "file1.ts", "export const one = 1;\n", "add file1");
		createBranchWithChange(repoDir, "swarm/thread-2", "file2.ts", "export const two = 2;\n", "add file2");

		const threads = [
			makeThread("thread-1", "swarm/thread-1", { completedAt: 1000 }),
			makeThread("thread-2", "swarm/thread-2", { completedAt: 2000 }),
		];

		const results = await mergeAllThreads(repoDir, threads);

		expect(results).toHaveLength(2);
		expect(results[0].success).toBe(true);
		expect(results[0].branch).toBe("swarm/thread-1");
		expect(results[1].success).toBe(true);
		expect(results[1].branch).toBe("swarm/thread-2");

		// Both files should exist on main
		expect(fs.existsSync(path.join(repoDir, "file1.ts"))).toBe(true);
		expect(fs.existsSync(path.join(repoDir, "file2.ts"))).toBe(true);
	});

	it("respects custom merge order", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		createBranchWithChange(repoDir, "swarm/alpha", "alpha.ts", "export const alpha = 'a';\n", "add alpha");
		createBranchWithChange(repoDir, "swarm/beta", "beta.ts", "export const beta = 'b';\n", "add beta");
		createBranchWithChange(repoDir, "swarm/gamma", "gamma.ts", "export const gamma = 'g';\n", "add gamma");

		const threads = [
			makeThread("alpha", "swarm/alpha", { completedAt: 1000 }),
			makeThread("beta", "swarm/beta", { completedAt: 2000 }),
			makeThread("gamma", "swarm/gamma", { completedAt: 3000 }),
		];

		// Request reverse order: gamma, beta, alpha
		const results = await mergeAllThreads(repoDir, threads, {
			order: ["gamma", "beta", "alpha"],
		});

		expect(results).toHaveLength(3);
		expect(results[0].branch).toBe("swarm/gamma");
		expect(results[1].branch).toBe("swarm/beta");
		expect(results[2].branch).toBe("swarm/alpha");
		expect(results.every((r) => r.success)).toBe(true);
	});

	it("skips non-completed threads", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		createBranchWithChange(
			repoDir,
			"swarm/completed-thread",
			"done.ts",
			"export const done = true;\n",
			"completed work",
		);
		createBranchWithChange(
			repoDir,
			"swarm/running-thread",
			"running.ts",
			"export const running = true;\n",
			"in-progress work",
		);
		createBranchWithChange(repoDir, "swarm/failed-thread", "failed.ts", "export const failed = true;\n", "failed work");

		const threads = [
			makeThread("completed-thread", "swarm/completed-thread"),
			makeThread("running-thread", "swarm/running-thread", { status: "running" }),
			makeThread("failed-thread", "swarm/failed-thread", {
				status: "completed",
				result: {
					success: false,
					summary: "failed",
					filesChanged: [],
					diffStats: "",
					durationMs: 100,
					estimatedCostUsd: 0,
				},
			}),
		];

		const results = await mergeAllThreads(repoDir, threads);

		// Only the completed+successful thread should be merged
		expect(results).toHaveLength(1);
		expect(results[0].branch).toBe("swarm/completed-thread");
		expect(results[0].success).toBe(true);

		// Only the completed file should exist on main
		expect(fs.existsSync(path.join(repoDir, "done.ts"))).toBe(true);
		expect(fs.existsSync(path.join(repoDir, "running.ts"))).toBe(false);
		expect(fs.existsSync(path.join(repoDir, "failed.ts"))).toBe(false);
	});

	it("continues merging after a conflict by default (continueOnConflict=true)", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		// Branch that will conflict with main
		createBranchWithChange(
			repoDir,
			"swarm/conflict-thread",
			"shared.txt",
			"BRANCH CONFLICT\nline 2\nline 3\n",
			"conflict change",
		);

		// Branch that will merge cleanly
		createBranchWithChange(repoDir, "swarm/clean-thread", "clean.ts", "export const clean = true;\n", "clean change");

		// Modify shared.txt on main to create conflict
		fs.writeFileSync(path.join(repoDir, "shared.txt"), "MAIN CONFLICT\nline 2\nline 3\n");
		execFileSync("git", ["add", "-A"], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "main conflict change"], { cwd: repoDir });

		const threads = [
			makeThread("conflict-thread", "swarm/conflict-thread", { completedAt: 1000 }),
			makeThread("clean-thread", "swarm/clean-thread", { completedAt: 2000 }),
		];

		const results = await mergeAllThreads(repoDir, threads);

		expect(results).toHaveLength(2);
		expect(results[0].success).toBe(false); // conflict
		expect(results[0].conflicts).toContain("shared.txt");
		expect(results[1].success).toBe(true); // clean merge proceeded

		// Clean file should be on main
		expect(fs.existsSync(path.join(repoDir, "clean.ts"))).toBe(true);
	});

	it("stops on first conflict when continueOnConflict is false", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		createBranchWithChange(
			repoDir,
			"swarm/conflict-first",
			"shared.txt",
			"BRANCH VALUE\nline 2\nline 3\n",
			"conflict on branch",
		);
		createBranchWithChange(repoDir, "swarm/clean-second", "other.ts", "export const other = true;\n", "other change");

		// Create conflict on main
		fs.writeFileSync(path.join(repoDir, "shared.txt"), "MAIN VALUE\nline 2\nline 3\n");
		execFileSync("git", ["add", "-A"], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "main conflict"], { cwd: repoDir });

		const threads = [
			makeThread("conflict-first", "swarm/conflict-first", { completedAt: 1000 }),
			makeThread("clean-second", "swarm/clean-second", { completedAt: 2000 }),
		];

		const results = await mergeAllThreads(repoDir, threads, {
			continueOnConflict: false,
		});

		// Should stop after the first conflict
		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
		expect(results[0].branch).toBe("swarm/conflict-first");

		// The clean branch should NOT have been merged
		expect(fs.existsSync(path.join(repoDir, "other.ts"))).toBe(false);
	});

	it("returns empty results when no threads are eligible", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		const threads = [
			makeThread("pending", "swarm/pending", { status: "pending" }),
			makeThread("failed", "swarm/failed", { status: "failed" }),
		];

		const results = await mergeAllThreads(repoDir, threads);
		expect(results).toEqual([]);
	});

	it("merges in completion order by default (earliest first)", async () => {
		const repoDir = createTempRepo();
		tempDirs.push(repoDir);

		createBranchWithChange(repoDir, "swarm/late", "late.ts", "export const late = true;\n", "late commit");
		createBranchWithChange(repoDir, "swarm/early", "early.ts", "export const early = true;\n", "early commit");

		const threads = [
			makeThread("late", "swarm/late", { completedAt: 5000 }),
			makeThread("early", "swarm/early", { completedAt: 1000 }),
		];

		const results = await mergeAllThreads(repoDir, threads);

		expect(results).toHaveLength(2);
		// "early" should be merged first despite being second in the array
		expect(results[0].branch).toBe("swarm/early");
		expect(results[1].branch).toBe("swarm/late");
	});
});
