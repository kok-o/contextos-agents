import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { loadHooks, runHooks } from "../../src/hooks/runner.js";

describe("Task 0.5: Opt-in Repository Hooks Security", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "contextos-hooks-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(testDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
		vi.restoreAllMocks();
	});

	it("defaults allow_hooks to false in configuration", () => {
		const config = loadConfig(testDir);
		expect(config.allow_hooks).toBe(false);
	});

	it("reads allow_hooks: true from swarm_config.yaml when explicitly set", () => {
		fs.writeFileSync(path.join(testDir, "swarm_config.yaml"), "allow_hooks: true\n");
		const config = loadConfig(testDir);
		expect(config.allow_hooks).toBe(true);
	});

	it("blocks .swarm/hooks.yaml by default when allow_hooks is false and emits structured warning", () => {
		const swarmDir = path.join(testDir, ".swarm");
		fs.mkdirSync(swarmDir, { recursive: true });
		const markerFile = path.join(testDir, "pwned.txt");

		fs.writeFileSync(
			path.join(swarmDir, "hooks.yaml"),
			`post_thread:\n  - command: node -e 'require("fs").writeFileSync("${markerFile.replace(/\\/g, "/")}", "pwned")'\n`,
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const hooks = loadHooks(testDir, false);

		expect(hooks.post_thread).toHaveLength(0);
		expect(hooks.post_merge).toHaveLength(0);
		expect(hooks.post_session).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalledWith(
			"[hooks] Hooks execution is disabled by default. Pass --allow-hooks or set allow_hooks: true in config to enable.",
		);
		expect(fs.existsSync(markerFile)).toBe(false);
	});

	it("blocks .agents/hooks.json by default when allow_hooks is false", () => {
		const agentsDir = path.join(testDir, ".agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		const markerFile = path.join(testDir, "pwned-agents.txt");

		fs.writeFileSync(
			path.join(agentsDir, "hooks.json"),
			JSON.stringify({
				post_merge: [
					{
						command: `node -e 'require("fs").writeFileSync("${markerFile.replace(/\\/g, "/")}", "pwned")'`,
						on_failure: "warn",
					},
				],
			}),
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const hooks = loadHooks(testDir, false);

		expect(hooks.post_merge).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalledWith(
			"[hooks] Hooks execution is disabled by default. Pass --allow-hooks or set allow_hooks: true in config to enable.",
		);
		expect(fs.existsSync(markerFile)).toBe(false);
	});

	it("loads and executes hooks when allow_hooks is explicitly true", () => {
		const swarmDir = path.join(testDir, ".swarm");
		fs.mkdirSync(swarmDir, { recursive: true });
		const markerFile = path.join(testDir, "allowed.txt");

		fs.writeFileSync(
			path.join(swarmDir, "hooks.yaml"),
			`post_thread:\n  - command: node -e "require('fs').writeFileSync('${markerFile.replace(/\\/g, "/")}', 'ok')"\n`,
		);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const hooks = loadHooks(testDir, true);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(hooks.post_thread).toHaveLength(1);

		const results = runHooks(hooks.post_thread, testDir, "post_thread", true);
		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(true);
		expect(fs.existsSync(markerFile)).toBe(true);
		expect(fs.readFileSync(markerFile, "utf-8")).toBe("ok");
	});

	it("runHooks refuses execution if allow_hooks is false even if hook objects were supplied", () => {
		const markerFile = path.join(testDir, "should-not-run.txt");
		const hooks = [
			{
				command: `node -e "require('fs').writeFileSync('${markerFile.replace(/\\/g, "/")}', 'fail')"`,
				on_failure: "warn" as const,
			},
		];

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const results = runHooks(hooks, testDir, "post_thread", false);
		expect(results).toHaveLength(0);
		expect(fs.existsSync(markerFile)).toBe(false);
		expect(warnSpy).toHaveBeenCalled();
	});
});
