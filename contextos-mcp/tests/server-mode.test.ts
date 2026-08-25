/**
 * Tests for OpenCode server mode infrastructure.
 *
 * These tests verify the server pool lifecycle and fallback behavior
 * without requiring real API keys or opencode installation.
 */

import { afterEach, describe, expect, it } from "vitest";
import { disableServerMode, enableServerMode, getActiveServerCount } from "../src/agents/opencode.js";

describe("OpenCode Server Pool", () => {
	afterEach(async () => {
		await disableServerMode();
	});

	it("should start with zero active servers", () => {
		expect(getActiveServerCount()).toBe(0);
	});

	it("should enable and disable server mode without errors", async () => {
		enableServerMode();
		expect(getActiveServerCount()).toBe(0); // No servers until first request
		await disableServerMode();
		expect(getActiveServerCount()).toBe(0);
	});

	it("should handle multiple enable/disable cycles", async () => {
		for (let i = 0; i < 3; i++) {
			enableServerMode();
			await disableServerMode();
		}
		expect(getActiveServerCount()).toBe(0);
	});
});

describe("OpenCode Agent Fallback", () => {
	it("should fall back to subprocess mode when server mode disabled", async () => {
		// With server mode disabled, the agent should attempt subprocess mode
		// (which will fail since we don't have opencode, but should not throw)
		const { default: agent } = await import("../src/agents/opencode.js");
		const result = await agent.run({
			task: "test task",
			workDir: "/tmp",
		});
		// Should fail gracefully (opencode not installed or subprocess fails)
		// The important thing is it doesn't throw
		expect(result).toBeDefined();
		expect(typeof result.success).toBe("boolean");
		expect(typeof result.durationMs).toBe("number");
	});
});
