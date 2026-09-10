import { describe, expect, it } from "vitest";
import type { ThreadState } from "../../src/core/types.js";
import { isEligibleForMerge } from "../../src/worktree/merge.js";

describe("Orthogonal Thread Status", () => {
	it("should allow merging when status is ready_for_merge", () => {
		const thread: ThreadState = {
			id: "test-thread",
			task: "Test",
			taskBrief: {
				writeScope: ["."],
				writeScopeDeny: [],
				testCommand: "",
			},
			attempt: 1,
			maxAttempts: 1,
			status: "completed",
			phase: "completed",
			verificationAttestation: {
				schemaVersion: 1,
				status: "PASS",
				evidence: {
					exitCode: 0,
					outputSha256: "",
					redactedPreview: "",
					totalTests: 1,
					passedTests: 1,
					failedTests: 0,
					signal: null,
				},
				subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
				runnerMode: "host-unsafe",
			},
			reviewAttestation: {
				schemaVersion: 1,
				status: "PASS",
				llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "" },
				subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
				implementerExecutionId: "1",
				reviewerExecutionId: "2",
				provider: "prov",
				model: "mod",
				independenceLevel: "separate_process",
				rawOutputDigest: "dig",
				retries: 0,
			},
			result: {
				success: true,
				summary: "Done",
				filesChanged: [],
				diffStats: "",
				durationMs: 100,
				estimatedCostUsd: 0.1,
				costIsEstimate: true,
			},
		};

		const eligibility = isEligibleForMerge(thread);
		expect(eligibility.eligible).toBe(true);
	});

	it("should block merging if requires_verification or requires_review", () => {
		const thread: ThreadState = {
			id: "test-thread",
			task: "Test",
			attempt: 1,
			maxAttempts: 1,
			status: "requires_verification",
			phase: "failed",
			verificationAttestation: undefined,
			review: {
				specCompliance: "NOT_CONFIGURED",
				codeQuality: "NOT_CONFIGURED",
				summary: "No review",
			},
			result: {
				success: true,
				summary: "Done",
				filesChanged: [],
				diffStats: "",
				durationMs: 100,
				estimatedCostUsd: 0.1,
				costIsEstimate: true,
			},
		};

		const eligibility = isEligibleForMerge(thread);
		expect(eligibility.eligible).toBe(false);

		// Manual override of all required gates
		thread.status = "completed";
		thread.verificationAttestation = {
			status: "PASS",
			evidence: {
				exitCode: 0,
				outputSha256: "",
				redactedPreview: "",
				totalTests: 1,
				passedTests: 1,
				failedTests: 0,
				signal: null,
			},
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			runnerMode: "host-unsafe",
			schemaVersion: 1,
		};
		thread.reviewAttestation = {
			schemaVersion: 1,
			status: "PASS",
			llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "" },
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			implementerExecutionId: "1",
			reviewerExecutionId: "2",
			provider: "prov",
			model: "mod",
			independenceLevel: "separate_process",
			rawOutputDigest: "dig",
			retries: 0,
		};
		const overriddenEligibility = isEligibleForMerge(thread);
		expect(overriddenEligibility.eligible).toBe(true);
	});
});
