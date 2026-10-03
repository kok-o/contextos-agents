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
	let buildDir: string;
	let sharedRuntimeBefore: Buffer | undefined;
	let childClosed: Promise<void> | undefined;

	beforeAll(() => {
		const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
		expectedVersion = pkgJson.version;

		tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "contextos-mcp-smoke-")));

		// Build in a private source copy; parallel handshake tests use pkgDir/dist.
		const runtime = path.join(pkgDir, "dist/runtime/thread-store.cjs");
		sharedRuntimeBefore = fs.existsSync(runtime) ? fs.readFileSync(runtime) : undefined;
		buildDir = path.join(tempDir, "source");
		fs.mkdirSync(buildDir);
		for (const entry of ["src", "bin", "scripts", "package.json", "package-lock.json", "tsconfig.json"]) {
			fs.cpSync(path.join(pkgDir, entry), path.join(buildDir, entry), { recursive: true });
		}
		fs.cpSync(path.resolve(pkgDir, "../.agents/transaction-core"), path.join(tempDir, ".agents/transaction-core"), {
			recursive: true,
		});
		fs.symlinkSync(
			fs.realpathSync(path.join(pkgDir, "node_modules")),
			path.join(buildDir, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
		execSync("npm run build", { cwd: buildDir, stdio: "pipe" });
		execSync(`npm pack --ignore-scripts --pack-destination "${tempDir.replace(/\\/g, "/")}"`, {
			cwd: buildDir,
			stdio: "pipe",
		});
		// Packaged handshake must not borrow sibling compiler files from the build.
		fs.rmSync(path.join(tempDir, ".agents"), { recursive: true, force: true });

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

	afterAll(async () => {
		await childClosed;
		if (!tempDir) return;
		expect(path.dirname(tempDir)).toBe(fs.realpathSync(os.tmpdir()));
		expect(path.basename(tempDir)).toMatch(/^contextos-mcp-smoke-/);
		const dependencies = path.join(buildDir, "node_modules");
		if (fs.existsSync(dependencies)) fs.unlinkSync(dependencies);
		fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	});

	it("leaves the shared checkout runtime unchanged during its isolated build", () => {
		const runtime = path.join(pkgDir, "dist/runtime/thread-store.cjs");
		expect(fs.existsSync(runtime)).toBe(sharedRuntimeBefore !== undefined);
		if (sharedRuntimeBefore) expect(fs.readFileSync(runtime)).toEqual(sharedRuntimeBefore);
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
		// Windows keeps the process working directory locked until close, not kill().
		childClosed = new Promise<void>((resolve) => child.once("close", () => resolve()));

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
					new Error(`Timeout waiting for MCP initialize response.\nStdout: ${stdoutBuffer}\nStderr: ${stderrBuffer}`),
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

		await childClosed;
		expect(stderrBuffer).not.toContain("ERR_MODULE_NOT_FOUND");
		expect(response.jsonrpc).toBe("2.0");
		expect(response.id).toBe(1);
		expect(response.result).toBeDefined();
		expect(response.result.serverInfo.name).toBe("contextos-mcp");
		expect(response.result.capabilities.tools).toBeDefined();
	}, 20_000);
});
