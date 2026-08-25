import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CompressionInput, compressResult, setSummarizer } from "../../src/compression/compressor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a CompressionInput with sensible defaults; override per-test. */
function makeInput(overrides: Partial<CompressionInput> = {}): CompressionInput {
	return {
		agentOutput: "",
		diff: "",
		diffStats: "",
		filesChanged: [],
		success: true,
		durationMs: 1500,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// 1. Episode quality filter (tested indirectly via compressResult/structured)
// ---------------------------------------------------------------------------

describe("Episode quality filter (via compressResult)", () => {
	it("strips JS stack traces (  at Foo())", async () => {
		const input = makeInput({
			agentOutput: [
				"Some useful line",
				"  at Object.run (/app/index.js:10:5)",
				"  at Module._compile (node:internal/modules/cjs/loader:1376:14)",
				"After the trace",
			].join("\n"),
		});
		const result = await compressResult(input, "structured");
		expect(result).not.toContain("at Object.run");
		expect(result).not.toContain("Module._compile");
		expect(result).toContain("Some useful line");
		expect(result).toContain("After the trace");
	});

	it("strips Python Traceback line", async () => {
		const input = makeInput({
			agentOutput: ["Starting task", "Traceback (most recent call last):", "", "Completed the fix"].join("\n"),
		});
		const result = await compressResult(input, "structured");
		expect(result).not.toContain("Traceback");
		expect(result).toContain("Starting task");
		expect(result).toContain("Completed the fix");
	});

	it("preserves success signals", async () => {
		const signals = [
			"Applied edit to src/foo.ts",
			"\u2713 All tests passed",
			"PASS src/foo.test.ts",
			"Completed refactoring",
		];
		const input = makeInput({ agentOutput: signals.join("\n") });
		const result = await compressResult(input, "structured");
		for (const sig of signals) {
			expect(result).toContain(sig);
		}
	});

	it("strips failure noise lines", async () => {
		const noiseLines = ["error: cannot find module", "retrying request to API", "Thinking..."];
		const input = makeInput({
			agentOutput: ["Good line before", ...noiseLines, "Good line after"].join("\n"),
		});
		const result = await compressResult(input, "structured");
		expect(result).not.toContain("error: cannot find module");
		expect(result).not.toContain("retrying request");
		expect(result).not.toContain("Thinking...");
		expect(result).toContain("Good line before");
		expect(result).toContain("Good line after");
	});

	it("collapses blank lines to max 2 consecutive", async () => {
		const input = makeInput({
			agentOutput: "A\n\n\n\n\nB",
		});
		const result = await compressResult(input, "structured");
		// After filtering & collapsing, there should be at most 2 consecutive blank lines
		// between A and B in the agent output section
		expect(result).not.toMatch(/\n{4,}/); // 4+ newlines in a row would mean 3+ blank lines
	});

	it("returns result without agent output section when agentOutput is empty", async () => {
		const input = makeInput({ agentOutput: "" });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Status:");
		expect(result).not.toContain("Agent output");
	});
});

// ---------------------------------------------------------------------------
// 2. Structured strategy (default)
// ---------------------------------------------------------------------------

describe("structured strategy", () => {
	it("includes status line with SUCCESS and duration", async () => {
		const input = makeInput({ success: true, durationMs: 2500 });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Status: SUCCESS (2.5s)");
	});

	it("includes status line with FAILED and duration", async () => {
		const input = makeInput({ success: false, durationMs: 750 });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Status: FAILED (0.8s)");
	});

	it("lists files changed", async () => {
		const files = ["src/a.ts", "src/b.ts", "src/c.ts"];
		const input = makeInput({ filesChanged: files });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Files changed (3):");
		for (const f of files) {
			expect(result).toContain(`  - ${f}`);
		}
	});

	it("caps file list at 20 entries", async () => {
		const files = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`);
		const input = makeInput({ filesChanged: files });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Files changed (25):");
		expect(result).toContain("  - src/file19.ts");
		expect(result).not.toContain("  - src/file20.ts");
		expect(result).toContain("... and 5 more");
	});

	it("includes diff stats", async () => {
		const input = makeInput({ diffStats: " 3 files changed, 42 insertions(+), 7 deletions(-)" });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Diff stats:");
		expect(result).toContain("3 files changed");
	});

	it("does not include diff stats section when diffStats is '(no changes)'", async () => {
		const input = makeInput({ diffStats: "(no changes)" });
		const result = await compressResult(input, "structured");
		expect(result).not.toContain("Diff stats:");
	});

	it("includes truncated diff (40% budget)", async () => {
		const maxChars = 200;
		const longDiff = "x".repeat(500);
		const input = makeInput({ diff: longDiff });
		const result = await compressResult(input, "structured", maxChars);
		expect(result).toContain("Key changes:");
		// 40% of 200 = 80 chars for diff budget
		expect(result).toContain("... [diff truncated]");
		// The diff portion should be at most 80 chars of x's
		const keyChangesIdx = result.indexOf("Key changes:\n");
		const diffPortion = result.slice(keyChangesIdx + "Key changes:\n".length);
		const xCount = (diffPortion.match(/x/g) || []).length;
		expect(xCount).toBeLessThanOrEqual(Math.floor(maxChars * 0.4));
	});

	it("includes agent output tail (last 30 lines, 30% budget)", async () => {
		const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
		const input = makeInput({ agentOutput: lines.join("\n") });
		const result = await compressResult(input, "structured", 5000);
		expect(result).toContain("Agent output (last 30 lines):");
		// Should include line 50 (the last) but not line 1 (since only last 30 kept)
		expect(result).toContain("Line 50");
		expect(result).not.toContain("Line 1\n");
	});

	it("hard caps at 4x maxChars", async () => {
		const maxChars = 100;
		const hugeInput = makeInput({
			agentOutput: "a".repeat(1000),
			diff: "d".repeat(1000),
			diffStats: "s".repeat(200),
			filesChanged: Array.from({ length: 20 }, (_, i) => `file${i}.ts`),
		});
		const result = await compressResult(hugeInput, "structured", maxChars);
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + "... [compressed output truncated]".length + 1);
	});

	it("is the default strategy when none specified", async () => {
		const input = makeInput({
			success: true,
			durationMs: 1000,
			filesChanged: ["a.ts"],
			diff: "some diff",
		});
		const withDefault = await compressResult(input);
		const withStructured = await compressResult(input, "structured");
		expect(withDefault).toBe(withStructured);
	});
});

// ---------------------------------------------------------------------------
// 3. diff-only strategy
// ---------------------------------------------------------------------------

describe("diff-only strategy", () => {
	it("returns status + diff", async () => {
		const input = makeInput({
			success: true,
			durationMs: 3000,
			diff: "--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new",
		});
		const result = await compressResult(input, "diff-only");
		expect(result).toContain("Status: SUCCESS (3.0s)");
		expect(result).toContain("--- a/foo.ts");
		expect(result).toContain("+new");
	});

	it("shows '(no changes)' when diff is empty", async () => {
		const input = makeInput({ diff: "" });
		const result = await compressResult(input, "diff-only");
		expect(result).toContain("(no changes)");
	});

	it("shows '(no changes)' when diff is literally '(no changes)'", async () => {
		const input = makeInput({ diff: "(no changes)" });
		const result = await compressResult(input, "diff-only");
		expect(result).toContain("(no changes)");
	});

	it("hard caps at 4x maxChars", async () => {
		const maxChars = 50;
		const input = makeInput({ diff: "d".repeat(500) });
		const result = await compressResult(input, "diff-only", maxChars);
		expect(result).toContain("... [diff truncated]");
		// Status line + \n + 200 chars of diff + truncation notice
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + 100);
	});
});

// ---------------------------------------------------------------------------
// 4. truncate strategy
// ---------------------------------------------------------------------------

describe("truncate strategy", () => {
	it("concatenates status + agentOutput + diff", async () => {
		const input = makeInput({
			success: true,
			agentOutput: "agent says hello",
			diff: "diff content here",
		});
		const result = await compressResult(input, "truncate");
		expect(result).toContain("Status: SUCCESS");
		expect(result).toContain("agent says hello");
		expect(result).toContain("diff content here");
	});

	it("preserves status at head", async () => {
		const input = makeInput({ success: false, agentOutput: "stuff" });
		const result = await compressResult(input, "truncate");
		expect(result.startsWith("Status: FAILED")).toBe(true);
	});

	it("hard caps at 4x maxChars and preserves status at head", async () => {
		const maxChars = 50;
		const input = makeInput({
			agentOutput: "a".repeat(500),
			diff: "d".repeat(500),
		});
		const result = await compressResult(input, "truncate", maxChars);
		expect(result.startsWith("Status: SUCCESS")).toBe(true);
		expect(result).toContain("... [truncated]");
		// Total length should be roughly around 4x maxChars
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + 100);
	});
});

// ---------------------------------------------------------------------------
// 5. llm-summary strategy
// ---------------------------------------------------------------------------

describe("llm-summary strategy", () => {
	beforeEach(() => {
		// Reset summarizer before each test by setting a no-op and then clearing
		// We rely on the module-level variable; setSummarizer(undefined as any)
		// would clear it, but the function signature requires a function.
		// Instead we set a dummy and override per-test.
		setSummarizer(undefined as any);
	});

	it("falls back to structured when no summarizer is registered", async () => {
		// Ensure no summarizer
		setSummarizer(undefined as any);

		const input = makeInput({
			success: true,
			durationMs: 2000,
			filesChanged: ["a.ts"],
			diff: "some diff",
			agentOutput: "some output",
		});
		const llmResult = await compressResult(input, "llm-summary");
		const structuredResult = await compressResult(input, "structured");
		expect(llmResult).toBe(structuredResult);
	});

	it("uses registered summarizer when available", async () => {
		const mockSummarizer = vi.fn().mockResolvedValue("LLM summary: refactored foo()");
		setSummarizer(mockSummarizer);

		const input = makeInput({
			success: true,
			durationMs: 1000,
			filesChanged: ["src/foo.ts"],
			diff: "--- a/foo.ts\n+++ b/foo.ts",
			agentOutput: "Applied edit to src/foo.ts",
		});
		const result = await compressResult(input, "llm-summary");

		expect(mockSummarizer).toHaveBeenCalledOnce();
		expect(result).toContain("LLM summary: refactored foo()");
		// Verify the summarizer received text and instruction
		const [text, instruction] = mockSummarizer.mock.calls[0];
		expect(typeof text).toBe("string");
		expect(typeof instruction).toBe("string");
		expect(instruction).toContain("Summarize");
	});

	it("prepends status line to summary", async () => {
		setSummarizer(vi.fn().mockResolvedValue("Did some work."));

		const input = makeInput({
			success: true,
			durationMs: 5000,
			filesChanged: ["x.ts"],
		});
		const result = await compressResult(input, "llm-summary");
		expect(result).toMatch(/^Status: SUCCESS \(5\.0s\)/);
		expect(result).toContain("Did some work.");
	});

	it("includes files line when files changed", async () => {
		setSummarizer(vi.fn().mockResolvedValue("Summary text."));

		const input = makeInput({
			success: true,
			durationMs: 1000,
			filesChanged: ["a.ts", "b.ts"],
		});
		const result = await compressResult(input, "llm-summary");
		expect(result).toContain("Files: a.ts, b.ts");
	});

	it("falls back to structured on summarizer error", async () => {
		setSummarizer(vi.fn().mockRejectedValue(new Error("API timeout")));

		const input = makeInput({
			success: true,
			durationMs: 1000,
			filesChanged: ["a.ts"],
			diff: "diff here",
			agentOutput: "output here",
		});
		const llmResult = await compressResult(input, "llm-summary");
		const structuredResult = await compressResult(input, "structured");
		expect(llmResult).toBe(structuredResult);
	});

	it("safety caps at 2x maxChars", async () => {
		const maxChars = 100;
		const longSummary = "w".repeat(500);
		setSummarizer(vi.fn().mockResolvedValue(longSummary));

		const input = makeInput({
			success: true,
			durationMs: 1000,
			filesChanged: ["a.ts"],
		});
		const result = await compressResult(input, "llm-summary", maxChars);
		expect(result.length).toBeLessThanOrEqual(maxChars * 2 + "... [summary truncated]".length + 1);
		expect(result).toContain("... [summary truncated]");
	});
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
	it("handles completely empty input", async () => {
		const input = makeInput({
			agentOutput: "",
			diff: "",
			diffStats: "",
			filesChanged: [],
			success: true,
			durationMs: 0,
		});

		for (const strategy of ["structured", "diff-only", "truncate"] as const) {
			const result = await compressResult(input, strategy);
			expect(result).toBeTruthy();
			expect(result).toContain("Status:");
		}
	});

	it("handles empty input with llm-summary (falls back to structured)", async () => {
		setSummarizer(undefined as any);
		const input = makeInput({});
		const result = await compressResult(input, "llm-summary");
		expect(result).toContain("Status: SUCCESS");
	});

	it("structured: no diff, no output, no files", async () => {
		const input = makeInput({ success: false, durationMs: 100 });
		const result = await compressResult(input, "structured");
		expect(result).toContain("Status: FAILED (0.1s)");
		expect(result).not.toContain("Files changed");
		expect(result).not.toContain("Diff stats:");
		expect(result).not.toContain("Key changes:");
		expect(result).not.toContain("Agent output");
	});

	it("very large inputs are capped (structured)", async () => {
		const maxChars = 100;
		const input = makeInput({
			agentOutput: "a".repeat(10_000),
			diff: "d".repeat(10_000),
			diffStats: "s".repeat(1000),
			filesChanged: Array.from({ length: 30 }, (_, i) => `path/to/file${i}.ts`),
		});
		const result = await compressResult(input, "structured", maxChars);
		// Hard cap is 4x maxChars + truncation notice
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + 50);
	});

	it("very large inputs are capped (diff-only)", async () => {
		const maxChars = 100;
		const input = makeInput({ diff: "d".repeat(10_000) });
		const result = await compressResult(input, "diff-only", maxChars);
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + 50);
	});

	it("very large inputs are capped (truncate)", async () => {
		const maxChars = 100;
		const input = makeInput({
			agentOutput: "a".repeat(10_000),
			diff: "d".repeat(10_000),
		});
		const result = await compressResult(input, "truncate", maxChars);
		// The truncate strategy preserves status at head and tail of remaining
		expect(result.length).toBeLessThanOrEqual(maxChars * 4 + 50);
	});

	it("includes error field in structured output", async () => {
		const input = makeInput({
			success: false,
			durationMs: 500,
			error: "Process exited with code 1",
		});
		const result = await compressResult(input, "structured");
		expect(result).toContain("Error: Process exited with code 1");
		expect(result).toContain("Status: FAILED");
	});

	it("includes error field in llm-summary text sent to summarizer", async () => {
		const mockSummarizer = vi.fn().mockResolvedValue("Summary.");
		setSummarizer(mockSummarizer);

		const input = makeInput({
			success: false,
			durationMs: 500,
			error: "OOM killed",
		});
		await compressResult(input, "llm-summary");

		const [text] = mockSummarizer.mock.calls[0];
		expect(text).toContain("OOM killed");
	});

	it("diff-only does not include agent output or files", async () => {
		const input = makeInput({
			agentOutput: "should not appear",
			filesChanged: ["a.ts", "b.ts"],
			diff: "--- a/a.ts\n+++ b/a.ts",
		});
		const result = await compressResult(input, "diff-only");
		expect(result).not.toContain("should not appear");
		expect(result).not.toContain("Files changed");
		expect(result).toContain("--- a/a.ts");
	});

	it("truncate omits empty sections gracefully", async () => {
		const input = makeInput({ agentOutput: "", diff: "" });
		const result = await compressResult(input, "truncate");
		// Should just have the status line, no double blank lines from empty sections
		expect(result).toContain("Status: SUCCESS");
		expect(result.trim()).toBe("Status: SUCCESS");
	});
});
