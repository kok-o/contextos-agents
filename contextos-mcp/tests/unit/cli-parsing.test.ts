/**
 * Tests for CLI help output — buildHelp() from main.ts.
 */

import { describe, expect, it } from "vitest";
import { buildHelp } from "../../src/main.js";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildHelp()", () => {
	it("contains SWARM MODE section", () => {
		const help = buildHelp();
		expect(help).toContain("SWARM MODE");
	});

	it("contains MCP SERVER section", () => {
		const help = buildHelp();
		expect(help).toContain("MCP SERVER");
	});

	it("contains RLM MODE section", () => {
		const help = buildHelp();
		expect(help).toContain("RLM MODE");
	});

	it("contains --dir flag", () => {
		const help = buildHelp();
		expect(help).toContain("--dir");
	});

	it("contains --orchestrator flag", () => {
		const help = buildHelp();
		expect(help).toContain("--orchestrator");
	});

	it("contains --max-budget flag", () => {
		const help = buildHelp();
		expect(help).toContain("--max-budget");
	});

	it("contains swarm_config.yaml reference", () => {
		const help = buildHelp();
		expect(help).toContain("swarm_config.yaml");
	});

	it("returns a non-empty string", () => {
		const help = buildHelp();
		expect(help.length).toBeGreaterThan(100);
	});

	it("contains swarm command examples", () => {
		const help = buildHelp();
		expect(help).toContain("swarm");
	});
});
