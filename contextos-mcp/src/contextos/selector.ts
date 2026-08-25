/**
 * ContextOS Selector — determines which rules and skills are relevant for a task.
 *
 * Uses keyword matching against the task description to select only the
 * rules and skills that matter, preventing context bloat in agent prompts.
 *
 * The mapping table mirrors the "Automatic Skill Activation Rules" from AGENTS.md.
 */

export interface SelectedContext {
	/** Always-loaded rules (e.g., AGENTS.md core principles). */
	coreRules: string[];
	/** Task-relevant rule files from rules/. */
	rules: string[];
	/** Task-relevant skill directories from core/skills/. */
	skills: string[];
}

interface TriggerRule {
	/** Keywords that trigger this rule (case-insensitive). */
	keywords: string[];
	/** Rule files to load (relative to .agents/rules/). */
	rules: string[];
	/** Skill directories to load (relative to .agents/core/skills/). */
	skills: string[];
}

/**
 * Mapping table: task keywords → relevant rules and skills.
 * Based on the "Automatic Skill Activation Rules" section of AGENTS.md.
 */
const TRIGGER_TABLE: TriggerRule[] = [
	{
		keywords: ["component", "ui", "page", "layout", "design", "button", "form", "modal", "sidebar", "navbar", "header", "footer"],
		rules: ["ui.md"],
		skills: ["react", "typescript", "ui-ux-pro", "ui-design"],
	},
	{
		keywords: ["api", "endpoint", "route", "handler", "middleware", "controller", "rest", "graphql"],
		rules: ["architecture.md", "security.md"],
		skills: ["node", "nextjs", "system-design"],
	},
	{
		keywords: ["database", "prisma", "drizzle", "migration", "schema", "sql", "postgres", "repository", "query"],
		rules: ["architecture.md"],
		skills: ["database", "system-design"],
	},
	{
		keywords: ["docker", "container", "dockerfile", "deploy", "compose", "kubernetes", "k8s"],
		rules: ["security.md"],
		skills: ["docker"],
	},
	{
		keywords: ["state", "store", "zustand", "query", "cache", "tanstack"],
		rules: [],
		skills: ["state-management", "react", "typescript"],
	},
	{
		keywords: ["test", "unit test", "playwright", "vitest", "tdd", "spec", "coverage"],
		rules: [],
		skills: ["testing"],
	},
	{
		keywords: ["auth", "login", "signup", "password", "jwt", "session", "oauth", "permission", "rbac"],
		rules: ["security.md"],
		skills: ["security", "system-design"],
	},
	{
		keywords: ["performance", "slow", "optimize", "lighthouse", "core web vitals", "bundle", "lazy"],
		rules: [],
		skills: ["performance"],
	},
	{
		keywords: ["accessibility", "aria", "wcag", "screen reader", "a11y"],
		rules: [],
		skills: ["web-accessibility"],
	},
	{
		keywords: ["style", "css", "tailwind", "color", "typography", "font", "theme", "dark mode"],
		rules: ["ui.md"],
		skills: ["ui-design", "ui-ux-pro"],
	},
	{
		keywords: ["architecture", "refactor", "structure", "domain", "bounded context", "ddd"],
		rules: ["architecture.md"],
		skills: ["system-design", "ddd", "decisions"],
	},
	{
		keywords: ["microservice", "service", "event", "message", "queue", "pubsub"],
		rules: ["architecture.md"],
		skills: ["microservices", "system-design"],
	},
];

/**
 * Select relevant rules and skills for a given task description.
 *
 * @param task - The task description text
 * @returns SelectedContext with lists of relevant rule/skill identifiers
 */
export function selectContext(task: string): SelectedContext {
	const lowerTask = task.toLowerCase();

	const matchedRules = new Set<string>();
	const matchedSkills = new Set<string>();

	for (const trigger of TRIGGER_TABLE) {
		const isMatch = trigger.keywords.some((kw) => lowerTask.includes(kw.toLowerCase()));
		if (isMatch) {
			for (const rule of trigger.rules) matchedRules.add(rule);
			for (const skill of trigger.skills) matchedSkills.add(skill);
		}
	}

	return {
		coreRules: ["AGENTS.md"],
		rules: [...matchedRules],
		skills: [...matchedSkills],
	};
}
