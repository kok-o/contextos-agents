import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { buildSwarmSystemPrompt } from "../../src/prompts/orchestrator.js";

describe("Orchestrator prompt alignment (Task 0.2d)", () => {
	const config = loadConfig();

	it("contains zero references to FINAL(), print(), or code blocks in default orchestration prompt", () => {
		const prompt = buildSwarmSystemPrompt(config);

		expect(prompt).not.toContain("FINAL(");
		expect(prompt).not.toContain("print(");
		expect(prompt).not.toContain("```javascript");
		expect(prompt).not.toContain("```python");
		expect(prompt).toContain('"action": "spawn"');
		expect(prompt).toContain('"action": "finish"');
		expect(prompt).toContain('"action": "wait"');
		expect(prompt).toContain('"action": "inspect_diff"');
		expect(prompt).toContain('"action": "review"');
		expect(prompt).toContain('"action": "merge"');
	});
});
