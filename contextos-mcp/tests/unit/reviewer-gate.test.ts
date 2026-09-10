import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { TaskBrief } from "../../src/core/types.js";
import "../../src/agents/mock.js";
import {
	evaluateReviewerGate,
	resolveReviewerAgent,
	reviewCombinedStaging,
} from "../../src/orchestration/reviewer-gate.js";
import {
	buildCombinedStagingReviewPrompt,
	buildReviewerUserPrompt,
	getReviewerSystemPrompt,
} from "../../src/orchestration/reviewer-prompt.js";

function createTaskBrief(overrides: Partial<TaskBrief> = {}): TaskBrief {
	return {
		taskId: "task-test-42",
		baseSha: "abc1234",
		objective: "Implement calculation logic",
		writeScope: ["src/calc.ts"],
		testCommand: "npm test",
		expectedResult: "All tests green",
		maxAttempts: 2,
		...overrides,
	};
}

describe("Reviewer Prompts & Formatting", () => {
	it("generates system prompt containing dual verdict requirements", () => {
		const prompt = getReviewerSystemPrompt();
		expect(prompt).toContain("specCompliance");
		expect(prompt).toContain("codeQuality");
		expect(prompt).toContain("writeScope");
	});

	it("generates user prompt with brief and diff details", () => {
		const brief = createTaskBrief();
		const prompt = buildReviewerUserPrompt({
			taskBrief: brief,
			diff: "+ export function add(a, b) { return a + b; }",
			filesChanged: ["src/calc.ts"],
			verificationVerdict: "PASS",
			testOutput: "Tests: 1 passed",
		});
		expect(prompt).toContain("task-test-42");
		expect(prompt).toContain("src/calc.ts");
		expect(prompt).toContain("Automated Verification: PASS");
		expect(prompt).toContain("export function add");
	});

	it("formats combined staging prompt", () => {
		const prompt = buildCombinedStagingReviewPrompt("baseSha123", "staging-branch", "+ const a = 1;", [
			"Task 1: add a",
		]);
		expect(prompt).toContain("baseSha123");
		expect(prompt).toContain("staging-branch");
		expect(prompt).toContain("Task 1: add a");
	});
});

describe("Independent Reviewer Gate (Task 2.3)", () => {
	it("enforces Reviewer != Implementer policy", () => {
		const reviewer = resolveReviewerAgent("opencode", undefined);
		expect(reviewer).not.toBe("opencode");
	});

	it("rejects when filesChanged violates writeScope", async () => {
		const brief = createTaskBrief({ writeScope: ["src/calc.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+ file modified",
			filesChanged: ["src/secret.ts"],
			verificationVerdict: "PASS",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("violates declared writeScope");
	});

	it("rejects when verificationVerdict is FAIL", async () => {
		const brief = createTaskBrief({ writeScope: ["src/calc.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+ const x = 1;",
			filesChanged: ["src/calc.ts"],
			verificationVerdict: "FAIL",
			testOutput: "SyntaxError: Unexpected token",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("automated verification test command failed");
	});

	it("rejects when diff contains lazy placeholder stubs", async () => {
		const brief = createTaskBrief({ writeScope: ["src/calc.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+ // TODO: implement later\n+ return null;",
			filesChanged: ["src/calc.ts"],
			verificationVerdict: "PASS",
		});

		expect(verdict.specCompliance).toBe("FAIL");
		expect(verdict.codeQuality).toBe("FAIL");
		expect(verdict.summary).toContain("lazy stub placeholders");
	});

	it("passes when diff is clean and complies with scope and verification", async () => {
		const brief = createTaskBrief({ writeScope: ["src/calc.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+ export function add(a: number, b: number): number { return a + b; }",
			filesChanged: ["src/calc.ts"],
			verificationVerdict: "PASS",
			implementerAgent: "mock",
		});

		expect(verdict.specCompliance).toBe("PASS");
		expect(verdict.codeQuality).toBe("PASS");
		expect(verdict.summary).toContain("passed");
	});
});

describe("Combined Staging Review (Task 2.5f)", () => {
	it("audits clean combined staging branch", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-review-"));
		try {
			execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.email", "audit@test.dev"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.name", "Audit Test"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "README.md"), "# Init\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "init commit"], { cwd: tmpDir });
			const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir }).toString().trim();

			execFileSync("git", ["checkout", "-b", "staging"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "feature.ts"), "export const ok = true;\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "staging commit"], { cwd: tmpDir });

			const verdict = await reviewCombinedStaging({
				repoRoot: tmpDir,
				baseSha,
				stagingBranch: "staging",
				taskSummaries: ["Task 1: complete feature"],
			});

			expect(verdict.specCompliance).toBe("PASS");
			expect(verdict.codeQuality).toBe("PASS");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("rejects staging branch containing placeholders", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-reject-"));
		try {
			execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.email", "audit@test.dev"], { cwd: tmpDir });
			execFileSync("git", ["config", "user.name", "Audit Test"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "README.md"), "# Init\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "init commit"], { cwd: tmpDir });
			const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpDir }).toString().trim();

			execFileSync("git", ["checkout", "-b", "staging"], { cwd: tmpDir });
			fs.writeFileSync(path.join(tmpDir, "feature.ts"), "// TODO: implement later\n");
			execFileSync("git", ["add", "."], { cwd: tmpDir });
			execFileSync("git", ["commit", "-m", "staging commit with stubs"], { cwd: tmpDir });

			const verdict = await reviewCombinedStaging({
				repoRoot: tmpDir,
				baseSha,
				stagingBranch: "staging",
			});

			expect(verdict.specCompliance).toBe("FAIL");
			expect(verdict.codeQuality).toBe("FAIL");
			expect(verdict.summary).toContain("lazy placeholder stubs");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("fails closed with UNAVAILABLE when requested reviewer is missing", async () => {
		const brief = createTaskBrief({ writeScope: ["src/calc.ts"] });
		const verdict = await evaluateReviewerGate({
			taskBrief: brief,
			diff: "+ export function add() { return 1; }",
			filesChanged: ["src/calc.ts"],
			verificationVerdict: "PASS",
			reviewerAgent: "non-existent-agent-xyz",
			workDir: process.cwd(),
		});

		expect(verdict.specCompliance).toBe("UNAVAILABLE");
		expect(verdict.codeQuality).toBe("UNAVAILABLE");
		expect(verdict.summary).toContain("not registered or available");
	});

	it("combined staging fails closed with UNAVAILABLE when requested reviewer is missing", async () => {
		const verdict = await reviewCombinedStaging({
			repoRoot: process.cwd(),
			baseSha: "HEAD~1",
			stagingBranch: "HEAD",
			reviewerAgent: "non-existent-agent-xyz",
		});

		expect(verdict.specCompliance).toBe("UNAVAILABLE");
		expect(verdict.codeQuality).toBe("UNAVAILABLE");
		expect(verdict.summary).toContain("not available");
	});
});
