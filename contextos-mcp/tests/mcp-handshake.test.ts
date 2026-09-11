import { spawn } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("MCP Protocol Handshake & CLI Smoke Test", () => {
	it("boots bin/mcp.mjs, performs initialize handshake, and lists registered tools", async () => {
		const mcpBin = path.resolve(__dirname, "..", "bin", "mcp.mjs");
		const projectDir = path.resolve(__dirname, "..");

		const child = spawn(process.execPath, [mcpBin, "--dir", projectDir, "--enable-runtime"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				NODE_ENV: "test",
			},
		});

		let stdoutData = "";
		let stderrData = "";

		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk) => {
			stdoutData += chunk;
		});

		child.stderr.setEncoding("utf-8");
		child.stderr.on("data", (chunk) => {
			stderrData += chunk;
		});

		const waitForMessage = (id: number, timeoutMs = 7000): Promise<any> => {
			return new Promise((resolve, reject) => {
				const start = Date.now();
				const interval = setInterval(() => {
					const lines = stdoutData.split("\n");
					for (const line of lines) {
						if (!line.trim()) continue;
						try {
							const msg = JSON.parse(line.trim());
							if (msg.id === id) {
								clearInterval(interval);
								return resolve(msg);
							}
						} catch {
							// line might be partial or non-json
						}
					}
					if (Date.now() - start > timeoutMs) {
						clearInterval(interval);
						reject(new Error(`Timeout waiting for response id ${id}. stderr:\n${stderrData}`));
					}
				}, 50);
			});
		};

		try {
			// Step 1: Send initialize request
			const initRequest = {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: {
						name: "vitest-smoke-client",
						version: "1.0.0",
					},
				},
			};

			child.stdin.write(`${JSON.stringify(initRequest)}\n`);

			const initResponse = await waitForMessage(1);
			expect(initResponse).toBeDefined();
			expect(initResponse.result).toBeDefined();
			expect(initResponse.result.serverInfo.name).toBe("contextos-mcp");
			expect(initResponse.result.capabilities.tools).toBeDefined();

			// Step 2: Send initialized notification
			const initNotification = {
				jsonrpc: "2.0",
				method: "notifications/initialized",
			};
			child.stdin.write(`${JSON.stringify(initNotification)}\n`);

			// Step 3: Request tools/list
			const listToolsRequest = {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			};
			child.stdin.write(`${JSON.stringify(listToolsRequest)}\n`);

			const listResponse = await waitForMessage(2);
			expect(listResponse).toBeDefined();
			expect(listResponse.result).toBeDefined();
			expect(Array.isArray(listResponse.result.tools)).toBe(true);

			const toolNames = listResponse.result.tools.map((t: any) => t.name);
			expect(toolNames).toContain("contextos_delegate");
			expect(toolNames).toContain("contextos_status");
			expect(toolNames).toContain("contextos_compare");
			expect(toolNames).toContain("contextos_diff");
			expect(toolNames).toContain("contextos_merge");
			expect(toolNames).toContain("contextos_cleanup");
		} finally {
			child.kill("SIGTERM");
		}
	});
});
