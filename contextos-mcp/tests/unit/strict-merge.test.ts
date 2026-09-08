import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ThreadState } from "../../src/core/types.js";
import { isEligibleForMerge, mergeAllThreads, mergeThreadBranch } from "../../src/worktree/merge.js";

function createValidThread(overrides: Partial<ThreadState> = {}): ThreadState {
	return {
		id: "thread-test-1",
		config: {
			id: "thread-test-1",
			task: "Add feature",
			context: "",
			agent: { backend: "mock", model: "mock-model" },
		},
		status: "completed",
		phase: "completed",
		branchName: "swarm/thread-test-1",
		result: {
			success: true,
			summary: "Done",
			filesChanged: ["feature.ts"],
			diffStats: "1 file changed",
			durationMs: 120,
			estimatedCostUsd: 0.01,
		},
		attempt: 1,
		maxAttempts: 1,
		estimatedCostUsd: 0.01,
		verification: "PASS",
		review: {
			reviewerId: "reviewer-audit-1",
			specCompliance: "PASS",
			codeQuality: "PASS",
			summary: "Clean implementation matching spec",
			reviewedAt: Date.now(),
		},
		scopeViolation: false,
		completedAt: Date.now(),
		...overrides,
	};
}

describe("Strict Merge Predicate (Task 2.4)", () => {
	it("approves threads that fulfill all criteria", () => {
		const thread = createValidThread();
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(true);
		expect(check.reason).toBeUndefined();
	});

	it("rejects threads with status != completed", () => {
		const running = createValidThread({ status: "running" });
		const failed = createValidThread({ status: "failed" });
		const verifying = createValidThread({ status: "verification_failed" });

		expect(isEligibleForMerge(running).eligible).toBe(false);
		expect(isEligibleForMerge(failed).eligible).toBe(false);
		expect(isEligibleForMerge(verifying).eligible).toBe(false);
	});

	it("rejects threads with result.success != true", () => {
		const thread = createValidThread({
			result: {
				success: false,
				summary: "Failed",
				filesChanged: [],
				diffStats: "",
				durationMs: 10,
				estimatedCostUsd: 0,
			},
		});
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("not successful");
	});

	it("rejects threads with scope violations", () => {
		const thread = createValidThread({ scopeViolation: true });
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("writeScope");
	});

	it("rejects threads with verification != PASS", () => {
		const pending = createValidThread({ verification: "PENDING" });
		const failed = createValidThread({ verification: "FAIL" });

		expect(isEligibleForMerge(pending).eligible).toBe(false);
		expect(isEligibleForMerge(failed).eligible).toBe(false);
	});

	it("rejects threads missing review verdict", () => {
		const thread = createValidThread({ review: undefined });
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("independent reviewer gate");
	});

	it("rejects threads where specCompliance is FAIL", () => {
		const thread = createValidThread({
			review: {
				reviewerId: "rev-1",
				specCompliance: "FAIL",
				codeQuality: "PASS",
				summary: "Missed objective",
				reviewedAt: Date.now(),
			},
		});
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("specCompliance");
	});

	it("rejects threads where codeQuality is FAIL", () => {
		const thread = createValidThread({
			review: {
				reviewerId: "rev-1",
				specCompliance: "PASS",
				codeQuality: "FAIL",
				summary: "Contains placeholders",
				reviewedAt: Date.now(),
			},
		});
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("codeQuality");
	});

	it("blocks mergeThreadBranch when ineligible threadState is passed", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-merge-"));
		try {
			execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.email", "test@strict.dev"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.name", "Strict Test"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

			const ineligible = createValidThread({ verification: "FAIL" });
			const res = await mergeThreadBranch(tmpDir, "swarm/thread-test-1", "thread-test-1", ineligible);

			expect(res.success).toBe(false);
			expect(res.message).toContain("blocked by strict merge predicate");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("filters out ineligible threads in mergeAllThreads", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-merge-all-"));
		try {
			execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.email", "test@strict.dev"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.name", "Strict Test"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

			// Create a branch for the valid thread
			execFileSync("git", ["checkout", "-b", "swarm/valid-1"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "valid.txt"), "valid\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "add valid"], { cwd: tmpDir });
			execFileSync("git", ["checkout", "main"], { cwd: tmpDir });

			const validThread = createValidThread({
				id: "valid-1",
				branchName: "swarm/valid-1",
			});
			const invalidThread = createValidThread({
				id: "invalid-1",
				branchName: "swarm/invalid-1",
				scopeViolation: true,
			});

			const results = await mergeAllThreads(tmpDir, [validThread, invalidThread]);
			// Only the valid thread should have been attempted
			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(true);
			expect(results[0].branch).toBe("swarm/valid-1");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
