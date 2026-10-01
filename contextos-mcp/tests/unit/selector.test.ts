import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleContextPrompt } from "../../src/contextos/loader.js";
import { selectContext } from "../../src/contextos/selector.js";

const ROOT = path.resolve(__dirname, "../../..");
describe("canonical selection and real source assembly", () => {
	it("assembles a manifestless project skill through the real compiler and selector", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "ctx-bare-assembly-"));
		try {
			cpSync(path.join(ROOT, ".agents/core"), path.join(root, ".agents/core"), { recursive: true });
			mkdirSync(path.join(root, ".agents/resolver"), { recursive: true });
			writeFileSync(
				path.join(root, ".agents/resolver/canonical-resolver.js"),
				`module.exports = require(${JSON.stringify(path.join(ROOT, ".agents/resolver/canonical-resolver.js"))});\n`,
			);
			mkdirSync(path.join(root, ".agents/project/skills/team-bare"), { recursive: true });
			writeFileSync(
				path.join(root, ".agents/project/skills/team-bare/SKILL.md"),
				"---\nname: team-bare\ndescription: Team rules\n---\n# Team\nBARE_TEAM_RULE_MUST_SURVIVE\n",
			);
			const { ManifestCompiler } = createRequire(import.meta.url)(
				path.join(ROOT, ".agents/compiler/manifest-compiler.js"),
			);
			const compiled = new ManifestCompiler({ rootDir: root }).compileAndWrite();
			expect(compiled.success).toBe(true);
			const assembled = assembleContextPrompt(root, "Implement @team-bare");
			expect(assembled.prompt).toContain("BARE_TEAM_RULE_MUST_SURVIVE");
			expect(assembled.report.sources.find((source) => source.id === "team-bare")?.path).toBe(
				".agents/project/skills/team-bare/SKILL.md",
			);
		} finally {
			expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
			expect(path.basename(root)).toMatch(/^ctx-bare-assembly-/);
			rmSync(root, { recursive: true, force: true });
		}
	});
	it("loads the short workflow for routine work without role or implementation manuals", () => {
		const selected = selectContext("Fix typo in README", { rootDir: ROOT, contextBudgetTokens: 1000 });
		expect(selected.skills).toEqual(["engineering-workflow"]);
		const result = assembleContextPrompt(ROOT, "Fix typo in README", { contextBudgetTokens: 1000 });
		expect(result.prompt.length).toBeLessThan(6000);
		expect(result.report.sources.map((source) => source.id)).toEqual(["AGENTS.md", "engineering-workflow"]);
	});
	it("preserves the exact full security body with a small soft token and character budget", () => {
		const result = assembleContextPrompt(ROOT, "Review JWT authentication security", {
			contextBudgetTokens: 100,
			maxTotalSkillsChars: 100,
		});
		const source = result.report.sources.find((item) => item.id === "security");
		expect(source).toBeDefined();
		const body = readFileSync(path.join(ROOT, source!.path), "utf8")
			.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
			.trim();
		expect(result.prompt).toContain(body);
		expect(result.report.warnings.map((warning) => warning.code)).toContain("CTX_RESOLVER_BUDGET_EXCEEDED");
	});
	it("does not remove required safety instructions to satisfy maxSkills", () => {
		const selected = selectContext("Build JWT authentication security", {
			rootDir: ROOT,
			contextBudgetTokens: 100,
			maxSkills: 1,
		});
		expect(selected.skills).toContain("security");
		expect(selected.warnings?.map((warning) => warning.code)).toContain("CTX_RESOLVER_SKILL_LIMIT_EXCEEDED");
	});
	it("returns an explicit hard-limit error instead of a truncated prompt", () => {
		expect(() => assembleContextPrompt(ROOT, "Review authentication security", { hardLimitChars: 100 })).toThrow(
			/hard limit/,
		);
	});
});
