import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { resolveExecutablePath } from "./command-exists.js";

/**
 * Escapes an argument for Windows cmd.exe /s /c invocation to prevent
 * command chaining (&, |, &&, ||), variable expansion (%VAR%), and redirections (<, >).
 */
export function escapeWindowsArg(arg: string): string {
	if (!arg) return '""';
	// Double all percent signs to prevent %VAR% expansion in cmd.exe
	let escaped = arg.replace(/%/g, "%%");
	// Escape backslashes before quotes and escape quotes
	escaped = escaped.replace(/(\\*)"/g, '$1$1\\"');
	// If it contains spaces or metacharacters, wrap in double quotes
	if (/[ \t\n\v"&|<>^]/.test(escaped)) {
		return `"${escaped}"`;
	}
	return escaped;
}

/**
 * Safely spawns a child process in a cross-platform manner.
 * On Unix or Windows with native .exe, uses direct execution with shell: false.
 * On Windows with .cmd/.bat scripts, invokes cmd.exe /d /s /c with strictly escaped arguments
 * and windowsVerbatimArguments: true, preventing shell injection.
 */
export async function safeSpawn(
	command: string,
	args: string[] = [],
	options: SpawnOptions = {},
): Promise<ChildProcess> {
	const isWindows = process.platform === "win32";

	// If already a resolved path or command, find executable
	const resolved = (await resolveExecutablePath(command)) || command;

	if (!isWindows) {
		return spawn(resolved, args, { ...options, shell: false });
	}

	const isBatchOrCmd = /\.(cmd|bat)$/i.test(resolved);

	if (!isBatchOrCmd) {
		// Native Windows .exe — execute directly without shell
		return spawn(resolved, args, { ...options, shell: false });
	}

	// Windows .cmd or .bat script: Node CVE-2024-27980 throws EINVAL on shell: false.
	// Safely invoke cmd.exe with strict escaping and windowsVerbatimArguments.
	const comSpec = process.env.COMSPEC || "cmd.exe";
	const escapedArgs = args.map(escapeWindowsArg);
	const fullCommandLine = `"${resolved}" ${escapedArgs.join(" ")}`;

	return spawn(comSpec, ["/d", "/s", "/c", fullCommandLine], {
		...options,
		windowsVerbatimArguments: true,
		shell: false,
	});
}
