/**
 * ContextOS Loader — reads .agents/ directory and assembles a System Prompt.
 *
 * Loads AGENTS.md (always), then selectively loads rules and skills
 * based on the task description using the Selector module.
 *
 * The assembled prompt is injected into every agent's system message,
 * ensuring all coding agents follow the same architectural standards.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { type SelectedContext, selectContext } from "./selector.js";

function log(msg: string): void {
	process.stderr.write(`[contextos-loader] ${msg}\n`);
}

/**
 * Try to read a file, return its content or null.
 */
function tryReadFile(filePath: string): string | null {
	try {
		if (!existsSync(filePath)) return null;
		return readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Find the .agents/ directory starting from the given project root.
 * Returns the absolute path to .agents/ or null if not found.
 */
export function findAgentsDir(projectRoot: string): string | null {
	const agentsDir = path.join(projectRoot, ".agents");
	if (existsSync(agentsDir)) return agentsDir;
	return null;
}

/**
 * Load the core AGENTS.md file.
 */
function loadCoreRules(agentsDir: string): string {
	const agentsMd = tryReadFile(path.join(agentsDir, "AGENTS.md"));
	if (agentsMd) {
		log("Loaded AGENTS.md");
		return agentsMd;
	}
	return "";
}

/**
 * Load specific rule files from .agents/rules/.
 */
function loadRules(agentsDir: string, ruleFiles: string[]): string[] {
	const rulesDir = path.join(agentsDir, "rules");
	if (!existsSync(rulesDir)) return [];

	const loaded: string[] = [];

	for (const ruleFile of ruleFiles) {
		const filePath = path.join(rulesDir, ruleFile);
		const content = tryReadFile(filePath);
		if (content) {
			loaded.push(`# Rule: ${ruleFile}\n\n${content}`);
			log(`Loaded rule: ${ruleFile}`);
		}
	}

	return loaded;
}

/**
 * Load SKILL.md from specific skill directories in .agents/core/skills/.
 */
function loadSkills(agentsDir: string, skillNames: string[]): string[] {
	const skillsBaseDir = path.join(agentsDir, "core", "skills");
	if (!existsSync(skillsBaseDir)) return [];

	const loaded: string[] = [];

	for (const skillName of skillNames) {
		const skillMd = tryReadFile(path.join(skillsBaseDir, skillName, "SKILL.md"));
		if (skillMd) {
			// Truncate very long skills to avoid context bloat (max 2000 chars)
			const truncated = skillMd.length > 2000
				? skillMd.slice(0, 2000) + "\n\n... [truncated for context limit]"
				: skillMd;
			loaded.push(`# Skill: ${skillName}\n\n${truncated}`);
			log(`Loaded skill: ${skillName} (${skillMd.length} chars)`);
		}
	}

	return loaded;
}

/**
 * Build a complete system prompt from .agents/ for a given task.
 *
 * @param projectRoot - Absolute path to the project root
 * @param task - The task description (used for selective loading)
 * @returns The assembled system prompt string, or empty string if no .agents/ found
 */
export function buildContextPrompt(projectRoot: string, task: string): string {
	const agentsDir = findAgentsDir(projectRoot);
	if (!agentsDir) {
		log(`No .agents/ directory found in ${projectRoot}`);
		return "";
	}

	// Select relevant context based on task
	const selection: SelectedContext = selectContext(task);
	log(`Task analysis → rules: [${selection.rules.join(", ")}], skills: [${selection.skills.join(", ")}]`);

	// Assemble prompt sections
	const sections: string[] = [];

	// 1. Always load AGENTS.md (but extract only the Non-Negotiable Rules section to save tokens)
	const coreRules = loadCoreRules(agentsDir);
	if (coreRules) {
		// Extract the "Non-Negotiable Rules" section if it exists
		const nonNegotiableMatch = coreRules.match(/## Non-Negotiable Rules[\s\S]*?(?=\n## |$)/);
		if (nonNegotiableMatch) {
			sections.push(`# Project Standards (from AGENTS.md)\n\n${nonNegotiableMatch[0]}`);
		} else {
			// Fallback: use first 3000 chars of AGENTS.md
			const truncated = coreRules.length > 3000
				? coreRules.slice(0, 3000) + "\n\n... [truncated]"
				: coreRules;
			sections.push(`# Project Standards (from AGENTS.md)\n\n${truncated}`);
		}
	}

	// 2. Load relevant rules
	const rules = loadRules(agentsDir, selection.rules);
	sections.push(...rules);

	// 3. Load relevant skills
	const skills = loadSkills(agentsDir, selection.skills);
	sections.push(...skills);

	if (sections.length === 0) return "";

	const prompt = [
		"You are a coding agent working on a project that follows strict architectural standards.",
		"Below are the project rules and guidelines you MUST follow. Any code you write MUST comply with these standards.",
		"",
		...sections,
	].join("\n");

	log(`Assembled context prompt: ${prompt.length} chars, ${sections.length} sections`);
	return prompt;
}
