import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ReviewStatus, ThreadState, VerificationStatus } from "../../src/core/types.js";
import { createRepositoryFingerprint } from "../../src/worktree/manager.js";
import { isEligibleForMerge, mergeAllThreads, mergeThreadBranch } from "../../src/worktree/merge.js";

function createValidThread(overrides: Partial<ThreadState> = {}): ThreadState {
	const defaultSubject = {
		repositoryFingerprint: "repo-fp-12345",
		baseSha: "base-sha-12345",
		headSha: "head-sha-12345",
		diffSha256: "diff-sha-12345",
		scopeSha256: "scope-sha-12345",
	};

	return {
		id: "thread-test-1",
		config: {
			id: "thread-test-1",
			task: "Add feature",
			writeScope: ["."],
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
		verificationAttestation: {
			schemaVersion: 1,
			status: "PASS",
			evidence: {
				exitCode: 0,
				signal: null,
				outputSha256: "sha256-output-valid-digest",
				redactedPreview: "All 1 test passed",
				totalTests: 1,
				passedTests: 1,
				failedTests: 0,
			},
			subject: { ...defaultSubject },
			runnerMode: "host-unsafe",
		},
		reviewAttestation: {
			schemaVersion: 1,
			status: "PASS",
			llmVerdict: {
				specCompliance: "PASS",
				codeQuality: "PASS",
				summary: "All requirements met and clean design",
			},
			subject: { ...defaultSubject },
			implementerExecutionId: "impl-1",
			reviewerExecutionId: "rev-1",
			provider: "mock-provider",
			model: "mock-model",
			independenceLevel: "separate_process",
			rawOutputDigest: "sha256-review-valid-digest",
			retries: 0,
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
		const pending = createValidThread({ verificationAttestation: undefined });
		const failed = createValidThread({
			verificationAttestation: {
				schemaVersion: 1,
				status: "FAIL",
				evidence: {
					exitCode: 1,
					outputSha256: "dig",
					redactedPreview: "",
					totalTests: 1,
					passedTests: 0,
					failedTests: 1,
					signal: null,
				},
				subject: {
					repositoryFingerprint: "repo-fp-12345",
					baseSha: "base-sha-12345",
					headSha: "head-sha-12345",
					diffSha256: "diff-sha-12345",
					scopeSha256: "scope-sha-12345",
				},
				runnerMode: "host-unsafe",
			},
		});

		expect(isEligibleForMerge(pending).eligible).toBe(false);
		expect(isEligibleForMerge(failed).eligible).toBe(false);
	});

	it("rejects threads missing review verdict", () => {
		const thread = createValidThread({ reviewAttestation: undefined });
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("independent reviewer gate");
	});

	it("rejects threads where specCompliance is FAIL", () => {
		const thread = createValidThread();
		thread.reviewAttestation!.llmVerdict = {
			specCompliance: "FAIL",
			codeQuality: "PASS",
			summary: "Missed objective",
		};
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("specCompliance is FAIL");
	});

	it("rejects threads where codeQuality is FAIL", () => {
		const thread = createValidThread();
		thread.reviewAttestation!.llmVerdict = {
			specCompliance: "PASS",
			codeQuality: "FAIL",
			summary: "Contains placeholders",
		};
		const check = isEligibleForMerge(thread);
		expect(check.eligible).toBe(false);
		expect(check.reason).toContain("codeQuality is FAIL");
	});

	describe("Verification Negative Status Matrix", () => {
		const negativeStatuses: VerificationStatus[] = [
			"NOT_CONFIGURED",
			"UNAVAILABLE",
			"MALFORMED",
			"STALE",
			"PENDING",
			"RUNNING",
			"FAIL",
			"ERROR",
			"TIMEOUT",
		];

		for (const negStatus of negativeStatuses) {
			it(`rejects verification status "${negStatus}"`, () => {
				const thread = createValidThread();
				thread.verificationAttestation!.status = negStatus;
				const check = isEligibleForMerge(thread);
				expect(check.eligible).toBe(false);
				expect(check.reason).toContain(`Verification status is not PASS. Status is "${negStatus}"`);
			});
		}
	});

	describe("Review Negative Status Matrix", () => {
		const negativeStatuses: ReviewStatus[] = [
			"NOT_CONFIGURED",
			"UNAVAILABLE",
			"MALFORMED",
			"STALE",
			"PENDING",
			"RUNNING",
			"FAIL",
			"ERROR",
			"TIMEOUT",
		];

		for (const negStatus of negativeStatuses) {
			it(`rejects review status "${negStatus}"`, () => {
				const thread = createValidThread();
				thread.reviewAttestation!.status = negStatus;
				const check = isEligibleForMerge(thread);
				expect(check.eligible).toBe(false);
				expect(check.reason).toContain(`Review status is not PASS. Status is "${negStatus}"`);
			});
		}
	});

	describe("Evidence Verification", () => {
		it("rejects verification attestation without evidence or empty outputSha256", () => {
			const noEvidence = createValidThread();
			delete (noEvidence.verificationAttestation as any).evidence;
			expect(isEligibleForMerge(noEvidence).eligible).toBe(false);

			const emptyDigest = createValidThread();
			emptyDigest.verificationAttestation!.evidence!.outputSha256 = "";
			const check = isEligibleForMerge(emptyDigest);
			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("outputSha256 digest required");
		});

		it("rejects review attestation without rawOutputDigest", () => {
			const emptyDigest = createValidThread();
			emptyDigest.reviewAttestation!.rawOutputDigest = "   ";
			const check = isEligibleForMerge(emptyDigest);
			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("rawOutputDigest digest required");
		});
	});

	describe("Subject Consistency & Candidate Binding", () => {
		it("rejects mismatch between verification and review headSha", () => {
			const thread = createValidThread();
			thread.reviewAttestation!.subject.headSha = "different-head-sha";
			const check = isEligibleForMerge(thread);
			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("Subject headSha mismatch");
		});

		it("rejects mismatch between verification and review diffSha256", () => {
			const thread = createValidThread();
			thread.reviewAttestation!.subject.diffSha256 = "different-diff-sha";
			const check = isEligibleForMerge(thread);
			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("Subject diffSha256 mismatch");
		});

		it("rejects mismatch between verification and review repositoryFingerprint", () => {
			const thread = createValidThread();
			thread.reviewAttestation!.subject.repositoryFingerprint = "different-repo-fp";
			const check = isEligibleForMerge(thread);
			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("Subject repositoryFingerprint mismatch");
		});

		it("marks attestations STALE and rejects if candidate headSha changed after PASS", () => {
			const thread = createValidThread();
			expect(thread.verificationAttestation!.status).toBe("PASS");
			expect(thread.reviewAttestation!.status).toBe("PASS");

			const check = isEligibleForMerge(thread, {
				currentHeadSha: "new-amended-head-sha",
				currentDiffSha256: thread.verificationAttestation!.subject.diffSha256,
				repositoryFingerprint: thread.verificationAttestation!.subject.repositoryFingerprint,
			});

			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("attestation is STALE");
			expect(thread.verificationAttestation!.status).toBe("STALE");
			expect(thread.reviewAttestation!.status).toBe("STALE");
			expect(thread.verificationStatus).toBe("STALE");
			expect(thread.reviewStatus).toBe("STALE");
			expect(thread.mergeStatus).toBe("BLOCKED");
		});

		it("marks attestations STALE and rejects if candidate diffSha256 changed after PASS", () => {
			const thread = createValidThread();
			const check = isEligibleForMerge(thread, {
				currentHeadSha: thread.verificationAttestation!.subject.headSha,
				currentDiffSha256: "new-diff-sha-different",
				repositoryFingerprint: thread.verificationAttestation!.subject.repositoryFingerprint,
			});

			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("attestation is STALE");
			expect(thread.verificationAttestation!.status).toBe("STALE");
			expect(thread.reviewAttestation!.status).toBe("STALE");
		});

		it("rejects if candidate repositoryFingerprint mismatches", () => {
			const thread = createValidThread();
			const check = isEligibleForMerge(thread, {
				currentHeadSha: thread.verificationAttestation!.subject.headSha,
				currentDiffSha256: thread.verificationAttestation!.subject.diffSha256,
				repositoryFingerprint: "foreign-repo-fingerprint",
			});

			expect(check.eligible).toBe(false);
			expect(check.reason).toContain("Repository fingerprint mismatch");
		});
	});

	describe("Git Integration (mergeThreadBranch & mergeAllThreads)", () => {
		it("blocks mergeThreadBranch when ineligible threadState is passed", async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-merge-"));
			try {
				execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
				execFileSync("git", ["config", "user.email", "test@strict.dev"], { cwd: tmpDir });
				execFileSync("git", ["config", "user.name", "Strict Test"], { cwd: tmpDir });
				fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
				execFileSync("git", ["add", "."], { cwd: tmpDir });
				execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

				const ineligible = createValidThread({
					verificationAttestation: {
						schemaVersion: 1,
						status: "FAIL",
						evidence: {
							exitCode: 1,
							signal: null,
							outputSha256: "hash",
							redactedPreview: "failed",
							totalTests: 1,
							passedTests: 0,
							failedTests: 1,
						},
						subject: {
							repositoryFingerprint: "fp",
							baseSha: "base",
							headSha: "head",
							diffSha256: "diff",
							scopeSha256: "scope",
						},
						runnerMode: "host-unsafe",
					},
				});
				const res = await mergeThreadBranch(tmpDir, "swarm/thread-test-1", "thread-test-1", ineligible);

				expect(res.success).toBe(false);
				expect(res.message).toContain("blocked by strict merge predicate");
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("detects live candidate amend in branch and blocks merge in mergeThreadBranch", async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-merge-live-"));
			try {
				execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
				execFileSync("git", ["config", "user.email", "test@strict.dev"], { cwd: tmpDir });
				execFileSync("git", ["config", "user.name", "Strict Test"], { cwd: tmpDir });
				fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
				execFileSync("git", ["add", "."], { cwd: tmpDir });
				execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });
				const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir, encoding: "utf-8" }).trim();

				// Create branch
				execFileSync("git", ["checkout", "-b", "swarm/thread-live"], { cwd: tmpDir });
				fs.writeFileSync(path.join(tmpDir, "live.txt"), "v1\n");
				execFileSync("git", ["add", "."], { cwd: tmpDir });
				execFileSync("git", ["commit", "-m", "v1 commit"], { cwd: tmpDir });
				const verifiedHeadSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir, encoding: "utf-8" }).trim();
				const verifiedDiff = execFileSync("git", ["diff", `${baseSha}...HEAD`], { cwd: tmpDir, encoding: "utf-8" });
				const verifiedDiffSha256 = createHash("sha256").update(verifiedDiff).digest("hex");
				const repoFp = createRepositoryFingerprint(tmpDir);

				const thread = createValidThread({
					id: "thread-live",
					branchName: "swarm/thread-live",
					verificationAttestation: {
						schemaVersion: 1,
						status: "PASS",
						evidence: { exitCode: 0, signal: null, outputSha256: "dig", redactedPreview: "" },
						subject: {
							repositoryFingerprint: repoFp,
							baseSha,
							headSha: verifiedHeadSha,
							diffSha256: verifiedDiffSha256,
							scopeSha256: "scope",
						},
						runnerMode: "host-unsafe",
					},
					reviewAttestation: {
						schemaVersion: 1,
						status: "PASS",
						llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "ok" },
						subject: {
							repositoryFingerprint: repoFp,
							baseSha,
							headSha: verifiedHeadSha,
							diffSha256: verifiedDiffSha256,
							scopeSha256: "scope",
						},
						implementerExecutionId: "1",
						reviewerExecutionId: "2",
						provider: "prov",
						model: "mod",
						independenceLevel: "separate_process",
						rawOutputDigest: "dig",
						retries: 0,
					},
				});

				// Amend the commit after gates passed!
				fs.writeFileSync(path.join(tmpDir, "live.txt"), "v2 modified without re-verification\n");
				execFileSync("git", ["add", "."], { cwd: tmpDir });
				execFileSync("git", ["commit", "--amend", "-m", "v2 amended"], { cwd: tmpDir });
				execFileSync("git", ["checkout", "main"], { cwd: tmpDir });

				const res = await mergeThreadBranch(tmpDir, "swarm/thread-live", "thread-live", thread);
				expect(res.success).toBe(false);
				expect(res.message).toContain("attestation is STALE");
				expect(thread.verificationAttestation!.status).toBe("STALE");
				expect(thread.reviewAttestation!.status).toBe("STALE");
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
				const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir, encoding: "utf-8" }).trim();

				// Create a branch for the valid thread
				execFileSync("git", ["checkout", "-b", "swarm/valid-1"], { cwd: tmpDir });
				fs.writeFileSync(path.join(tmpDir, "valid.txt"), "valid\n");
				execFileSync("git", ["add", "."], { cwd: tmpDir });
				execFileSync("git", ["commit", "-m", "add valid"], { cwd: tmpDir });
				const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir, encoding: "utf-8" }).trim();
				const diff = execFileSync("git", ["diff", `${baseSha}...HEAD`], { cwd: tmpDir, encoding: "utf-8" });
				const diffSha256 = createHash("sha256").update(diff).digest("hex");
				const repoFp = createRepositoryFingerprint(tmpDir);
				execFileSync("git", ["checkout", "main"], { cwd: tmpDir });

				const validThread = createValidThread({
					id: "valid-1",
					branchName: "swarm/valid-1",
					verificationAttestation: {
						schemaVersion: 1,
						status: "PASS",
						evidence: { exitCode: 0, signal: null, outputSha256: "valid-out", redactedPreview: "" },
						subject: {
							repositoryFingerprint: repoFp,
							baseSha,
							headSha,
							diffSha256,
							scopeSha256: "scope",
						},
						runnerMode: "host-unsafe",
					},
					reviewAttestation: {
						schemaVersion: 1,
						status: "PASS",
						llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "ok" },
						subject: {
							repositoryFingerprint: repoFp,
							baseSha,
							headSha,
							diffSha256,
							scopeSha256: "scope",
						},
						implementerExecutionId: "1",
						reviewerExecutionId: "2",
						provider: "prov",
						model: "mod",
						independenceLevel: "separate_process",
						rawOutputDigest: "valid-dig",
						retries: 0,
					},
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

		it("blocks auto-merge for host-unsafe candidate unless user-local override is provided (W5.4)", () => {
			const hostUnsafeThread = createValidThread({
				verificationAttestation: {
					schemaVersion: 1,
					status: "PASS",
					evidence: { exitCode: 0, signal: null, outputSha256: "dig", redactedPreview: "" },
					subject: { repositoryFingerprint: "rfp", baseSha: "b", headSha: "h", diffSha256: "d", scopeSha256: "s" },
					runnerMode: "host-unsafe",
				},
				reviewAttestation: {
					schemaVersion: 1,
					status: "PASS",
					llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "ok" },
					subject: { repositoryFingerprint: "rfp", baseSha: "b", headSha: "h", diffSha256: "d", scopeSha256: "s" },
					implementerExecutionId: "1",
					reviewerExecutionId: "2",
					provider: "p",
					model: "m",
					independenceLevel: "separate_process",
					rawOutputDigest: "rod",
					retries: 0,
				},
			});

			// 1. Auto-merge blocked without override
			const autoCheck = isEligibleForMerge(hostUnsafeThread, { isAutoMerge: true });
			expect(autoCheck.eligible).toBe(false);
			expect(autoCheck.reason).toContain("Auto-merge blocked: candidate was verified in host-unsafe mode");

			// 2. Auto-merge allowed with genuine user-local override
			const userOverrideCheck = isEligibleForMerge(hostUnsafeThread, {
				isAutoMerge: true,
				userOverride: true,
				isFromRepoConfig: false,
			});
			expect(userOverrideCheck.eligible).toBe(true);

			// 3. Auto-merge strictly rejected when override comes from repo config
			const repoOverrideCheck = isEligibleForMerge(hostUnsafeThread, {
				isAutoMerge: true,
				userOverride: true,
				isFromRepoConfig: true,
			});
			expect(repoOverrideCheck.eligible).toBe(false);
			expect(repoOverrideCheck.reason).toContain(
				"repository configuration cannot enable host-unsafe auto-merge override",
			);

			// 4. OCI container verified candidate merges automatically without needing any override
			const ociThread = createValidThread({
				verificationAttestation: {
					schemaVersion: 1,
					status: "PASS",
					evidence: { exitCode: 0, signal: null, outputSha256: "dig", redactedPreview: "" },
					subject: { repositoryFingerprint: "rfp", baseSha: "b", headSha: "h", diffSha256: "d", scopeSha256: "s" },
					runnerMode: "oci",
				},
				reviewAttestation: {
					schemaVersion: 1,
					status: "PASS",
					llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "ok" },
					subject: { repositoryFingerprint: "rfp", baseSha: "b", headSha: "h", diffSha256: "d", scopeSha256: "s" },
					implementerExecutionId: "1",
					reviewerExecutionId: "2",
					provider: "p",
					model: "m",
					independenceLevel: "separate_process",
					rawOutputDigest: "rod",
					retries: 0,
				},
			});
			const ociAutoCheck = isEligibleForMerge(ociThread, { isAutoMerge: true });
			expect(ociAutoCheck.eligible).toBe(true);
		});
	});
});
