import { describe, expect, it } from "vitest";
import { getAgent, getAvailableAgents, listAgents, registerAgent } from "../../../src/agents/provider.js";
import type { AgentProvider } from "../../../src/core/types.js";

// The mock agent self-registers on import of provider.ts (transitive),
// so the registry may already contain entries.  Capture the baseline
// so assertions account for pre-existing state.
const _baselineAgents = listAgents();

// ---------------------------------------------------------------------------
// Helpers — inline mock providers
// ---------------------------------------------------------------------------

function makeProvider(name: string, available = true): AgentProvider {
	return {
		name,
		isAvailable: async () => available,
		run: async () => ({
			success: true,
			output: "",
			filesChanged: [],
			diff: "",
			durationMs: 0,
		}),
	};
}

// ---------------------------------------------------------------------------
// registerAgent + getAgent
// ---------------------------------------------------------------------------

describe("registerAgent + getAgent", () => {
	it("registers a provider and retrieves it by name", () => {
		const provider = makeProvider("test-register");
		registerAgent(provider);

		const retrieved = getAgent("test-register");
		expect(retrieved).toBe(provider);
		expect(retrieved.name).toBe("test-register");
	});

	it("throws for an unknown agent name with a helpful message", () => {
		expect(() => getAgent("nonexistent-agent-xyz")).toThrowError(/Unknown agent backend "nonexistent-agent-xyz"/);
		// The error should also list available agents
		expect(() => getAgent("nonexistent-agent-xyz")).toThrowError(/Available:/);
	});
});

// ---------------------------------------------------------------------------
// listAgents
// ---------------------------------------------------------------------------

describe("listAgents", () => {
	it("returns an array of registered agent names", () => {
		const names = listAgents();
		expect(Array.isArray(names)).toBe(true);
		// Every entry should be a string
		for (const name of names) {
			expect(typeof name).toBe("string");
		}
	});

	it("includes agents registered in earlier tests", () => {
		// "test-register" was registered in the first describe block
		const names = listAgents();
		expect(names).toContain("test-register");
	});

	it("includes agents registered during tests", () => {
		const provider = makeProvider("test-list-check");
		registerAgent(provider);

		const names = listAgents();
		expect(names).toContain("test-list-check");
	});
});

// ---------------------------------------------------------------------------
// getAvailableAgents
// ---------------------------------------------------------------------------

describe("getAvailableAgents", () => {
	it("returns only agents where isAvailable() resolves to true", async () => {
		const available = makeProvider("avail-yes", true);
		const unavailable = makeProvider("avail-no", false);
		registerAgent(available);
		registerAgent(unavailable);

		const result = await getAvailableAgents();
		expect(result).toContain("avail-yes");
		expect(result).not.toContain("avail-no");
	});

	it("handles a mix of available and unavailable providers", async () => {
		const providers = [
			makeProvider("mix-a", true),
			makeProvider("mix-b", false),
			makeProvider("mix-c", true),
			makeProvider("mix-d", false),
		];
		for (const p of providers) {
			registerAgent(p);
		}

		const result = await getAvailableAgents();
		expect(result).toContain("mix-a");
		expect(result).toContain("mix-c");
		expect(result).not.toContain("mix-b");
		expect(result).not.toContain("mix-d");
	});

	it("includes agents registered with isAvailable=true in earlier tests", async () => {
		// "avail-yes" was registered above with isAvailable returning true
		const result = await getAvailableAgents();
		expect(result).toContain("avail-yes");
	});
});

// ---------------------------------------------------------------------------
// Registry isolation
// ---------------------------------------------------------------------------

describe("registry isolation", () => {
	it("registering a new agent does not remove existing agents", () => {
		const before = listAgents();
		const provider = makeProvider("isolation-new");
		registerAgent(provider);

		const after = listAgents();
		// Every agent that existed before should still be present
		for (const name of before) {
			expect(after).toContain(name);
		}
		// Plus the new one
		expect(after).toContain("isolation-new");
	});

	it("re-registering the same name overwrites the previous provider", () => {
		const first = makeProvider("overwrite-me");
		const second = makeProvider("overwrite-me");
		registerAgent(first);
		registerAgent(second);

		const retrieved = getAgent("overwrite-me");
		expect(retrieved).toBe(second);
		expect(retrieved).not.toBe(first);

		// The name should only appear once in the list
		const names = listAgents();
		const occurrences = names.filter((n) => n === "overwrite-me");
		expect(occurrences).toHaveLength(1);
	});
});
