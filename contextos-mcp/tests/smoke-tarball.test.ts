import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Task 0.7: Packaged MCP Tarball Smoke-Test & Release Freeze", () => {
	const pkgDir = path.resolve(__dirname, "..");
	let tempDir: string;
	let extractedPkgDir: string;
	let expectedVersion: string;

	beforeAll(() => {
		const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
		expectedVersion = pkgJson.version;

		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "contextos-mcp-smoke-"));

		// 1. Build and pack into tempDir
		execSync("npm run build", { cwd: pkgDir, stdio: "pipe" });
		execSync(`npm pack --pack-destination "${tempDir.replace(/\\/g, "/")}"`, {
			cwd: pkgDir,
			stdio: "pipe",
		});

		// 2. Find .tgz
		const files = fs.readdirSync(tempDir);
		const tarball = files.find((f) => f.endsWith(".tgz"));
		if (!tarball) {
			throw new Error(`Failed to find packed .tgz in ${tempDir}`);
		}

		// 3. Extract to clean temp directory
		const tarballPath = path.join(tempDir, tarball);
		execSync(`tar -xzf "${tarballPath.replace(/\\/g, "/")}" -C "${tempDir.replace(/\\/g, "/")}"`, {
			stdio: "pipe",
		});

		extractedPkgDir = path.join(tempDir, "package");
		expect(fs.existsSync(extractedPkgDir)).toBe(true);
	}, 60_000);

	afterAll(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	it("executes bin/mcp.mjs --version and outputs exact package version", () => {
		const output = execSync("node bin/mcp.mjs --version", {
			cwd: extractedPkgDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();

		expect(output).toBe(expectedVersion);
	});

	it("executes bin/mcp.mjs -v alias and outputs exact package version", () => {
		const output = execSync("node bin/mcp.mjs -v", {
			cwd: extractedPkgDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();

		expect(output).toBe(expectedVersion);
	});

	it("completes stdio JSON-RPC initialize handshake in isolated environment without ERR_MODULE_NOT_FOUND", async () => {
		const binPath = path.join(extractedPkgDir, "bin", "mcp.mjs");
		const child = spawn(process.execPath, [binPath], {
			cwd: extractedPkgDir,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				NODE_ENV: "production",
			},
		});

		let stdoutBuffer = "";
		let stderrBuffer = "";

		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBuffer += chunk.toString("utf8");
		});

		child.stderr.on("data", (chunk: Buffer) => {
			stderrBuffer += chunk.toString("utf8");
		});

		const initRequest = {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: {
					name: "smoke-tester",
					version: "1.0.0",
				},
			},
		};

		child.stdin.write(`${JSON.stringify(initRequest)}\n`);

		// Wait for JSON-RPC response or timeout
		const response = await new Promise<any>((resolve, reject) => {
			const timeout = setTimeout(() => {
				child.kill("SIGKILL");
				reject(
					new Error(
						`Timeout waiting for MCP initialize response.\nStdout: ${stdoutBuffer}\nStderr: ${stderrBuffer}`,
					),
				);
			}, 15_000);

			const checkBuffer = () => {
				const lines = stdoutBuffer.split("\n");
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const parsed = JSON.parse(trimmed);
						if (parsed.id === 1) {
							clearTimeout(timeout);
							child.kill("SIGTERM");
							resolve(parsed);
							return;
						}
					} catch {
						// wait for more data
					}
				}
			};

			child.stdout.on("data", checkBuffer);
		});

		expect(stderrBuffer).not.toContain("ERR_MODULE_NOT_FOUND");
		expect(response.jsonrpc).toBe("2.0");
		expect(response.id).toBe(1);
		expect(response.result).toBeDefined();
		expect(response.result.serverInfo.name).toBe("contextos-mcp");
		expect(response.result.capabilities.tools).toBeDefined();
	}, 20_000);
});
