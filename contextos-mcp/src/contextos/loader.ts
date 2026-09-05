/**
 * ContextOS Loader — reads .agents/ directory and assembles a System Prompt.
 *
 * Loads AGENTS.md / GEMINI.md (always), then selectively loads skills
 * based on the task description and active project profile.
 *
 * The assembled prompt is injected into every agent's system message,
 * ensuring all coding agents follow the same architectural standards.
 */

import { existsSync, readFileSync } from "node:fs";
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
	// 1. Direct subfolder .agents/
	const direct = path.join(projectRoot, ".agents");
	if (existsSync(direct)) return direct;

	// 2. If projectRoot itself is .agents/
	if (path.basename(projectRoot) === ".agents" && existsSync(projectRoot)) {
		return projectRoot;
	}

	// 3. Parent directory search (up 2 levels)
	const parent = path.join(projectRoot, "..", ".agents");
	if (existsSync(parent)) return path.resolve(parent);

	return null;
}

/**
 * Read active profile exclusions from .agents/profile.json.
 */
function getExcludedSkills(agentsDir: string): Set<string> {
	const profilePath = path.join(agentsDir, "profile.json");
	const content = tryReadFile(profilePath);
	if (!content) return new Set();

	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed.exclude_skills)) {
			log(`Active profile '${parsed.name || "custom"}' excludes: [${parsed.exclude_skills.join(", ")}]`);
			return new Set(parsed.exclude_skills);
		}
	} catch {
		// Ignore invalid json
	}
	return new Set();
}

/**
 * Load core engineering invariants from AGENTS.md and GEMINI.md.
 */
function loadCoreRules(agentsDir: string): string {
	const sections: string[] = [];

	// 1. Non-Negotiables from AGENTS.md
	const agentsMd = tryReadFile(path.join(agentsDir, "AGENTS.md"));
	if (agentsMd) {
		const nonNegotiableMatch = agentsMd.match(/## Non-Negotiable Rules[\s\S]*?(?=\n## |$)/);
		if (nonNegotiableMatch) {
			sections.push(`## Core Invariants (from AGENTS.md)\n\n${nonNegotiableMatch[0].trim()}`);
		} else {
			sections.push(`## Core Invariants (from AGENTS.md)\n\n${agentsMd.slice(0, 2500).trim()}`);
		}
		log("Loaded AGENTS.md invariants");
	}

	// 2. Gemini High-Precision Rules (Zero Assumptions, Zero Placeholders, Proof-of-Work)
	const geminiMd =
		tryReadFile(path.join(agentsDir, "..", "GEMINI.md")) || tryReadFile(path.join(agentsDir, "GEMINI.md"));
	if (geminiMd) {
		const precisionMatch = geminiMd.match(/## 1\. Zero-Assumption[\s\S]*?(?=\n## 5|$)/);
		if (precisionMatch) {
			sections.push(`## High-Precision Execution Rules (from GEMINI.md)\n\n${precisionMatch[0].trim()}`);
		}
		log("Loaded GEMINI.md precision rules");
	}

	return sections.join("\n\n");
}

/**
 * Load specific rule files from .agents/rules/ if directory exists.
 */
function loadRules(agentsDir: string, ruleFiles: string[]): string[] {
	const rulesDir = path.join(agentsDir, "rules");
	if (!existsSync(rulesDir)) return [];

	const loaded: string[] = [];
	for (const ruleFile of ruleFiles) {
		const filePath = path.join(rulesDir, ruleFile);
		const content = tryReadFile(filePath);
		if (content) {
			loaded.push(`# Rule: ${ruleFile}\n\n${content.trim()}`);
			log(`Loaded rule: ${ruleFile}`);
		}
	}

	return loaded;
}

/**
 * Smart markdown extraction: preserves rules, patterns, negative constraints
 * and checklists without truncating mid-block or wasting tokens on huge verbose samples.
 */
function extractEssentialSkillContent(content: string, maxLen = 4500): string {
	// Strip YAML frontmatter
	const cleaned = content.replace(/^---[\s\S]*?---\r?\n/, "").trim();

	if (cleaned.length <= maxLen) {
		return cleaned;
	}

	// If longer than maxLen, extract core rule sections
	const sections: string[] = [];

	// Overview & When to Use
	const overviewMatch = cleaned.match(/## Overview[\s\S]*?(?=\n## Rules & Patterns|\n## Core Principle|$)/);
	if (overviewMatch) sections.push(overviewMatch[0].trim());

	// Rules & Patterns (including Negative Constraints / Prohibitions)
	const rulesMatch = cleaned.match(
		/(?:## Rules & Patterns|## Core Principle)[\s\S]*?(?=\n## Code Examples|\n<!-- Source: EXAMPLES\.md|$)/,
	);
	if (rulesMatch) {
		sections.push(rulesMatch[0].trim());
	}

	// Validation Checklist
	const checklistMatch = cleaned.match(/## Validation Checklist[\s\S]*?(?=\n## |$)/);
	if (checklistMatch) sections.push(checklistMatch[0].trim());

	// Common Mistakes / Troubleshooting
	const mistakesMatch = cleaned.match(/(?:## Common Mistakes|## Troubleshooting)[\s\S]*?(?=\n## |$)/);
	if (mistakesMatch) sections.push(mistakesMatch[0].trim());

	if (sections.length > 0) {
		return sections.join("\n\n");
	}

	// Fallback to safe character boundary
	return `${cleaned.slice(0, maxLen).trim()}\n\n... [remaining documentation omitted for context efficiency]`;
}

/**
 * Load SKILL.md from candidate skill directories (.agents/skills, .agents/core/skills, etc.).
 */
function loadSkills(agentsDir: string, skillNames: string[], excludedSkills: Set<string>): string[] {
	const candidateRoots = [
		path.join(agentsDir, "skills"),
		path.join(agentsDir, "core", "skills"),
		path.join(agentsDir, "generated", "gemini", "skills"),
		path.join(agentsDir, "plugins"),
	];

	const loaded: string[] = [];
	const loadedNames = new Set<string>();

	for (const skillName of skillNames) {
		if (excludedSkills.has(skillName)) {
			log(`Skipping skill '${skillName}' (excluded by active profile)`);
			continue;
		}

		if (loadedNames.has(skillName)) continue;

		for (const root of candidateRoots) {
			if (!existsSync(root)) continue;

			const skillMdPath = path.join(root, skillName, "SKILL.md");
			const rawContent = tryReadFile(skillMdPath);

			if (rawContent) {
				const essential = extractEssentialSkillContent(rawContent);
				loaded.push(`# Skill: ${skillName}\n\n${essential}`);
				loadedNames.add(skillName);
				log(`Loaded skill: ${skillName} (${essential.length} chars from ${path.relative(agentsDir, skillMdPath)})`);
				break;
			}
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

	// 1. Profile exclusions
	const excludedSkills = getExcludedSkills(agentsDir);

	// 2. Select relevant context based on task
	const selection: SelectedContext = selectContext(task);
	log(`Task analysis → skills: [${selection.skills.join(", ")}]`);

	// 3. Assemble prompt sections
	const sections: string[] = [];

	// Core non-negotiables
	const coreRules = loadCoreRules(agentsDir);
	if (coreRules) {
		sections.push(coreRules);
	}

	// Rules from rules/ (if any)
	const rules = loadRules(agentsDir, selection.rules);
	if (rules.length > 0) {
		sections.push(...rules);
	}

	// Domain skills
	const skills = loadSkills(agentsDir, selection.skills, excludedSkills);
	if (skills.length > 0) {
		sections.push(...skills);
	}

	if (sections.length === 0) return "";

	const prompt = [
		"You are a specialized coding agent working inside an enterprise codebase managed by ContextOS.",
		"Below are the non-negotiable project rules, architectural guidelines, and skill constraints you MUST strictly follow.",
		"Any code or diff you produce MUST strictly adhere to these standards.",
		"",
		...sections,
	].join("\n\n");

	log(`Assembled context prompt: ${prompt.length} chars across ${sections.length} sections`);
	return prompt;
}
