/**
 * Tests for ContextOS Selector & Loader:
 * - Dynamic relevance scoring
 * - Hard cap to 2–4 skills (preventing over-activation)
 * - Negative boundaries (casual words do not trigger heavy skills)
 * - Payload size budget enforcement (< 20k chars, avoiding 35k–51k bloat)
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContextPrompt } from "../../src/contextos/loader.js";
import { selectContext } from "../../src/contextos/selector.js";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("ContextOS Selector & Budget", () => {
	it("resolves frontend UI prompts to frontend skills within 2-4 skills", () => {
		const res = selectContext("Build a responsive accessible modal dialog with React and Tailwind");
		expect(res.skills).toContain("react");
		expect(res.skills).toContain("ui-ux-pro");
		expect(res.skills).toContain("web-accessibility");

		// Negative checks: unrelated backend skills must NOT be activated
		expect(res.skills).not.toContain("docker");
		expect(res.skills).not.toContain("database");
		expect(res.skills).not.toContain("nestjs");
		expect(res.skills).not.toContain("fastapi");

		// Range check
		expect(res.skills.length).toBeGreaterThanOrEqual(2);
		expect(res.skills.length).toBeLessThanOrEqual(4);
	});

	it("filters casual words and prevents over-activation on ambiguous sentence", () => {
		const res = selectContext(
			"I need to update the user module and query the index type of the container session token",
		);

		// Casual mentions must NOT activate heavy domain skills
		expect(res.skills).not.toContain("docker"); // casual "container"
		expect(res.skills).not.toContain("nestjs"); // casual "module"
		expect(res.skills).not.toContain("typescript"); // casual "type"
		expect(res.skills).not.toContain("database"); // casual "query" / "index"

		// Total skills strictly capped
		expect(res.skills.length).toBeLessThanOrEqual(4);
	});

	it("strictly caps compound multi-topic prompts to maximum 4 skills", () => {
		// Compound prompt touching Next.js, React, TypeScript, database, docker, auth, microservices, etc.
		const compoundTask =
			"Create a Next.js application with React components, TypeScript types, Tailwind styling, " +
			"Prisma PostgreSQL database, REST API routes, Docker compose container, RabbitMQ microservices, " +
			"JWT auth security, and Vitest unit testing suites";

		const res = selectContext(compoundTask);

		// Must NOT exceed 4 skills
		expect(res.skills.length).toBeLessThanOrEqual(4);
		expect(res.skills.length).toBeGreaterThanOrEqual(2);

		// Highly scored skills must be present
		const topCandidates = ["database", "docker", "nextjs", "react", "security", "testing"];
		const hasTopCandidate = res.skills.some((s) => topCandidates.includes(s));
		expect(hasTopCandidate).toBe(true);
	});

	it("respects custom maxSkills option", () => {
		const res = selectContext(
			"Create a Next.js application with React components, TypeScript types, Tailwind styling, " +
				"Prisma PostgreSQL database, and Docker container",
			{ maxSkills: 2 },
		);

		expect(res.skills.length).toBeLessThanOrEqual(2);
	});

	it("resolves Russian prompts accurately and within 2-4 skills limit", () => {
		const res = selectContext("создай модальное окно авторизации на реакте и напиши юнит-тесты");

		expect(res.skills).toContain("react");
		expect(res.skills.length).toBeLessThanOrEqual(4);
	});

	it("enforces prompt character budget and prevents 35k-51k bloat in buildContextPrompt", () => {
		const compoundTask =
			"Create a Next.js application with React components, TypeScript types, Tailwind styling, " +
			"Prisma PostgreSQL database, REST API routes, Docker compose container, RabbitMQ microservices, " +
			"JWT auth security, and Vitest unit testing suites";

		const prompt = buildContextPrompt(REPO_ROOT, compoundTask);

		expect(prompt.length).toBeGreaterThan(500); // Has essential content
		// Strictly bounded under 20,000 chars (averaging 10k-16k, far below the old 35k-51k)
		expect(prompt.length).toBeLessThan(20000);
	});

	it("transitively resolves dependencies: react pulls typescript", () => {
		const res = selectContext("build a custom react hook", { maxSkills: 4 });
		expect(res.skills).toContain("react");
		expect(res.skills).toContain("typescript");
	});

	it("matches literal 'security review' to security skill", () => {
		const res = selectContext("perform a security review of authentication endpoints");
		expect(res.skills).toContain("security");
	});
});
