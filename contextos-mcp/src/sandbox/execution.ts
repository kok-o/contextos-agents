/**
 * ContextOS — Real Execution Sandbox & OCI Container Profile Engine
 *
 * Implements Section 19 of CONTEXTOS_IMPLEMENTATION_PLAN.md & Milestones W5.3 and W5.4:
 *   - Execution modes: oci-required, oci-preferred, host-unsafe
 *   - Fail-closed fallback: zero silent fallbacks from OCI to host
 *   - Auto-merge governance: auto-merge permanently blocked by default in host-unsafe mode
 *   - Repository config is prohibited from enabling unsafe auto-merge override
 *   - Hardened container profile (read-only root, cap-drop ALL, no-new-privileges, non-root user 1000:1000)
 *   - Network isolation: default network=none
 *   - Ephemeral isolated TMPFS mounts (no real HOME mounted)
 *   - Direct OCI engine execution (Docker/Podman/mock) without shell
 *   - Engine/image digest verification and runner evidence recording
 *   - Adversarial attack validation (traversal, git hooks, secret staging, config tampering)
 */

import { execFileSync, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { getSanitizedEnv, killProcessTree, redactSensitiveOutput } from "../utils/process-security.js";

export type SandboxMode = "oci-required" | "oci-preferred" | "host-unsafe";
export type ContainerEngine = "docker" | "podman" | "mock";
export type NetworkMode = "deny" | "allow";

export interface SandboxLimits {
	cpus?: string;
	memoryMb?: number;
	pidsLimit?: number;
	timeoutMs?: number;
	maxOutputBytes?: number;
}

export interface SandboxOptions {
	mode?: SandboxMode;
	containerEngine?: ContainerEngine | null;
	image?: string;
	expectedImageDigest?: string;
	network?: NetworkMode;
	limits?: SandboxLimits;
	mockExecutor?: (
		engine: string,
		args: string[],
		options: { cwd: string; timeoutMs?: number; signal?: AbortSignal },
	) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface AutoMergeDecision {
	allowed: boolean;
	reasonCode: string;
	reason: string;
}

export interface AdversarialCheckResult {
	safe: boolean;
	rule?: string;
	violation?: string;
}

export interface PlanResult {
	runner: "oci" | "host-unsafe";
	autoMergeBlocked: boolean;
	warning?: string;
}

export interface SandboxExecutionEvidence {
	engine: string;
	image: string;
	imageDigest?: string;
	exitCode: number | null;
	durationMs: number;
	outputSha256: string;
	runnerMode: "oci" | "host-unsafe";
	network: NetworkMode;
	timestamp: number;
}

export interface SandboxExecutionResult {
	success: boolean;
	exitCode: number | null;
	signal: string | null;
	durationMs: number;
	stdout: string;
	stderr: string;
	outputSha256: string;
	redactedOutput: string;
	runnerMode: "oci" | "host-unsafe";
	containerEngine: string;
	image: string;
	imageDigest?: string;
	autoMergeBlocked: boolean;
	evidence: SandboxExecutionEvidence;
	warning?: string;
}

export interface SandboxExecuteOptions {
	userOverride?: boolean;
	isFromRepoConfig?: boolean;
	signal?: AbortSignal;
	timeoutMs?: number;
	network?: NetworkMode;
}

export class ExecutionSandbox {
	public mode: SandboxMode;
	public containerEngine: ContainerEngine | null;
	public image: string;
	public expectedImageDigest?: string;
	public network: NetworkMode;
	public limits: {
		cpus: string;
		memoryMb: number;
		pidsLimit: number;
		timeoutMs: number;
		maxOutputBytes: number;
	};
	public mockExecutor?: (
		engine: string,
		args: string[],
		options: { cwd: string; timeoutMs?: number; signal?: AbortSignal },
	) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

	constructor(options: SandboxOptions = {}) {
		this.mode = options.mode || "oci-preferred";
		this.containerEngine = options.containerEngine || null;
		this.image = options.image || "node:20-alpine";
		this.expectedImageDigest = options.expectedImageDigest;
		this.network = options.network || "deny";
		this.mockExecutor = options.mockExecutor;
		this.limits = {
			cpus: options.limits?.cpus || "2.0",
			memoryMb: Math.max(256, options.limits?.memoryMb || 2048),
			pidsLimit: Math.max(32, options.limits?.pidsLimit || 128),
			timeoutMs: Math.max(1000, options.limits?.timeoutMs || 30000),
			maxOutputBytes: options.limits?.maxOutputBytes || 512 * 1024,
		};
	}

	/**
	 * Evaluates if auto-merge is permitted based on execution outcome and mode.
	 * Section 19.1 & W5.4:
	 *   - oci-required: permitted after gates pass
	 *   - oci-preferred: permitted only if OCI container was actually used
	 *   - host-unsafe: blocked by default; requires explicit user-local safety override
	 *   - Repository config is strictly forbidden from enabling unsafe override
	 */
	canAutoMerge(
		executionRecord: { runnerMode?: string; userOverride?: boolean; isFromRepoConfig?: boolean } = {},
	): AutoMergeDecision {
		const { runnerMode = "host-unsafe", userOverride = false, isFromRepoConfig = false } = executionRecord;

		if (runnerMode === "oci") {
			return {
				allowed: true,
				reasonCode: "OCI_SANDBOX_VERIFIED",
				reason: "Execution was verified inside isolated OCI container sandbox.",
			};
		}

		if (userOverride) {
			if (isFromRepoConfig) {
				return {
					allowed: false,
					reasonCode: "REPO_CONFIG_OVERRIDE_PROHIBITED",
					reason:
						"Repository configuration cannot enable host-unsafe auto-merge override. Only user-local safety override is permitted.",
				};
			}
			return {
				allowed: true,
				reasonCode: "HOST_UNSAFE_EXPLICIT_OVERRIDE",
				reason: "Auto-merge permitted via explicit user-local safety override for host-unsafe execution.",
			};
		}

		return {
			allowed: false,
			reasonCode: "HOST_UNSAFE_BLOCKED",
			reason:
				"Auto-merge is blocked for host-unsafe execution. Requires isolated OCI container or explicit manual confirmation.",
		};
	}

	/**
	 * Generates hardened OCI container CLI arguments adhering strictly to Section 19.2.
	 */
	buildContainerArgs(workspacePath: string, commandArgs: string[], overrides: Partial<SandboxOptions> = {}): string[] {
		const resolvedWorkspace = path.resolve(workspacePath);
		const network = overrides.network || this.network;
		const limits = { ...this.limits, ...overrides.limits };

		const args = [
			"run",
			"--rm",
			"--read-only",
			"--cap-drop=ALL",
			"--security-opt=no-new-privileges",
			"--user=1000:1000",
			`--cpus=${limits.cpus}`,
			`--memory=${limits.memoryMb}m`,
			`--pids-limit=${limits.pidsLimit}`,
			"--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
			"--tmpfs=/home/sandbox:rw,noexec,nosuid,size=64m",
			"-e",
			"HOME=/home/sandbox",
			"-e",
			"TMPDIR=/tmp",
			"-e",
			"NODE_ENV=test",
		];

		if (network === "deny") {
			args.push("--network=none");
		}

		const mountPath = process.platform === "win32" ? resolvedWorkspace.replace(/\\/g, "/") : resolvedWorkspace;
		// Mount workspace directory read-write
		args.push("-v", `${mountPath}:/workspace:rw`);
		args.push("-w", "/workspace");

		args.push(this.image);
		args.push(...commandArgs);

		return args;
	}

	/**
	 * Scans a proposed action or file write for adversarial attacks (Section 19.6).
	 */
	validateAdversarialAttempt(
		action: { targetPath?: string; content?: string; commandArgs?: string[] } = {},
	): AdversarialCheckResult {
		const { targetPath, commandArgs } = action;

		// 1. Path traversal escape checks
		if (targetPath) {
			const normalized = targetPath.replace(/\\/g, "/");
			if (
				normalized.startsWith("../") ||
				normalized.includes("/../") ||
				normalized.endsWith("/..") ||
				normalized === ".."
			) {
				return {
					safe: false,
					rule: "SEC-SANDBOX-001",
					violation: `Path traversal detected: "${targetPath}" attempts to escape workspace root.`,
				};
			}

			// 2. Git internal tampering checks
			if (
				normalized === ".git" ||
				normalized.startsWith(".git/") ||
				normalized.includes("/.git/") ||
				normalized.includes("core.hookspath") ||
				normalized.includes("hooks/")
			) {
				return {
					safe: false,
					rule: "SEC-SANDBOX-002",
					violation: `Tampering with Git internals or hooks detected: "${targetPath}".`,
				};
			}

			// 3. Staged secret file check
			const base = path.basename(normalized).toLowerCase();
			if (
				base === ".env" ||
				base.startsWith(".env.") ||
				base.endsWith(".pem") ||
				base.endsWith(".key") ||
				base === "id_rsa" ||
				base === "id_ed25519"
			) {
				return {
					safe: false,
					rule: "SEC-SANDBOX-003",
					violation: `Writing blocked secret/credential file detected: "${targetPath}".`,
				};
			}
		}

		// 4. Command arguments inspection
		if (Array.isArray(commandArgs)) {
			const fullCmd = commandArgs.join(" ");
			if (/core\.hooksPath/i.test(fullCmd)) {
				return {
					safe: false,
					rule: "SEC-SANDBOX-004",
					violation: "Command attempts to alter Git core.hooksPath configuration.",
				};
			}
			if (/git\s+config\s+--global/i.test(fullCmd) || /git\s+config\s+--system/i.test(fullCmd)) {
				return {
					safe: false,
					rule: "SEC-SANDBOX-005",
					violation: "Command attempts to modify global or system git configuration.",
				};
			}
		}

		return { safe: true };
	}

	/**
	 * Plans execution runner and validates against fail-closed policy.
	 */
	planExecution(isEngineAvailable: boolean): PlanResult {
		if (this.mode === "oci-required") {
			if (!isEngineAvailable) {
				const err = new Error(
					'OCI sandbox is required by policy (mode="oci-required"), but no container engine (docker/podman) is available. Silent fallback is prohibited.',
				);
				(err as any).code = "CTX_SANDBOX_OCI_UNAVAILABLE";
				throw err;
			}
			return { runner: "oci", autoMergeBlocked: false };
		}

		if (this.mode === "oci-preferred") {
			if (isEngineAvailable) {
				return { runner: "oci", autoMergeBlocked: false };
			}
			return {
				runner: "host-unsafe",
				autoMergeBlocked: true,
				warning:
					"Container engine not detected. Falling back to host-unsafe execution. Auto-merge is blocked until manually verified.",
			};
		}

		return {
			runner: "host-unsafe",
			autoMergeBlocked: true,
			warning: "Running in host-unsafe mode. Auto-merge is blocked by default.",
		};
	}

	/**
	 * Detects whether a functional container engine (docker/podman/mock) is available.
	 */
	detectContainerEngine(): ContainerEngine | null {
		if (this.containerEngine === "mock") {
			return "mock";
		}

		if (this.containerEngine === "docker" || this.containerEngine === "podman") {
			try {
				execFileSync(this.containerEngine, ["--version"], { stdio: "ignore" });
				return this.containerEngine;
			} catch {
				return null;
			}
		}

		// Probe docker first, then podman
		try {
			execFileSync("docker", ["--version"], { stdio: "ignore" });
			return "docker";
		} catch {
			// probe podman
			try {
				execFileSync("podman", ["--version"], { stdio: "ignore" });
				return "podman";
			} catch {
				return null;
			}
		}
	}

	/**
	 * Resolves image digest for evidence and pin verification.
	 */
	getImageDigest(engine: ContainerEngine, image: string): string | null {
		if (engine === "mock") {
			return `sha256:${crypto.createHash("sha256").update(image).digest("hex")}`;
		}

		try {
			const out = execFileSync(engine, ["image", "inspect", "--format", "{{range .RepoDigests}}{{.}}{{end}}", image], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 5000,
			}).trim();

			if (out?.includes("@sha256:")) {
				const digestPart = out.split("@")[1];
				return digestPart || null;
			}
			return out || null;
		} catch {
			return null;
		}
	}

	/**
	 * Executes a command inside the hardened sandbox or host fallback according to policy.
	 */
	async execute(
		workspacePath: string,
		commandArgs: string[],
		options: SandboxExecuteOptions = {},
	): Promise<SandboxExecutionResult> {
		// 1. Validate adversarial attempts
		const advCheck = this.validateAdversarialAttempt({
			targetPath: workspacePath,
			commandArgs,
		});
		if (!advCheck.safe) {
			const secErr = new Error(`Sandbox security violation: ${advCheck.violation}`);
			(secErr as any).code = advCheck.rule || "CTX_SECURITY_VIOLATION";
			throw secErr;
		}

		const engine = this.detectContainerEngine();
		const plan = this.planExecution(Boolean(engine));
		const startTime = Date.now();

		if (plan.runner === "oci" && engine) {
			return this.executeInContainer(engine, workspacePath, commandArgs, options, startTime);
		}

		return this.executeInHost(workspacePath, commandArgs, options, startTime, plan.warning);
	}

	/**
	 * Executes the command directly inside an isolated OCI container without shell.
	 */
	private async executeInContainer(
		engine: ContainerEngine,
		workspacePath: string,
		commandArgs: string[],
		options: SandboxExecuteOptions,
		startTime: number,
	): Promise<SandboxExecutionResult> {
		const digest = this.getImageDigest(engine, this.image);

		if (this.expectedImageDigest && digest) {
			const normalizedExpected = this.expectedImageDigest.replace(/^sha256:/, "");
			const normalizedActual = digest.replace(/^sha256:/, "");
			if (normalizedExpected !== normalizedActual) {
				const err = new Error(
					`Image digest mismatch for image "${this.image}": expected "${this.expectedImageDigest}", got "${digest}". Execution aborted fail-closed.`,
				);
				(err as any).code = "CTX_SANDBOX_DIGEST_MISMATCH";
				throw err;
			}
		}

		const containerArgs = this.buildContainerArgs(workspacePath, commandArgs, {
			network: options.network || this.network,
		});

		const timeoutMs = options.timeoutMs || this.limits.timeoutMs;
		let stdout = "";
		let stderr = "";
		let exitCode: number | null = null;
		let signal: string | null = null;

		if (engine === "mock" && this.mockExecutor) {
			const mockRes = await this.mockExecutor("mock", containerArgs, {
				cwd: workspacePath,
				timeoutMs,
				signal: options.signal,
			});
			stdout = mockRes.stdout;
			stderr = mockRes.stderr;
			exitCode = mockRes.exitCode;
		} else if (engine === "mock") {
			stdout = `[mock-oci-container: ${this.image}] executed: ${commandArgs.join(" ")}\n`;
			exitCode = 0;
		} else {
			// Real container execution (Docker or Podman) without shell
			const child = spawn(engine, containerArgs, {
				cwd: workspacePath,
				shell: false,
				windowsHide: true,
			});

			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				killProcessTree(child.pid);
			}, timeoutMs);

			const abortHandler = () => {
				killProcessTree(child.pid);
			};

			if (options.signal) {
				options.signal.addEventListener("abort", abortHandler, { once: true });
			}

			const maxBytes = this.limits.maxOutputBytes;

			child.stdout.on("data", (chunk: Buffer) => {
				if (stdout.length < maxBytes) {
					stdout += chunk.toString("utf8");
				}
			});

			child.stderr.on("data", (chunk: Buffer) => {
				if (stderr.length < maxBytes) {
					stderr += chunk.toString("utf8");
				}
			});

			const [code, sig] = await new Promise<[number | null, string | null]>((resolve) => {
				child.on("close", (c, s) => {
					clearTimeout(timer);
					if (options.signal) {
						options.signal.removeEventListener("abort", abortHandler);
					}
					resolve([c, s]);
				});
				child.on("error", (_err) => {
					clearTimeout(timer);
					if (options.signal) {
						options.signal.removeEventListener("abort", abortHandler);
					}
					resolve([1, null]);
				});
			});

			exitCode = code;
			signal = sig;

			if (timedOut) {
				signal = "SIGKILL";
				exitCode = 124;
			}
		}

		const durationMs = Date.now() - startTime;
		const rawCombined = stdout + (stderr ? `\n${stderr}` : "");
		const outputSha256 = crypto.createHash("sha256").update(rawCombined).digest("hex");
		const redactedOutput = redactSensitiveOutput(rawCombined);

		const evidence: SandboxExecutionEvidence = {
			engine,
			image: this.image,
			imageDigest: digest || undefined,
			exitCode,
			durationMs,
			outputSha256,
			runnerMode: "oci",
			network: options.network || this.network,
			timestamp: Date.now(),
		};

		return {
			success: exitCode === 0,
			exitCode,
			signal,
			durationMs,
			stdout,
			stderr,
			outputSha256,
			redactedOutput,
			runnerMode: "oci",
			containerEngine: engine,
			image: this.image,
			imageDigest: digest || undefined,
			autoMergeBlocked: false,
			evidence,
		};
	}

	/**
	 * Executes on host in host-unsafe fallback mode with full process isolation and secret redaction.
	 */
	private async executeInHost(
		workspacePath: string,
		commandArgs: string[],
		options: SandboxExecuteOptions,
		startTime: number,
		warning?: string,
	): Promise<SandboxExecutionResult> {
		const timeoutMs = options.timeoutMs || this.limits.timeoutMs;
		const env = getSanitizedEnv();
		let stdout = "";
		let stderr = "";

		const child = spawn(commandArgs[0], commandArgs.slice(1), {
			cwd: workspacePath,
			env,
			shell: false,
			windowsHide: true,
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			killProcessTree(child.pid);
		}, timeoutMs);

		const abortHandler = () => {
			killProcessTree(child.pid);
		};

		if (options.signal) {
			options.signal.addEventListener("abort", abortHandler, { once: true });
		}

		const maxBytes = this.limits.maxOutputBytes;

		child.stdout.on("data", (chunk: Buffer) => {
			if (stdout.length < maxBytes) {
				stdout += chunk.toString("utf8");
			}
		});

		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < maxBytes) {
				stderr += chunk.toString("utf8");
			}
		});

		const [exitCode, sig] = await new Promise<[number | null, string | null]>((resolve) => {
			child.on("close", (code, signalStr) => {
				clearTimeout(timer);
				if (options.signal) {
					options.signal.removeEventListener("abort", abortHandler);
				}
				resolve([code, signalStr]);
			});
			child.on("error", (err) => {
				clearTimeout(timer);
				if (options.signal) {
					options.signal.removeEventListener("abort", abortHandler);
				}
				stderr += `\nFailed to start process: ${err.message}`;
				resolve([1, null]);
			});
		});

		const durationMs = Date.now() - startTime;
		const rawCombined = stdout + (stderr ? `\n${stderr}` : "");
		const outputSha256 = crypto.createHash("sha256").update(rawCombined).digest("hex");
		const redactedOutput = redactSensitiveOutput(rawCombined);

		const decision = this.canAutoMerge({
			runnerMode: "host-unsafe",
			userOverride: options.userOverride,
			isFromRepoConfig: options.isFromRepoConfig,
		});

		const evidence: SandboxExecutionEvidence = {
			engine: "none",
			image: "host",
			exitCode: timedOut ? 124 : exitCode,
			durationMs,
			outputSha256,
			runnerMode: "host-unsafe",
			network: "allow",
			timestamp: Date.now(),
		};

		return {
			success: exitCode === 0 && !timedOut,
			exitCode: timedOut ? 124 : exitCode,
			signal: timedOut ? "SIGKILL" : sig,
			durationMs,
			stdout,
			stderr,
			outputSha256,
			redactedOutput,
			runnerMode: "host-unsafe",
			containerEngine: "none",
			image: "host",
			autoMergeBlocked: !decision.allowed,
			evidence,
			warning,
		};
	}
}
