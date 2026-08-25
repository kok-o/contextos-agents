/**
 * GitHub Action entrypoint for swarm-code.
 *
 * Orchestrates the full flow:
 *   1. Read inputs (task, API keys, config)
 *   2. Validate security (author association, fork detection)
 *   3. Run swarm with --json output
 *   4. Create PR with changes (or post comment if no changes)
 *   5. Report results on the originating issue
 */

import * as fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { parseTrigger, type TriggerContext } from "./parse-trigger.js";
import { validateTrigger, sanitizeBudget } from "./security.js";
import {
	createPullRequest,
	postIssueComment,
	postFailureComment,
	type SwarmJsonOutput,
} from "./pr.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read a GitHub Actions input (INPUT_<name> environment variable). */
function getInput(name: string, required = false): string {
	const val = process.env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] || "";
	if (required && !val) {
		fail(`Input "${name}" is required but not provided.`);
	}
	return val;
}

/** Set a GitHub Actions output. */
function setOutput(name: string, value: string): void {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (!outputFile) return;

	if (value.includes("\n")) {
		// Use heredoc delimiter for multiline values
		const delimiter = `EOF_${Date.now()}`;
		fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
	} else {
		fs.appendFileSync(outputFile, `${name}=${value}\n`);
	}
}

/** Log an info message (visible in Actions log). */
function info(msg: string): void {
	console.log(msg);
}

/** Log a warning. */
function warn(msg: string): void {
	console.log(`::warning::${msg}`);
}

/** Log an error and exit. */
function fail(msg: string): never {
	console.log(`::error::${msg}`);
	process.exit(1);
}

/** Mask a secret value in logs. */
function maskSecret(val: string): void {
	if (val) {
		console.log(`::add-mask::${val}`);
	}
}

/** Load the GitHub event payload. */
function loadEventPayload(): Record<string, unknown> {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath || !fs.existsSync(eventPath)) {
		return {};
	}
	try {
		return JSON.parse(fs.readFileSync(eventPath, "utf-8"));
	} catch {
		return {};
	}
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	info("swarm-code GitHub Action starting...");

	// 1. Load event and parse trigger
	const eventPayload = loadEventPayload();
	const trigger = parseTrigger(eventPayload);

	info(`Event: ${trigger.eventType}, Actor: ${trigger.actor}, Repo: ${trigger.repo}`);

	// 2. Security validation
	const security = validateTrigger(eventPayload);
	if (!security.allowed) {
		warn(`Security check failed: ${security.reason}`);
		setOutput("skipped", "true");
		setOutput("skip_reason", security.reason);
		return;
	}
	info(`Security check passed: ${security.reason}`);

	// 3. Read inputs and configure
	const inputTask = getInput("task");
	const task = inputTask || trigger.task;

	if (!task) {
		if (trigger.eventType === "issue_comment") {
			// No @swarm command found — silently skip (don't spam issues)
			info("No @swarm command found in comment, skipping.");
			setOutput("skipped", "true");
			return;
		}
		fail("No task provided. Set the 'task' input or use @swarm in an issue comment.");
	}

	info(`Task: ${task}`);

	// Set up API keys from inputs (mask them in logs)
	const anthropicKey = getInput("anthropic_api_key");
	const openaiKey = getInput("openai_api_key");
	const geminiKey = getInput("gemini_api_key");

	if (anthropicKey) { maskSecret(anthropicKey); process.env.ANTHROPIC_API_KEY = anthropicKey; }
	if (openaiKey) { maskSecret(openaiKey); process.env.OPENAI_API_KEY = openaiKey; }
	if (geminiKey) { maskSecret(geminiKey); process.env.GEMINI_API_KEY = geminiKey; }

	if (!anthropicKey && !openaiKey && !geminiKey) {
		fail("At least one API key is required (anthropic_api_key, openai_api_key, or gemini_api_key).");
	}

	// Configuration
	const agent = getInput("agent") || "direct-llm";
	const model = getInput("model") || "";
	const maxBudget = sanitizeBudget(getInput("max_budget"));

	info(`Agent: ${agent}, Budget: $${maxBudget.toFixed(2)}`);

	// 4. Install swarm-code if not already available
	ensureSwarmInstalled();

	// 5. Run swarm
	info("Running swarm...");
	let output: SwarmJsonOutput;
	try {
		output = runSwarm(task, agent, model, maxBudget);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		warn(`Swarm execution failed: ${errorMsg}`);

		// Post failure comment if we have an issue number
		if (trigger.issueNumber) {
			postFailureComment(trigger.issueNumber, task, errorMsg);
		}

		setOutput("success", "false");
		setOutput("error", errorMsg);
		fail(`Swarm failed: ${errorMsg}`);
	}

	info(`Swarm completed: ${output.success ? "success" : "incomplete"}`);
	info(`Threads: ${output.threads.completed} completed, ${output.threads.failed} failed`);
	info(`Cost: $${output.budget.spent_usd.toFixed(4)}`);

	// 6. Create PR if there are changes
	const prResult = createPullRequest(task, output, trigger.issueNumber);

	if (prResult.created) {
		info(`PR created: ${prResult.url}`);
	} else {
		info(`No PR created: ${prResult.error}`);
	}

	// 7. Post comment on the originating issue
	if (trigger.issueNumber) {
		const commentResult = postIssueComment(trigger.issueNumber, task, output, prResult);
		if (commentResult.posted) {
			info("Issue comment posted.");
		} else {
			warn(`Failed to post issue comment: ${commentResult.error}`);
		}
	}

	// 8. Set outputs
	setOutput("success", String(output.success));
	setOutput("pr_url", prResult.url || "");
	setOutput("cost_usd", output.budget.spent_usd.toFixed(4));
	setOutput("threads_completed", String(output.threads.completed));
	setOutput("threads_failed", String(output.threads.failed));
	setOutput("elapsed_s", output.elapsed_s.toFixed(1));
	setOutput("answer", output.answer.slice(0, 1000)); // Cap output length

	info("swarm-code GitHub Action complete.");
}

// ── Swarm execution ────────────────────────────────────────────────────────

function ensureSwarmInstalled(): void {
	try {
		execFileSync("npx", ["swarm-code", "--version"], {
			encoding: "utf-8",
			stdio: "pipe",
		});
		info("swarm-code is available via npx.");
	} catch {
		info("Installing swarm-code...");
		try {
			execSync("npm install -g swarm-code", { stdio: "pipe" });
			info("swarm-code installed globally.");
		} catch (err) {
			// Fall back to npx (it will download on first use)
			info("Will use npx to run swarm-code.");
		}
	}
}

function runSwarm(
	task: string,
	agent: string,
	model: string,
	maxBudget: number,
): SwarmJsonOutput {
	const args = [
		"swarm-code",
		"--dir", ".",
		"--json",
		"--quiet",
		"--agent", agent,
		"--max-budget", String(maxBudget),
	];

	if (model) {
		args.push("--orchestrator", model);
	}

	args.push(task);

	const result = execFileSync("npx", args, {
		encoding: "utf-8",
		maxBuffer: 50 * 1024 * 1024, // 50MB for large outputs
		timeout: 30 * 60 * 1000, // 30 minute timeout
		env: { ...process.env },
	});

	// Parse JSON from stdout (swarm --json outputs JSON to stdout)
	const stdout = result.trim();
	if (!stdout) {
		throw new Error("swarm produced no output");
	}

	// Find the JSON object in output (may have non-JSON lines from npm/npx)
	// Try single-line JSON first (swarm --json --quiet outputs compact JSON)
	const lines = stdout.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line.startsWith("{")) {
			try {
				const parsed = JSON.parse(line) as SwarmJsonOutput;
				if ("success" in parsed && "threads" in parsed) {
					return parsed;
				}
			} catch { /* not single-line JSON, try multi-line below */ }
		}
	}

	// Fallback: try extracting from first { to last } for multi-line JSON
	const firstBrace = stdout.indexOf("{");
	const lastBrace = stdout.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try {
			const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1)) as SwarmJsonOutput;
			if ("success" in parsed && "threads" in parsed) {
				return parsed;
			}
		} catch { /* give up */ }
	}

	throw new Error(`Could not parse swarm JSON output: ${stdout.slice(0, 500)}`);
}

// ── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
	console.log(`::error::Unexpected error: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
});
