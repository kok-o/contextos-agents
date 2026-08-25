/**
 * Tests for UI theme utilities — stripAnsi, truncate, pad, termWidth.
 */

import { describe, expect, it } from "vitest";
import { pad, stripAnsi, termWidth, truncate } from "../../src/ui/theme.js";

// ── stripAnsi ────────────────────────────────────────────────────────────────

describe("stripAnsi", () => {
	it("removes ANSI color codes", () => {
		const result = stripAnsi("\x1b[32mgreen\x1b[0m");
		expect(result).toBe("green");
	});

	it("handles multiple ANSI codes", () => {
		const result = stripAnsi("\x1b[1m\x1b[36mhello\x1b[0m \x1b[31mworld\x1b[0m");
		expect(result).toBe("hello world");
	});

	it("returns plain text unchanged", () => {
		const result = stripAnsi("plain text");
		expect(result).toBe("plain text");
	});

	it("handles empty string", () => {
		const result = stripAnsi("");
		expect(result).toBe("");
	});

	it("handles string with only ANSI codes", () => {
		const result = stripAnsi("\x1b[32m\x1b[0m");
		expect(result).toBe("");
	});

	it("strips 256-color and RGB ANSI codes", () => {
		// 256-color: \x1b[38;5;196m  — but the regex uses [0-9;]*m
		const result = stripAnsi("\x1b[38;2;215;119;87mcoraltext\x1b[0m");
		expect(result).toBe("coraltext");
	});
});

// ── truncate ─────────────────────────────────────────────────────────────────

describe("truncate", () => {
	it("leaves short strings unchanged", () => {
		const result = truncate("hello", 10);
		expect(result).toBe("hello");
	});

	it("truncates long strings with ellipsis", () => {
		const result = truncate("hello world, this is long", 10);
		expect(result).toHaveLength(10);
		expect(result.endsWith("\u2026")).toBe(true); // ends with "..."
		expect(result).toBe("hello wor\u2026");
	});

	it("leaves string at exactly maxLen unchanged", () => {
		const result = truncate("12345", 5);
		expect(result).toBe("12345");
		expect(result).toHaveLength(5);
	});

	it("handles maxLen of 1", () => {
		const result = truncate("hello", 1);
		expect(result).toBe("\u2026");
		expect(result).toHaveLength(1);
	});

	it("handles empty string", () => {
		const result = truncate("", 10);
		expect(result).toBe("");
	});
});

// ── pad ──────────────────────────────────────────────────────────────────────

describe("pad", () => {
	it("pads shorter string to desired width", () => {
		const result = pad("hi", 10);
		expect(result).toBe("hi        ");
		expect(stripAnsi(result)).toHaveLength(10);
	});

	it("does not truncate longer string", () => {
		const result = pad("this is long text", 5);
		expect(result).toBe("this is long text");
	});

	it("returns exact string when length equals width", () => {
		const result = pad("12345", 5);
		expect(result).toBe("12345");
	});

	it("pads based on visual width when ANSI codes present", () => {
		// ANSI codes add bytes but not visual width
		const ansiText = "\x1b[32mhi\x1b[0m"; // visually "hi" (2 chars)
		const result = pad(ansiText, 10);

		// The padded result should have the ANSI text + 8 spaces
		const stripped = stripAnsi(result);
		expect(stripped).toHaveLength(10);
		expect(stripped).toBe("hi        ");
	});

	it("handles empty string", () => {
		const result = pad("", 5);
		expect(result).toBe("     ");
		expect(result).toHaveLength(5);
	});
});

// ── termWidth ────────────────────────────────────────────────────────────────

describe("termWidth", () => {
	it("returns a number", () => {
		const width = termWidth();
		expect(typeof width).toBe("number");
	});

	it("returns a value >= 1", () => {
		const width = termWidth();
		expect(width).toBeGreaterThanOrEqual(1);
	});

	it("returns a reasonable terminal width", () => {
		// In test environments, should return the default 80 or the actual terminal width
		const width = termWidth();
		expect(width).toBeGreaterThanOrEqual(20);
		expect(width).toBeLessThanOrEqual(1000);
	});
});
