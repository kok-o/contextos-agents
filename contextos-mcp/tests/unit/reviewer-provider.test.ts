/**
 * Unit tests for W5.5: Independent Reviewer Provider Pipeline & Anti-Forgery
 */

import { describe, expect, it } from "vitest";
import "../../src/agents/mock.js";
import type { TaskBrief } from "../../src/core/types.js";
import { evaluateReviewerGate, resolveReviewerAgent } from "../../src/orchestration/reviewer-gate.js";

function createBrief(overrides: Partial<TaskBrief> = {}): TaskBrief {
	return {
		id: "task-test",
		task: "Implement user profile API",
		writeScope: ["src/profile.ts"],
		model: "gpt-4o",
		...overrides,
	};
}

describe("Milestone W5.5: Independent Reviewer Provider Pipeline", () => {
	it("resolves distinct reviewer agent enforcing Reviewer != Implementer", () => {
		const reviewer = resolveReviewerAgent("mock");
		expect(reviewer).not.toBe("mock");
		expect(["mock-reviewer", "reviewer-independent", "opencode", "claude-code", "direct-llm", "aider"]).toContain(
			reviewer,
		);
	});

	it("completes successful independent review with real provider execution", async () => {
		const brief = createBrief();
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("PASS");
		expect(verdict.codeQuality).toBe("PASS");
		expect(verdict.reviewerId).toContain("mock-reviewer");
		expect(verdict.reviewedAt).toBeGreaterThan(0);
	});

	it("detects spec failure from reviewer output", async () => {
		const brief = createBrief({ task: "Task with __FAIL_SPEC__ flag" });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("PASS");
	});

	it("detects quality failure from reviewer output", async () => {
		const brief = createBrief({ task: "Task with __FAIL_QUALITY__ flag" });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("PASS");
		expect(verdict.codeQuality).toBe("FAIL");
	});

	it("fails-closed with MALFORMED when reviewer returns unparseable non-JSON output", async () => {
		const brief = createBrief({ task: "Task with __MALFORMED__ verdict" });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("MALFORMED");
		expect(verdict.codeQuality).toBe("MALFORMED");
		expect(verdict.summary).toContain("malformed or unparseable JSON verdict");
	});

	it("fails-closed with ERROR when reviewer execution fails", async () => {
		const brief = createBrief({ task: "Task with __ERROR__ failure" });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("ERROR");
		expect(verdict.codeQuality).toBe("ERROR");
	});

	it("fails-closed with UNAVAILABLE when reviewer agent is not registered", async () => {
		const brief = createBrief();
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = { name: 'Alice' };\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "non-existent-agent-provider-xyz",
		});

		expect(verdict.specCompliance).toBe("UNAVAILABLE");
		expect(verdict.codeQuality).toBe("UNAVAILABLE");
		expect(verdict.summary).toContain("not registered or available");
	});

	it("rejects forged PASS when diff contains prohibited lazy stubs (CODE-001)", async () => {
		const brief = createBrief();
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			// Diff contains lazy stub
			diff: "+// TODO: implement later\n+export const x = 1;\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("lazy stub placeholders");
	});

	it("rejects writeScope blast radius violations before running reviewer model (SCOPE-001)", async () => {
		const brief = createBrief({ writeScope: ["src/profile.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const secret = 1;\n",
			filesChanged: ["src/other.ts"], // Violation!
			verificationVerdict: "PASS",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("violates declared writeScope");
	});

	it("rejects review when automated test verification failed", async () => {
		const brief = createBrief();
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+export const profile = 1;\n",
			filesChanged: ["src/profile.ts"],
			verificationVerdict: "FAIL",
			testOutput: "Tests failed: 1 assertion error",
			implementerAgent: "mock",
			reviewerAgent: "mock-reviewer",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("automated verification test command failed");
	});
});
