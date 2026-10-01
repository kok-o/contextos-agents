import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleContextPrompt, ContextAssemblyError } from "../../src/contextos/loader.js";
import { selectContext } from "../../src/contextos/selector.js";

vi.mock("../../src/contextos/selector.js", () => ({ selectContext: vi.fn() }));
let root: string;
beforeEach(() => {
	root = mkdtempSync(path.join(os.tmpdir(), "ctx-assembly-"));
	mkdirSync(path.join(root, ".agents/project/skills/security"), { recursive: true });
	writeFileSync(path.join(root, ".agents/AGENTS.md"), "# Project\n\nUSER INSTRUCTION AT END\n");
	vi.mocked(selectContext).mockReturnValue({
		coreRules: ["AGENTS.md"],
		rules: [],
		skills: ["security"],
		skillSources: { security: ".agents/project/skills/security/skill.yaml" },
		warnings: [{ code: "CTX_RESOLVER_BUDGET_EXCEEDED", message: "required context" }],
		excluded: [{ id: "optional", reasonCode: "budget_exceeded" }],
	});
});
afterEach(() => {
	expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
	expect(path.basename(root)).toMatch(/^ctx-assembly-/);
	rmSync(root, { recursive: true, force: true });
	vi.clearAllMocks();
});
function writeSkill(): string {
	const body = `---\nname: security\n---\n\n# Required rules\n${"Authorization boundary.\n".repeat(1000)}\nFINAL SECURITY CHECK MUST SURVIVE\n`;
	writeFileSync(path.join(root, ".agents/project/skills/security/SKILL.md"), body);
	return body;
}
describe("complete context assembly", () => {
	it("retains complete project overrides and safety tails beyond the soft limit with hashes", () => {
		const body = writeSkill();
		const result = assembleContextPrompt(root, "Review auth", { maxTotalSkillsChars: 100 });
		expect(result.prompt).toContain("FINAL SECURITY CHECK MUST SURVIVE");
		expect(result.prompt).toContain("USER INSTRUCTION AT END");
		expect(result.prompt).not.toContain("remaining rules omitted");
		expect(result.report.sources.find((source) => source.id === "security")?.sha256).toBe(
			createHash("sha256").update(body).digest("hex"),
		);
		expect(result.report.warnings.map((warning) => warning.code)).toContain("CTX_PROMPT_SOFT_BUDGET_EXCEEDED");
		expect(result.report.warnings.map((warning) => warning.code)).toContain("CTX_RESOLVER_BUDGET_EXCEEDED");
		expect(result.report.omissions).toEqual([{ id: "optional", reasonCode: "budget_exceeded" }]);
		expect(result.report.totalChars).toBe(result.prompt.length);
	});
	it("fails explicitly on a hard limit without returning a partial prompt", () => {
		writeSkill();
		try {
			assembleContextPrompt(root, "Review auth", { hardLimitChars: 100 });
			throw new Error("Expected hard limit rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(ContextAssemblyError);
			expect((error as ContextAssemblyError).code).toBe("CTX_PROMPT_HARD_BUDGET_EXCEEDED");
			expect((error as ContextAssemblyError).report.totalChars).toBeGreaterThan(100);
		}
	});
	it("rejects missing selected bodies rather than silently skipping them", () => {
		expect(() => assembleContextPrompt(root, "Review auth")).toThrow(/source is missing/);
	});
	it("loads the canonical custom entrypoint rather than a stale SKILL.md", () => {
		writeSkill();
		const custom = "# Override\nCUSTOM ENTRYPOINT SECURITY RULE\n";
		writeFileSync(path.join(root, ".agents/project/skills/security/RULES.md"), custom);
		vi.mocked(selectContext).mockReturnValue({
			coreRules: ["AGENTS.md"],
			rules: [],
			skills: ["security"],
			skillSources: { security: ".agents/project/skills/security/skill.yaml" },
			skillEntrypoints: { security: "RULES.md" },
		});
		const result = assembleContextPrompt(root, "Review auth");
		expect(result.prompt).toContain("CUSTOM ENTRYPOINT SECURITY RULE");
		expect(result.prompt).not.toContain("FINAL SECURITY CHECK MUST SURVIVE");
		expect(result.report.sources.find((source) => source.id === "security")).toMatchObject({
			path: ".agents/project/skills/security/RULES.md",
			sha256: createHash("sha256").update(custom).digest("hex"),
		});
	});
	it("rejects a source outside the repository", () => {
		vi.mocked(selectContext).mockReturnValue({
			coreRules: [],
			rules: [],
			skills: ["security"],
			skillSources: { security: "../outside/skill.yaml" },
		});
		expect(() => assembleContextPrompt(root, "Review auth")).toThrow(/outside repository|escapes repository/);
		expect(readFileSync(path.join(root, ".agents/AGENTS.md"), "utf8")).toContain("USER INSTRUCTION");
	});
});
