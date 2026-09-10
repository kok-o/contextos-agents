/**
 * ContextOS Selector — determines which rules and skills are relevant for a task.
 *
 * Unified with CanonicalResolver (.agents/resolver/canonical-resolver.js) for 100%
 * parity between CLI and MCP runtimes:
 *   - Evidence-based scoring (aliases, keywords, file globs, nearest package)
 *   - Direct query to compiled registry (registry.v2.json)
 *   - Transitive dependency closure
 *   - Token budget planner and intent precedence
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);

export interface SelectedContext {
	/** Always-loaded rules (e.g., AGENTS.md core principles). */
	coreRules: string[];
	/** Task-relevant rule files from rules/. */
	rules: string[];
	/** Task-relevant skill directories from core/skills/. */
	skills: string[];
}

export interface SelectorOptions {
	/** Root directory of the repository. */
	rootDir?: string;
	/** File paths touched or relevant to task for file-pattern boosting. */
	files?: string[];
	/** Custom token budget for context selection (defaults to 8000). */
	contextBudgetTokens?: number;
}

/**
 * Lazily loads the canonical resolver instance from .agents.
 */
function getCanonicalResolver(rootDir?: string): any {
	const cwd = rootDir || process.cwd();
	const candidatePaths = [
		path.join(cwd, ".agents", "resolver", "canonical-resolver.js"),
		path.join(cwd, "..", ".agents", "resolver", "canonical-resolver.js"),
	];

	for (const p of candidatePaths) {
		if (existsSync(p)) {
			try {
				const mod = require(p);
				if (mod?.CanonicalResolver) {
					const resolvedRoot = path.dirname(path.dirname(path.dirname(p)));
					return new mod.CanonicalResolver({ rootDir: resolvedRoot });
				}
			} catch {
				// fall through to fallback
			}
		}
	}
	return null;
}

/**
 * Select relevant rules and skills for a given task description using the unified CanonicalResolver.
 *
 * @param task - The task description text
 * @param options - Optional configuration (touched files and token budget)
 * @returns SelectedContext with lists of relevant rule/skill identifiers
 */
export function selectContext(task: string, options: SelectorOptions = {}): SelectedContext {
	const canonical = getCanonicalResolver(options.rootDir);
	if (!canonical) {
		throw new Error("ContextOS CanonicalResolver is unavailable; refusing to produce incomplete context");
	}

	const res = canonical.resolve({
		task,
		files: options.files || [],
		contextBudgetTokens: options.contextBudgetTokens ?? 8000,
	});

	let domainSkills: string[] = (res.selected || []).map((s: { id: string }) => s.id);
	if (typeof (options as any).maxSkills === "number" && domainSkills.length > (options as any).maxSkills) {
		domainSkills = domainSkills.slice(0, (options as any).maxSkills);
	}
	return {
		coreRules: ["AGENTS.md"],
		rules: [],
		skills: domainSkills,
	};
}
