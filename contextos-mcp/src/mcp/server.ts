/**
 * ContextOS MCP server.
 *
 * Exposes ContextOS capabilities as MCP tools that can be called by
 * Antigravity IDE or any MCP-compatible client.
 *
 * Transport: stdio (reads JSON-RPC from stdin, writes to stdout).
 * IMPORTANT: Never use console.log() — it corrupts the MCP protocol.
 * All logging goes to stderr via process.stderr.write().
 *
 * Usage:
 *   node dist/mcp/server.js                     # Start MCP server
 *   node dist/mcp/server.js --dir ./my-project  # Start with default directory
 */

// Load environment variables FIRST (API keys)
import "../env.js";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { cleanupAllSessions } from "./session.js";
import { registerContextosTools } from "./tools/contextos.js";

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string): void {
	process.stderr.write(`[contextos-mcp] ${msg}\n`);
}

// ── Server ─────────────────────────────────────────────────────────────────

export async function startMcpServer(args: string[]): Promise<void> {
	// Parse --dir from args
	let defaultDir: string | undefined;
	const dirIdx = args.indexOf("--dir");
	if (dirIdx !== -1 && dirIdx + 1 < args.length) {
		defaultDir = args[dirIdx + 1];
	}

	// Parse --enable-runtime from args
	const enableRuntime = args.includes("--enable-runtime");

	// Create MCP server
	const server = new McpServer(
		{
			name: "contextos-mcp",
			version: getVersion(),
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Register ContextOS tools
	registerContextosTools(server, defaultDir, enableRuntime);

	// Handle graceful shutdown
	const shutdown = async () => {
		log("Shutting down...");
		await cleanupAllSessions();
		await server.close();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	// Connect via stdio transport
	const transport = new StdioServerTransport();
	await server.connect(transport);

	log(`ContextOS MCP Server started${defaultDir ? ` (default dir: ${defaultDir})` : ""}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getVersion(): string {
	try {
		const __dir = dirname(fileURLToPath(import.meta.url));
		const pkgPath = join(__dir, "..", "..", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		return pkg.version || "0.1.0";
	} catch {
		return "0.1.0";
	}
}

// ── Direct execution ──────────────────────────────────────────────────────

// If this file is run directly, start the server
const isMain = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server.ts"));

if (isMain) {
	startMcpServer(process.argv.slice(2)).catch((err) => {
		process.stderr.write(`[contextos-mcp] Fatal: ${err}\n`);
		process.exit(1);
	});
}
