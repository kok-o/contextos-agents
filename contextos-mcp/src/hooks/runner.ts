/**
 * Hook runner — executes user-defined commands at lifecycle points.
 *
 * Hooks provide deterministic control flow (not LLM-decided).
 * They run shell commands and surface only errors — success is silent.
 *
 * Lifecycle points:
 *   - post_thread: After a thread commits (before compression)
 *   - post_merge: After merge_threads() completes
 *   - post_session: When the session ends
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface HookConfig {
	command: string;
	on_failure: "warn" | "block";
}

export interface HooksConfig {
	post_thread: HookConfig[];
	post_merge: HookConfig[];
	post_session: HookConfig[];
}

export interface HookResult {
	success: boolean;
	output: string;
	command: string;
}

const DEFAULT_HOOKS: HooksConfig = {
	post_thread: [],
	post_merge: [],
	post_session: [],
};

/**
 * Load hooks from swarm_config.yaml hooks section, or from .swarm/hooks.yaml.
 */
export function loadHooks(projectDir: string): HooksConfig {
	const hooksFile = path.join(projectDir, ".swarm", "hooks.yaml");
	if (!fs.existsSync(hooksFile)) return { ...DEFAULT_HOOKS };

	try {
		const raw = fs.readFileSync(hooksFile, "utf-8");
		return parseHooksYaml(raw);
	} catch {
		return { ...DEFAULT_HOOKS };
	}
}

function parseHooksYaml(raw: string): HooksConfig {
	const hooks: HooksConfig = { post_thread: [], post_merge: [], post_session: [] };
	let currentSection: keyof HooksConfig | null = null;

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		if (trimmed === "post_thread:" || trimmed === "post_merge:" || trimmed === "post_session:") {
			currentSection = trimmed.replace(":", "") as keyof HooksConfig;
			continue;
		}

		if (currentSection && trimmed.startsWith("- command:")) {
			const command = trimmed
				.replace("- command:", "")
				.trim()
				.replace(/^["']|["']$/g, "");
			if (command) {
				hooks[currentSection].push({ command, on_failure: "warn" });
			}
		}

		if (currentSection && trimmed.startsWith("on_failure:")) {
			const val = trimmed.replace("on_failure:", "").trim();
			const last = hooks[currentSection][hooks[currentSection].length - 1];
			if (last && (val === "warn" || val === "block")) {
				last.on_failure = val;
			}
		}
	}

	return hooks;
}

/**
 * Run hooks for a lifecycle point.
 * Returns results for each hook. On "block" failure, throws.
 * Success output is swallowed — only errors are surfaced.
 */
export function runHooks(hooks: HookConfig[], cwd: string, label: string): HookResult[] {
	const results: HookResult[] = [];

	for (const hook of hooks) {
		try {
			execSync(hook.command, {
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				timeout: 60_000,
				encoding: "utf-8",
			});
			// Success — silent (context-efficient per harness engineering best practice)
			results.push({ success: true, output: "", command: hook.command });
		} catch (err: any) {
			const stderr = err.stderr || err.stdout || err.message || "unknown error";
			// Only surface error output
			const output = `[${label}] Hook failed: ${hook.command}\n${stderr}`.trim();
			results.push({ success: false, output, command: hook.command });

			if (hook.on_failure === "block") {
				throw new Error(output);
			}
		}
	}

	return results;
}
