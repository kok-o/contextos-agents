/**
 * First-run onboarding — welcome screen + interactive agent setup wizard.
 *
 * Two-column layout: left has greeting + swarm mesh art + version info,
 * right has tips + environment checks. Then an interactive wizard to:
 *   1. Pick default coding agent from detected backends
 *   2. Configure API keys for required providers
 *   3. Choose default model
 *   4. Save preferences to ~/.swarm/config.yaml
 *
 * Triggered once on first `swarm --dir` invocation. Saves ~/.swarm/.initialized marker.
 */

import { execFileSync, execSync, spawn, spawn as spawnChild } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { getLogLevel, isJsonMode } from "./log.js";
import { bold, coral, cyan, dim, green, isTTY, red, stripAnsi, symbols, termWidth, yellow } from "./theme.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SWARM_DIR = path.join(os.homedir(), ".swarm");
const MARKER_FILE = path.join(SWARM_DIR, ".initialized");
const CRED_FILE = path.join(SWARM_DIR, "credentials");
const USER_CONFIG_FILE = path.join(SWARM_DIR, "config.yaml");

// Read version from package.json instead of hardcoding
function getVersion(): string {
	try {
		const __dir = path.dirname(fileURLToPath(import.meta.url));
		const pkgPath = path.join(__dir, "..", "..", "package.json");
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
		return pkg.version || "0.0.0";
	} catch {
		return "0.0.0";
	}
}
const VERSION = getVersion();

/** Which API key each agent backend requires (or supports). */
const AGENT_PROVIDERS: Record<string, { required: string[]; description: string; install: string }> = {
	opencode: {
		required: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"],
		description: "Supports all providers (Anthropic, OpenAI, Google)",
		install: "npm i -g opencode",
	},
	"claude-code": {
		required: ["ANTHROPIC_API_KEY"],
		description: "Anthropic's Claude Code CLI",
		install: "npm i -g @anthropic-ai/claude-code",
	},
	codex: {
		required: ["OPENAI_API_KEY"],
		description: "OpenAI's Codex CLI",
		install: "npm i -g @openai/codex",
	},
	aider: {
		required: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
		description: "Git-aware AI pair programmer",
		install: "pip install aider-chat",
	},
	"direct-llm": {
		required: ["ANTHROPIC_API_KEY"],
		description: "Direct LLM calls (no coding agent)",
		install: "(built-in)",
	},
};

/** Provider display info. */
const PROVIDERS: { name: string; envVar: string; prefix: string; modelDefault: string }[] = [
	{ name: "Anthropic", envVar: "ANTHROPIC_API_KEY", prefix: "sk-ant-", modelDefault: "anthropic/claude-sonnet-4-6" },
	{ name: "OpenAI", envVar: "OPENAI_API_KEY", prefix: "sk-", modelDefault: "openai/gpt-4o" },
	{ name: "Google", envVar: "GEMINI_API_KEY", prefix: "AI", modelDefault: "google/gemini-2.5-flash" },
];

// ── Marker ────────────────────────────────────────────────────────────────────

export function isFirstRun(): boolean {
	return !fs.existsSync(MARKER_FILE);
}

function markInitialized(): void {
	try {
		fs.mkdirSync(SWARM_DIR, { recursive: true });
		fs.writeFileSync(MARKER_FILE, `${new Date().toISOString()}\n`, "utf-8");
	} catch {
		// Non-fatal — onboarding will just run again next time
	}
}

// ── Dependency checks ─────────────────────────────────────────────────────────

interface CheckResult {
	name: string;
	ok: boolean;
	detail: string;
}

async function commandExists(cmd: string): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("which", [cmd], { stdio: "pipe" });
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}

async function gitVersion(): Promise<string | null> {
	return new Promise((resolve) => {
		const proc = spawn("git", ["--version"], { stdio: "pipe" });
		let out = "";
		proc.stdout?.on("data", (d: Buffer) => {
			out += d.toString();
		});
		proc.on("close", (code) => {
			if (code === 0) {
				const match = out.match(/git version (\S+)/);
				resolve(match ? match[1] : "unknown");
			} else {
				resolve(null);
			}
		});
		proc.on("error", () => resolve(null));
	});
}

function detectApiKeys(): Map<string, string> {
	const keys = new Map<string, string>();
	for (const p of PROVIDERS) {
		const val = process.env[p.envVar];
		if (val && val.length > 8) {
			keys.set(p.envVar, val);
		}
	}
	return keys;
}

function maskKey(val: string): string {
	if (val.length <= 12) return "***";
	return `${val.slice(0, 7)}...${val.slice(-4)}`;
}

async function checkAgentBackends(): Promise<CheckResult[]> {
	const agents: [string, string][] = [
		["opencode", "opencode"],
		["claude-code", "claude"],
		["codex", "codex"],
		["aider", "aider"],
	];
	const results: CheckResult[] = [];
	for (const [name, cmd] of agents) {
		const exists = await commandExists(cmd);
		results.push({ name, ok: exists, detail: exists ? "installed" : "not found" });
	}
	// direct-llm is always available
	results.push({ name: "direct-llm", ok: true, detail: "built-in" });
	return results;
}

// ── Ollama helpers ────────────────────────────────────────────────────────────

function isOllamaInstalled(): boolean {
	try {
		execFileSync("ollama", ["--version"], { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

function isOllamaModelAvailable(model: string): boolean {
	try {
		const output = execFileSync("ollama", ["list"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 10000,
		});
		return output.includes(model);
	} catch {
		return false;
	}
}

async function installOllama(): Promise<boolean> {
	process.stderr.write(`\n  ${bold("Installing Ollama...")}\n\n`);
	if (process.platform === "darwin") {
		try {
			execFileSync("brew", ["--version"], { stdio: "ignore", timeout: 5000 });
			process.stderr.write(`  ${dim("Using Homebrew...")}\n`);
			try {
				execSync("brew install ollama", { stdio: "inherit", timeout: 120000 });
				return true;
			} catch {
				process.stderr.write(`  ${dim("Homebrew install failed, trying curl installer...")}\n`);
			}
		} catch {
			// No brew — fall through to curl
		}
	}
	if (process.platform === "linux" || process.platform === "darwin") {
		try {
			execSync("curl -fsSL https://ollama.com/install.sh | sh", { stdio: "inherit", timeout: 180000 });
			return true;
		} catch {
			return false;
		}
	}
	process.stderr.write(`  ${dim("Download Ollama from: https://ollama.com/download")}\n`);
	return false;
}

function isOllamaServing(): boolean {
	try {
		execFileSync("curl", ["-sf", "http://127.0.0.1:11434/api/tags"], {
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 3000,
		});
		return true;
	} catch {
		return false;
	}
}

function startOllamaServe(): void {
	const child = spawnChild("ollama", ["serve"], { stdio: "ignore", detached: true });
	child.unref();
}

async function pullOllamaModel(model: string): Promise<boolean> {
	process.stderr.write(`\n  ${bold(`Pulling ${model}...`)} ${dim("(this may take a few minutes)")}\n\n`);
	return new Promise((resolve) => {
		const child = spawnChild("ollama", ["pull", model], { stdio: "inherit" });
		child.on("close", (code) => resolve(code === 0));
		child.on("error", () => resolve(false));
	});
}

async function ensureOllamaSetup(promptFn: () => ReturnType<typeof createPrompt>, model: string): Promise<boolean> {
	const shortModel = model.replace("ollama/", "");

	if (!isOllamaInstalled()) {
		process.stderr.write(`\n  ${dim("Ollama is not installed. It's needed to run open-source models locally.")}\n`);
		const prompt = promptFn();
		const install = await prompt.ask(`  ${coral(symbols.arrow)} Install Ollama now? [Y/n]: `);
		prompt.close();
		if (install.toLowerCase() !== "n" && install.toLowerCase() !== "no") {
			const ok = await installOllama();
			if (!ok) {
				process.stderr.write(`\n  ${red("Failed to install Ollama.")}\n`);
				process.stderr.write(`  ${dim("Install manually from https://ollama.com/download")}\n\n`);
				return false;
			}
			process.stderr.write(`  ${green(symbols.check)} Ollama installed\n`);
		} else {
			process.stderr.write(`\n  ${dim("Install later from https://ollama.com/download")}\n\n`);
			return false;
		}
	} else {
		process.stderr.write(`  ${green(symbols.check)} Ollama installed\n`);
	}

	if (!isOllamaServing()) {
		process.stderr.write(`  ${dim("Starting Ollama server...")}\n`);
		startOllamaServe();
		let retries = 10;
		while (retries > 0 && !isOllamaServing()) {
			await new Promise((r) => setTimeout(r, 1000));
			retries--;
		}
		if (isOllamaServing()) {
			process.stderr.write(`  ${green(symbols.check)} Ollama server running\n`);
		} else {
			process.stderr.write(
				`  ${yellow(symbols.warn)} Could not start Ollama server. Run ${bold("ollama serve")} manually.\n`,
			);
			return false;
		}
	} else {
		process.stderr.write(`  ${green(symbols.check)} Ollama server running\n`);
	}

	if (isOllamaModelAvailable(shortModel)) {
		process.stderr.write(`  ${green(symbols.check)} Model ${bold(shortModel)} ready\n\n`);
		return true;
	}

	process.stderr.write(`  ${dim(`Model ${shortModel} not found locally.`)}\n`);
	const prompt = promptFn();
	const pull = await prompt.ask(`\n  ${coral(symbols.arrow)} Pull ${bold(shortModel)} now? [Y/n]: `);
	prompt.close();
	if (pull.toLowerCase() !== "n" && pull.toLowerCase() !== "no") {
		const ok = await pullOllamaModel(shortModel);
		if (!ok) {
			process.stderr.write(`\n  ${red(`Failed to pull ${shortModel}.`)}\n`);
			process.stderr.write(`  ${dim(`Try manually: ollama pull ${shortModel}`)}\n\n`);
			return false;
		}
		process.stderr.write(`  ${green(symbols.check)} Model ${bold(shortModel)} ready\n\n`);
		return true;
	}

	process.stderr.write(`\n  ${dim(`Run later: ollama pull ${shortModel}`)}\n\n`);
	return false;
}

// ── Interactive helpers ───────────────────────────────────────────────────────

function createPrompt(): { ask: (q: string) => Promise<string>; close: () => void } {
	const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
	return {
		ask: (q: string) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim()))),
		close: () => rl.close(),
	};
}

async function readHiddenInput(prompt: string): Promise<string> {
	return new Promise<string>((resolve) => {
		let input = "";
		const origRawMode = process.stdin.isRaw;
		if (process.stdin.isTTY) process.stdin.setRawMode(true);
		process.stdin.resume();

		process.stderr.write(prompt);

		const cleanup = () => {
			process.stdin.removeListener("data", onData);
			if (process.stdin.isTTY && origRawMode !== undefined) {
				process.stdin.setRawMode(origRawMode);
			}
			process.stdin.pause();
		};

		const onData = (buf: Buffer) => {
			const ch = buf.toString();
			if (ch === "\n" || ch === "\r") {
				process.stderr.write("\n");
				cleanup();
				resolve(input);
			} else if (ch === "\x7f" || ch === "\b") {
				if (input.length > 0) {
					input = input.slice(0, -1);
					process.stderr.write("\b \b");
				}
			} else if (ch === "\x03") {
				process.stderr.write("\n");
				cleanup();
				resolve("");
			} else if (ch >= " ") {
				input += ch;
				process.stderr.write(dim("*"));
			}
		};
		process.stdin.on("data", onData);
	});
}

function saveCredential(envVar: string, key: string): void {
	try {
		fs.mkdirSync(SWARM_DIR, { recursive: true });
		let existing = "";
		if (fs.existsSync(CRED_FILE)) {
			existing = fs.readFileSync(CRED_FILE, "utf-8");
			existing = existing
				.split("\n")
				.filter((l) => !l.startsWith(`${envVar}=`))
				.join("\n");
			if (existing && !existing.endsWith("\n")) existing += "\n";
		}
		fs.writeFileSync(CRED_FILE, `${existing}${envVar}=${key}\n`, { mode: 0o600 });
	} catch {
		// Fall through — key is still set in process.env
	}
	process.env[envVar] = key;
}

function saveUserConfig(agent: string, model: string): void {
	try {
		fs.mkdirSync(SWARM_DIR, { recursive: true });
		const lines = [
			"# Swarm user preferences (generated by onboarding)",
			`# Created: ${new Date().toISOString()}`,
			"",
			`default_agent: ${agent}`,
			`default_model: ${model}`,
			"",
		];
		fs.writeFileSync(USER_CONFIG_FILE, lines.join("\n"), "utf-8");
	} catch {
		// Non-fatal
	}
}

// ── Swarm mesh art ────────────────────────────────────────────────────────────

const n = (s: string) => cyan(s); // node
const c = (s: string) => dim(s); // connection
const o = (s: string) => coral(s); // orchestrator (center)

function buildSwarmArt(): string[] {
	const COLS = 7;
	const CENTER = 3;

	function nodeRow(showCenter: boolean): string {
		const parts: string[] = [];
		for (let i = 0; i < COLS; i++) {
			if (i > 0) parts.push(c("\u2500\u2500\u2500"));
			parts.push(showCenter && i === CENTER ? o("\u25C6") : n("\u25CF"));
		}
		return parts.join("");
	}

	function diagRow(startBackslash: boolean): string {
		const parts: string[] = [];
		for (let i = 0; i < COLS; i++) {
			parts.push(c("\u2502"));
			if (i < COLS - 1) {
				const back = (i % 2 === 0) === startBackslash;
				parts.push(` ${c(back ? "\u2572" : "\u2571")} `);
			}
		}
		return parts.join("");
	}

	return [nodeRow(false), diagRow(true), nodeRow(true), diagRow(false), nodeRow(false)];
}

const SWARM_ART = buildSwarmArt();

// ── Two-column renderer ───────────────────────────────────────────────────────

function padRight(text: string, width: number): string {
	const visible = stripAnsi(text).length;
	if (visible >= width) return text;
	return text + " ".repeat(width - visible);
}

function renderTwoColumn(left: string[], right: string[], leftWidth: number): void {
	const sep = ` ${dim(symbols.vertLine)} `;
	const maxLines = Math.max(left.length, right.length);
	for (let i = 0; i < maxLines; i++) {
		const l = padRight(left[i] || "", leftWidth);
		const r = right[i] || "";
		process.stderr.write(`${l}${sep}${r}\n`);
	}
}

// ── Section header helper ─────────────────────────────────────────────────────

function sectionHeader(title: string, w: number): void {
	const label = ` ${title} `;
	const dashes = Math.max(0, w - stripAnsi(label).length - 4);
	const left = symbols.horizontal.repeat(2);
	const right = symbols.horizontal.repeat(Math.max(0, dashes));
	process.stderr.write(`\n  ${dim(left)}${coral(bold(label))}${dim(right)}\n\n`);
}

// ── Onboarding flow ───────────────────────────────────────────────────────────

export async function runOnboarding(): Promise<void> {
	if (!isFirstRun()) return;

	if (isJsonMode()) {
		markInitialized();
		return;
	}

	if (getLogLevel() === "quiet") {
		markInitialized();
		return;
	}

	const w = Math.min(termWidth(), 80);

	// ── Gather environment info ──────────────────────────────────────────
	const username = os.userInfo().username || "there";
	const gitVer = await gitVersion();
	const apiKeys = detectApiKeys();
	const agents = await checkAgentBackends();
	const availableAgents = agents.filter((a) => a.ok);
	const missingAgents = agents.filter((a) => !a.ok);

	// ── Header line ──────────────────────────────────────────────────────
	if (isTTY) {
		const label = ` swarm v${VERSION} `;
		const dashCount = Math.max(0, w - label.length - 4);
		const leftDash = symbols.horizontal.repeat(2);
		const rightDash = symbols.horizontal.repeat(Math.max(0, dashCount));
		process.stderr.write(`\n  ${dim(`${leftDash}${bold(coral(label))}${dim(rightDash)}`)}\n`);
	} else {
		process.stderr.write(`\n  swarm v${VERSION}\n`);
	}

	if (!isTTY) {
		process.stderr.write(`  Welcome to swarm, ${username}!\n\n`);
		process.stderr.write(`  Usage: swarm --dir ./project "your task"\n`);
		process.stderr.write(`  Docs:  https://github.com/kingjulio8238/swarm-code\n\n`);
		markInitialized();
		return;
	}

	// ── Build left column ────────────────────────────────────────────────
	const LEFT_W = 36;
	const left: string[] = [];

	left.push(`  ${bold("Welcome to swarm, ")}${bold(coral(username))}${bold("!")}`);
	left.push("");

	for (const artLine of SWARM_ART) {
		const artVisible = stripAnsi(artLine).length;
		const artPad = Math.max(0, Math.floor((LEFT_W - artVisible) / 2));
		left.push(" ".repeat(artPad) + artLine);
	}

	left.push("");
	const primaryAgent = availableAgents.length > 0 ? availableAgents[0].name : "opencode";
	left.push(`  ${dim(`v${VERSION}`)} ${dim(symbols.dot)} ${dim(`${primaryAgent} agent`)}`);
	left.push(`  ${dim(process.cwd())}`);

	// ── Build right column ───────────────────────────────────────────────
	const right: string[] = [];

	right.push(coral(bold("Tips for getting started")));
	right.push(`Point swarm at any git repo with a task:`);
	right.push(`${yellow("$")} swarm --dir ./project ${dim('"your task"')}`);
	right.push(`Use ${cyan("--dry-run")} to plan without executing`);
	right.push(`Use ${cyan("--verbose")} for detailed progress`);
	right.push("");

	right.push(coral(bold("Environment")));

	if (gitVer) {
		right.push(`${green(symbols.check)} git ${dim(`v${gitVer}`)}`);
	} else {
		right.push(`${red(symbols.cross)} git ${dim("not found (required)")}`);
	}

	if (apiKeys.size > 0) {
		for (const p of PROVIDERS) {
			const val = apiKeys.get(p.envVar);
			if (val) right.push(`${green(symbols.check)} ${p.name} ${dim(maskKey(val))}`);
		}
	} else {
		right.push(`${yellow(symbols.warn)} ${dim("No API keys configured")}`);
	}

	for (const a of availableAgents) {
		right.push(`${green(symbols.check)} ${a.name} ${dim("agent")}`);
	}
	for (const a of missingAgents) {
		right.push(`${dim(symbols.dash)} ${dim(a.name)} ${dim("not found")}`);
	}

	// ── Render two-column layout ─────────────────────────────────────────
	renderTwoColumn(left, right, LEFT_W);

	// ══════════════════════════════════════════════════════════════════════
	// AGENT SETUP WIZARD
	// ══════════════════════════════════════════════════════════════════════

	sectionHeader("Agent Setup", w);

	// ── Step 1: Pick default agent ───────────────────────────────────────
	let chosenAgent = "opencode";

	if (availableAgents.length > 1) {
		process.stderr.write(`  ${bold("Choose your default coding agent:")}\n\n`);

		const agentChoices = availableAgents.map((a, i) => {
			const info = AGENT_PROVIDERS[a.name];
			const desc = info ? dim(info.description) : "";
			const rec = a.name === "opencode" ? ` ${coral("(recommended)")}` : "";
			return { idx: i + 1, name: a.name, line: `    ${cyan(String(i + 1))}  ${bold(a.name)}${rec}  ${desc}` };
		});

		for (const c of agentChoices) process.stderr.write(`${c.line}\n`);
		process.stderr.write("\n");

		const prompt = createPrompt();
		const agentChoice = await prompt.ask(`  ${coral(symbols.arrow)} Choice [1]: `);
		prompt.close();

		const idx = parseInt(agentChoice, 10);
		if (idx >= 1 && idx <= agentChoices.length) {
			chosenAgent = agentChoices[idx - 1].name;
		} else if (agentChoice === "") {
			chosenAgent = agentChoices[0].name;
		}

		process.stderr.write(`  ${green(symbols.check)} Default agent: ${bold(chosenAgent)}\n`);
	} else if (availableAgents.length === 1) {
		chosenAgent = availableAgents[0].name;
		process.stderr.write(
			`  ${green(symbols.check)} Default agent: ${bold(chosenAgent)} ${dim("(only available backend)")}\n`,
		);
	} else {
		// No agents installed — show install instructions
		process.stderr.write(`  ${yellow(symbols.warn)} No coding agents found. Install at least one:\n\n`);
		for (const [name, info] of Object.entries(AGENT_PROVIDERS)) {
			if (name === "direct-llm") continue;
			process.stderr.write(`    ${cyan(symbols.arrow)} ${bold(name)}  ${dim(info.install)}\n`);
			process.stderr.write(`      ${dim(info.description)}\n`);
		}
		process.stderr.write(`\n  ${dim("Using direct-llm (no coding agent) as fallback.")}\n`);
		chosenAgent = "direct-llm";
	}

	// ── Step 2: Configure backend / API keys ────────────────────────────
	const agentInfo = AGENT_PROVIDERS[chosenAgent];
	const neededKeys = agentInfo?.required ?? ["ANTHROPIC_API_KEY"];
	const needsAnyKey = neededKeys.length > 1;
	const hasAnyNeeded = neededKeys.some((k) => apiKeys.has(k));
	let chosenModel = "anthropic/claude-sonnet-4-6";
	let usesOllama = false;
	let usesOpenRouter = false;

	// OpenCode with no API keys → offer Ollama (default) or OpenRouter
	if (chosenAgent === "opencode" && !hasAnyNeeded) {
		sectionHeader("Backend", w);

		process.stderr.write(`  ${bold("OpenCode")} ${dim("— choose your backend:")}\n\n`);
		process.stderr.write(`    ${cyan("1")}  Ollama       ${dim("Run models locally (free, requires download)")}\n`);
		process.stderr.write(`    ${cyan("2")}  OpenRouter   ${dim("Cloud API for 200+ models (requires API key)")}\n`);
		process.stderr.write(`    ${cyan("3")}  API Key      ${dim("Configure Anthropic/OpenAI/Google directly")}\n`);
		process.stderr.write("\n");

		const prompt = createPrompt();
		const backendChoice = await prompt.ask(`  ${coral(symbols.arrow)} Backend [1]: `);
		prompt.close();

		const choice = backendChoice.trim();

		if (choice === "2") {
			// OpenRouter setup
			process.stderr.write("\n");
			const keyPrompt = createPrompt();
			const orKey = await keyPrompt.ask(`  ${coral(symbols.arrow)} OPENROUTER_API_KEY: `);
			keyPrompt.close();

			if (orKey?.trim()) {
				process.env.OPENROUTER_API_KEY = orKey.trim();
				saveCredential("OPENROUTER_API_KEY", orKey.trim());
				process.stderr.write(`  ${green(symbols.check)} OpenRouter configured\n`);
				chosenModel = "openrouter/auto";
				usesOpenRouter = true;
			} else {
				process.stderr.write(`  ${dim("No key provided — you can set OPENROUTER_API_KEY in .env later")}\n`);
			}
		} else if (choice === "3") {
			// Fall through to standard API key setup below
		} else {
			// Default: Ollama setup
			process.stderr.write("\n");
			const ok = await ensureOllamaSetup(createPrompt, "ollama/deepseek-coder-v2");
			if (ok) {
				usesOllama = true;
				chosenModel = "ollama/deepseek-coder-v2";
			}
		}

		// If choice was "3", do the standard API key flow
		if (choice === "3") {
			sectionHeader("API Keys", w);
			process.stderr.write(`  ${bold(chosenAgent)} supports multiple providers. Configure at least one:\n\n`);

			const missingKeys = neededKeys.filter((k) => !apiKeys.has(k));
			for (const envVar of missingKeys) {
				const provider = PROVIDERS.find((p) => p.envVar === envVar);
				if (!provider) continue;

				const kp = createPrompt();
				const yn = await kp.ask(`  ${coral(symbols.arrow)} Configure ${bold(provider.name)} (${dim(envVar)})? [y/n]: `);
				kp.close();

				if (yn.toLowerCase() !== "y" && yn.toLowerCase() !== "yes") {
					process.stderr.write(`  ${dim(symbols.dash)} Skipped ${provider.name}\n`);
					continue;
				}

				process.stderr.write(`  ${dim(`Paste your ${provider.name} API key (input hidden):`)}\n`);
				const key = await readHiddenInput(`  ${coral(symbols.arrow)} `);

				if (key && key.length >= 10) {
					saveCredential(envVar, key);
					apiKeys.set(envVar, key);
					process.stderr.write(
						`  ${green(symbols.check)} Saved ${provider.name} key to ${dim("~/.swarm/credentials")}\n\n`,
					);
				} else {
					process.stderr.write(`  ${dim("Skipped — set later in .env or ~/.swarm/credentials")}\n\n`);
				}

				if (apiKeys.has(envVar)) break;
			}
		}
	} else if (!hasAnyNeeded) {
		// Non-opencode agent with missing keys — standard API key flow
		const missingKeys = neededKeys.filter((k) => !apiKeys.has(k));
		if (missingKeys.length > 0) {
			sectionHeader("API Keys", w);

			if (needsAnyKey) {
				process.stderr.write(`  ${bold(chosenAgent)} supports multiple providers. Configure at least one:\n\n`);
			} else {
				process.stderr.write(`  ${bold(chosenAgent)} needs the following API key(s):\n\n`);
			}

			for (const envVar of missingKeys) {
				const provider = PROVIDERS.find((p) => p.envVar === envVar);
				if (!provider) continue;

				const prompt = createPrompt();
				const yn = await prompt.ask(
					`  ${coral(symbols.arrow)} Configure ${bold(provider.name)} (${dim(envVar)})? [y/n]: `,
				);
				prompt.close();

				if (yn.toLowerCase() !== "y" && yn.toLowerCase() !== "yes") {
					process.stderr.write(`  ${dim(symbols.dash)} Skipped ${provider.name}\n`);
					continue;
				}

				process.stderr.write(`  ${dim(`Paste your ${provider.name} API key (input hidden):`)}\n`);
				const key = await readHiddenInput(`  ${coral(symbols.arrow)} `);

				if (key && key.length >= 10) {
					saveCredential(envVar, key);
					apiKeys.set(envVar, key);
					process.stderr.write(
						`  ${green(symbols.check)} Saved ${provider.name} key to ${dim("~/.swarm/credentials")}\n\n`,
					);
				} else {
					process.stderr.write(`  ${dim("Skipped — set later in .env or ~/.swarm/credentials")}\n\n`);
				}

				if (needsAnyKey && apiKeys.has(envVar)) break;
			}
		}
	} else {
		process.stderr.write(`  ${green(symbols.check)} API keys already configured\n`);
	}

	// ── Step 3: Choose default model ─────────────────────────────────────
	if (!usesOllama && !usesOpenRouter) {
		const configuredProviders = PROVIDERS.filter((p) => apiKeys.has(p.envVar));

		if (configuredProviders.length > 0) {
			sectionHeader("Default Model", w);

			const modelOptions = configuredProviders.flatMap((p) => {
				const models: { label: string; value: string; recommended?: boolean }[] = [];
				if (p.envVar === "ANTHROPIC_API_KEY") {
					models.push(
						{
							label: `claude-sonnet-4-6 ${dim("(fast, capable)")}`,
							value: "anthropic/claude-sonnet-4-6",
							recommended: true,
						},
						{
							label: `claude-opus-4-6 ${dim("(most capable)")}`,
							value: "anthropic/claude-opus-4-6",
						},
					);
				} else if (p.envVar === "OPENAI_API_KEY") {
					models.push(
						{ label: `gpt-4o ${dim("(fast, versatile)")}`, value: "openai/gpt-4o" },
						{ label: `o3 ${dim("(reasoning)")}`, value: "openai/o3" },
					);
				} else if (p.envVar === "GEMINI_API_KEY") {
					models.push(
						{
							label: `gemini-2.5-flash ${dim("(fast, cheap)")}`,
							value: "google/gemini-2.5-flash",
						},
						{ label: `gemini-2.5-pro ${dim("(capable)")}`, value: "google/gemini-2.5-pro" },
					);
				}
				return models;
			});

			if (modelOptions.length > 0) {
				process.stderr.write(`  ${bold("Pick a default model for coding threads:")}\n\n`);

				for (let i = 0; i < modelOptions.length; i++) {
					const opt = modelOptions[i];
					const rec = opt.recommended ? ` ${coral("(recommended)")}` : "";
					process.stderr.write(`    ${cyan(String(i + 1))}  ${opt.label}${rec}\n`);
				}
				process.stderr.write("\n");

				const prompt = createPrompt();
				const modelChoice = await prompt.ask(`  ${coral(symbols.arrow)} Choice [1]: `);
				prompt.close();

				const idx = parseInt(modelChoice, 10);
				if (idx >= 1 && idx <= modelOptions.length) {
					chosenModel = modelOptions[idx - 1].value;
				} else {
					chosenModel = modelOptions[0].value;
				}

				process.stderr.write(`  ${green(symbols.check)} Default model: ${bold(chosenModel)}\n`);
			}
		}
	}

	// ── Step 4: Save config ──────────────────────────────────────────────
	saveUserConfig(chosenAgent, chosenModel);

	// ── Final summary ────────────────────────────────────────────────────
	sectionHeader("Ready", w);

	process.stderr.write(`  ${green(symbols.check)} Agent:  ${bold(chosenAgent)}\n`);
	process.stderr.write(`  ${green(symbols.check)} Model:  ${bold(chosenModel)}\n`);

	if (usesOllama) {
		process.stderr.write(`  ${green(symbols.check)} Backend: ${bold("Ollama")} ${dim("(local)")}\n`);
	} else if (usesOpenRouter) {
		process.stderr.write(`  ${green(symbols.check)} Backend: ${bold("OpenRouter")}\n`);
	} else {
		const keyNames = [...apiKeys.keys()].map((k) => {
			const p = PROVIDERS.find((pr) => pr.envVar === k);
			return p?.name ?? k;
		});
		if (keyNames.length > 0) {
			process.stderr.write(`  ${green(symbols.check)} Keys:   ${bold(keyNames.join(", "))}\n`);
		}
	}

	process.stderr.write(`  ${green(symbols.check)} Config: ${dim("~/.swarm/config.yaml")}\n`);
	process.stderr.write("\n");

	// If still missing critical deps, show warnings
	if (!gitVer) {
		process.stderr.write(`  ${red(symbols.cross)} ${bold("git is required.")} Install it before using swarm.\n`);
	}
	if (apiKeys.size === 0 && !usesOllama && !usesOpenRouter) {
		process.stderr.write(`  ${yellow(symbols.warn)} ${bold("No API keys configured.")}\n`);
		process.stderr.write(
			`  ${dim("Add keys to")} ${cyan("~/.swarm/credentials")} ${dim("or")} ${cyan(".env")}${dim(":")}\n`,
		);
		process.stderr.write(`    ${dim("ANTHROPIC_API_KEY=sk-ant-...")}\n`);
		process.stderr.write(`    ${dim("OPENAI_API_KEY=sk-...")}\n`);
		process.stderr.write(`    ${dim("GEMINI_API_KEY=AI...")}\n`);
	}

	process.stderr.write("\n");
	markInitialized();
}
