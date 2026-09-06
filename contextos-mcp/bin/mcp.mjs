#!/usr/bin/env node

/**
 * contextos-mcp — ContextOS Execution Layer and MCP Server CLI
 *
 * This binary directly boots the ContextOS MCP server via stdio transport.
 * It targets compiled dist/mcp/server.js in production, falling back to
 * src/mcp/server.ts with tsx in local development.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distServer = join(__dirname, "..", "dist", "mcp", "server.js");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(`
contextos-mcp — ContextOS Execution Layer and MCP Server CLI

Usage:
  contextos-mcp [options]

Options:
  --dir <path>     Target repository directory (default: current working directory)
  --help, -h       Show this help message
`);
	process.exit(0);
}

if (existsSync(distServer)) {
	try {
		const mod = await import(pathToFileURL(distServer).href);
		if (typeof mod.startMcpServer === "function") {
			await mod.startMcpServer(process.argv.slice(2));
		}
	} catch (err) {
		process.stderr.write(`[contextos-mcp] Startup error: ${err}\n`);
		process.exit(1);
	}
} else {
	const srcServer = join(__dirname, "..", "src", "mcp", "server.ts");
	const { spawn } = await import("node:child_process");
	const tsxBin = join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
	const child = spawn(tsxBin, [srcServer, ...process.argv.slice(2)], {
		stdio: "inherit",
	});
	child.on("exit", (code) => process.exit(code ?? 1));
	child.on("error", (err) => {
		process.stderr.write(`[contextos-mcp] Failed to start tsx: ${err.message}\n`);
		process.exit(1);
	});
}
