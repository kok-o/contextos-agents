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

export interface LoadHooksOptions {
	allow_hooks?: boolean;
}

export interface RunHooksOptions {
	allow_hooks?: boolean;
}

/**
 * Load hooks from .swarm/hooks.yaml or .agents/hooks.json.
 * If hook files exist and allow_hooks is false (default), execution is blocked
 * and a structured warning is emitted.
 */
export function loadHooks(projectDir: string, allowHooksOrOptions: boolean | LoadHooksOptions = false): HooksConfig {
	const allowHooks =
		typeof allowHooksOrOptions === "boolean" ? allowHooksOrOptions : Boolean(allowHooksOrOptions?.allow_hooks);

	const swarmHooksFile = path.join(projectDir, ".swarm", "hooks.yaml");
	const agentsHooksFile = path.join(projectDir, ".agents", "hooks.json");

	const hasSwarmHooks = fs.existsSync(swarmHooksFile);
	const hasAgentsHooks = fs.existsSync(agentsHooksFile);

	if (!hasSwarmHooks && !hasAgentsHooks) {
		return { ...DEFAULT_HOOKS };
	}

	if (!allowHooks) {
		console.warn(
			"[hooks] Hooks execution is disabled by default. Pass --allow-hooks or set allow_hooks: true in config to enable.",
		);
		return { ...DEFAULT_HOOKS };
	}

	const hooks: HooksConfig = { post_thread: [], post_merge: [], post_session: [] };

	if (hasSwarmHooks) {
		try {
			const raw = fs.readFileSync(swarmHooksFile, "utf-8");
			const parsed = parseHooksYaml(raw);
			hooks.post_thread.push(...parsed.post_thread);
			hooks.post_merge.push(...parsed.post_merge);
			hooks.post_session.push(...parsed.post_session);
		} catch {
			// ignore malformed file
		}
	}

	if (hasAgentsHooks) {
		try {
			const raw = fs.readFileSync(agentsHooksFile, "utf-8");
			const parsed = parseHooksJson(raw);
			hooks.post_thread.push(...parsed.post_thread);
			hooks.post_merge.push(...parsed.post_merge);
			hooks.post_session.push(...parsed.post_session);
		} catch {
			// ignore malformed file
		}
	}

	return hooks;
}

function parseHooksJson(raw: string): HooksConfig {
	const hooks: HooksConfig = { post_thread: [], post_merge: [], post_session: [] };
	try {
		const parsed = JSON.parse(raw);
		const target = parsed?.hooks && typeof parsed.hooks === "object" ? parsed.hooks : parsed;

		const sections: Array<keyof HooksConfig> = ["post_thread", "post_merge", "post_session"];
		for (const section of sections) {
			const list = target[section];
			if (!Array.isArray(list)) continue;
			for (const item of list) {
				if (typeof item === "string" && item.trim()) {
					hooks[section].push({ command: item.trim(), on_failure: "warn" });
				} else if (item && typeof item === "object" && typeof item.command === "string") {
					hooks[section].push({
						command: item.command.trim(),
						on_failure: item.on_failure === "block" ? "block" : "warn",
					});
				}
			}
		}

		if (Array.isArray(target)) {
			for (const item of target) {
				if (item && typeof item === "object" && typeof item.command === "string" && typeof item.event === "string") {
					if (item.event === "post_thread" || item.event === "post_merge" || item.event === "post_session") {
						hooks[item.event as keyof HooksConfig].push({
							command: item.command.trim(),
							on_failure: item.on_failure === "block" ? "block" : "warn",
						});
					}
				}
			}
		}
	} catch {
		// return empty on invalid JSON
	}
	return hooks;
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
export function runHooks(
	hooks: HookConfig[],
	cwd: string,
	label: string,
	allowHooksOrOptions: boolean | RunHooksOptions = true,
): HookResult[] {
	if (!hooks || hooks.length === 0) {
		return [];
	}

	const allowHooks =
		typeof allowHooksOrOptions === "boolean" ? allowHooksOrOptions : (allowHooksOrOptions?.allow_hooks ?? true);

	if (!allowHooks) {
		console.warn(`[hooks] Hooks execution is disabled. Skipping ${label} hooks.`);
		return [];
	}

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
