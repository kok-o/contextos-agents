/**
 * Agent provider interface and registry.
 *
 * Each agent backend (OpenCode, Claude Code, etc.) implements AgentProvider.
 * The registry maps backend names to providers.
 */

import type { AgentProvider } from "../core/types.js";

const registry = new Map<string, AgentProvider>();

export function registerAgent(provider: AgentProvider): void {
	registry.set(provider.name, provider);
}

export function getAgent(name: string): AgentProvider {
	const provider = registry.get(name);
	if (!provider) {
		const available = [...registry.keys()].join(", ");
		throw new Error(`Unknown agent backend "${name}". Available: ${available || "none"}`);
	}
	return provider;
}

export function listAgents(): string[] {
	return [...registry.keys()];
}

export async function getAvailableAgents(): Promise<string[]> {
	const results: string[] = [];
	for (const [name, provider] of registry) {
		if (await provider.isAvailable()) {
			results.push(name);
		}
	}
	return results;
}
