import { spawn } from "node:child_process";

/**
 * Checks if a command/executable exists on the system PATH in a cross-platform manner.
 * On Windows, uses `where.exe`.
 * On POSIX (Linux/macOS), uses `which`.
 */
export async function commandExists(cmd: string): Promise<boolean> {
	const resolved = await resolveExecutablePath(cmd);
	return resolved !== null;
}

/**
 * Resolves the full path to an executable from PATH.
 * On Windows, resolves .cmd, .bat, or .exe paths so they can be executed without shell: true.
 */
export async function resolveExecutablePath(cmd: string): Promise<string | null> {
	if (!cmd || typeof cmd !== "string") return null;

	const isWindows = process.platform === "win32";
	const checkTool = isWindows ? "where.exe" : "which";

	return new Promise((resolve) => {
		try {
			const proc = spawn(checkTool, [cmd], { stdio: ["ignore", "pipe", "ignore"] });
			let stdout = "";
			proc.stdout?.on("data", (d) => (stdout += d.toString()));
			proc.on("close", (code) => {
				if (code === 0 && stdout.trim()) {
					const firstLine = stdout.trim().split(/\r?\n/)[0].trim();
					resolve(firstLine || null);
				} else {
					resolve(null);
				}
			});
			proc.on("error", () => resolve(null));
		} catch {
			resolve(null);
		}
	});
}
