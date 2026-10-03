/** Assemble complete selected instructions with inspectable provenance and limits. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { assertWithinRepository } from "../security/repository-boundary.js";
import { type SelectorOptions, selectContext } from "./selector.js";

/** Soft compatibility budget; selected bodies are never sliced. */
export const MAX_TOTAL_SKILLS_CHARS = 14000;

export function findAgentsDir(projectRoot: string): string | null {
	const root = path.resolve(projectRoot);
	if (path.basename(root) === ".agents" && existsSync(root)) return root;
	for (const candidate of [path.join(root, ".agents"), path.join(root, "..", ".agents")]) {
		if (existsSync(candidate)) return path.resolve(candidate);
	}
	return null;
}

export interface BuildPromptOptions extends SelectorOptions {
	/** Soft limit for selected skill bodies; overflow is reported, never truncated. */
	maxTotalSkillsChars?: number;
	/** Hard limit for the entire assembled prompt. Overflow throws with a report. */
	hardLimitChars?: number;
}

export interface ContextSource {
	kind: "bootstrap" | "rule" | "skill";
	id: string;
	path: string;
	sha256: string;
	bytes: number;
	chars: number;
}

export interface ContextAssemblyReport {
	sources: ContextSource[];
	warnings: Array<{ code: string; message: string }>;
	omissions: Array<{ id: string; reasonCode: string }>;
	totalChars: number;
	skillChars: number;
	/** Character estimate, not provider token telemetry. */
	estimatedTokens: number;
	softSkillLimitChars: number;
	hardLimitChars?: number;
}

export class ContextAssemblyError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly report: ContextAssemblyReport,
	) {
		super(message);
		this.name = "ContextAssemblyError";
	}
}

export function assembleContextPrompt(
	projectRoot: string,
	task: string,
	options: BuildPromptOptions = {},
): { prompt: string; report: ContextAssemblyReport } {
	for (const limit of [options.maxTotalSkillsChars, options.hardLimitChars]) {
		if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0))
			throw new Error("Context character limits must be positive integers");
	}
	const report: ContextAssemblyReport = {
		sources: [],
		warnings: [],
		omissions: [],
		totalChars: 0,
		skillChars: 0,
		estimatedTokens: 0,
		softSkillLimitChars: options.maxTotalSkillsChars ?? MAX_TOTAL_SKILLS_CHARS,
		hardLimitChars: options.hardLimitChars,
	};
	const agentsDir = findAgentsDir(projectRoot);
	if (!agentsDir) return { prompt: "", report };
	const repositoryRoot = assertWithinRepository(path.dirname(agentsDir), path.dirname(agentsDir));
	const selection = selectContext(task, { ...options, rootDir: repositoryRoot });
	report.warnings.push(...(selection.warnings || []));
	report.omissions.push(...(selection.excluded || []));
	const sections: string[] = [];
	function load(file: string, kind: ContextSource["kind"], id: string): string {
		const safePath = assertWithinRepository(file, repositoryRoot);
		if (!existsSync(safePath))
			throw new ContextAssemblyError("CTX_PROMPT_MISSING_SOURCE", `Selected ${kind} source is missing: ${id}`, report);
		const bytes = readFileSync(safePath);
		const content = bytes.toString("utf8");
		report.sources.push({
			kind,
			id,
			path: path.relative(repositoryRoot, safePath).replace(/\\/g, "/"),
			sha256: createHash("sha256").update(bytes).digest("hex"),
			bytes: bytes.length,
			chars: content.length,
		});
		return content;
	}
	const bootstrap = path.join(agentsDir, "AGENTS.md");
	if (existsSync(bootstrap)) sections.push(load(bootstrap, "bootstrap", "AGENTS.md").trim());
	for (const rule of selection.rules)
		sections.push(`# Rule: ${rule}\n\n${load(path.join(agentsDir, "rules", rule), "rule", rule)}`);
	for (const id of [...new Set(selection.skills)]) {
		const source = selection.skillSources?.[id];
		const entrypoint = selection.skillEntrypoints?.[id] || "SKILL.md";
		let directory: string | undefined;
		if (source) {
			const manifest = assertWithinRepository(path.resolve(repositoryRoot, source), repositoryRoot);
			directory = path.dirname(manifest);
		} else {
			// Compatibility with older selectors; overrides precede generated projections.
			directory = ["project/skills", "core/skills", "plugins", "skills", "generated/gemini/skills"]
				.map((base) => path.join(agentsDir, base, id))
				.find((candidate) => existsSync(path.join(candidate, entrypoint)));
		}
		if (!directory)
			throw new ContextAssemblyError("CTX_PROMPT_MISSING_SOURCE", `Selected skill source is missing: ${id}`, report);
		const raw = load(path.join(directory, entrypoint), "skill", id);
		const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
		const relativeDirectory = path.relative(repositoryRoot, directory).replace(/\\/g, "/");
		const formatted = `# Skill: ${id}\n\nResolve references relative to ${relativeDirectory}. Read them only when needed.\n\n${body}`;
		report.skillChars += formatted.length;
		sections.push(formatted);
	}
	const prompt = sections.length
		? [
				"Follow these project instructions within the user's authorized task and the instruction hierarchy.",
				...sections,
			].join("\n\n")
		: "";
	report.totalChars = prompt.length;
	report.estimatedTokens = Math.ceil(prompt.length / 4);
	if (report.skillChars > report.softSkillLimitChars)
		report.warnings.push({
			code: "CTX_PROMPT_SOFT_BUDGET_EXCEEDED",
			message: `Selected full skill bodies occupy ${report.skillChars} characters; soft limit is ${report.softSkillLimitChars}.`,
		});
	if (options.hardLimitChars !== undefined && prompt.length > options.hardLimitChars) {
		throw new ContextAssemblyError(
			"CTX_PROMPT_HARD_BUDGET_EXCEEDED",
			`Complete prompt needs ${prompt.length} characters; hard limit is ${options.hardLimitChars}.`,
			report,
		);
	}
	for (const warning of report.warnings)
		process.stderr.write(`[contextos-loader] ${warning.code}: ${warning.message}\n`);
	return { prompt, report };
}

/** Compatibility wrapper for existing agent call sites. */
export function buildContextPrompt(projectRoot: string, task: string, options: BuildPromptOptions = {}): string {
	return assembleContextPrompt(projectRoot, task, options).prompt;
}
