import { describe, expect, it } from "vitest";
import {
	analyzeSourceCode,
	buildDependencyGraph,
	queryBlastRadius,
	queryDependents,
} from "../src/labs/ts-analyzer.js";

describe("ts-analyzer — AST Symbol Extraction", () => {
	it("extracts functions, classes, interfaces, and variables", () => {
		const code = `
			export interface User {
				id: string;
				name: string;
			}

			export type UserId = string;

			export class UserService {
				getUser(): User {
					return { id: "1", name: "Alice" };
				}
			}

			export function calculateTotal(a: number, b: number): number {
				return a + b;
			}

			export const API_VERSION = "v1";
			const internalHelper = () => true;
		`;

		const result = analyzeSourceCode("src/users.ts", code);

		expect(result.filePath).toBe("src/users.ts");
		expect(result.symbols.length).toBe(6);

		const userInterface = result.symbols.find((s) => s.name === "User");
		expect(userInterface?.kind).toBe("interface");
		expect(userInterface?.exported).toBe(true);

		const userService = result.symbols.find((s) => s.name === "UserService");
		expect(userService?.kind).toBe("class");
		expect(userService?.exported).toBe(true);

		const calcFn = result.symbols.find((s) => s.name === "calculateTotal");
		expect(calcFn?.kind).toBe("function");
		expect(calcFn?.exported).toBe(true);

		const internal = result.symbols.find((s) => s.name === "internalHelper");
		expect(internal?.exported).toBe(false);
	});

	it("extracts imports (default, named, type-only)", () => {
		const code = `
			import defaultRouter from "./router";
			import { UserService, type User } from "./users";
			import type { Config } from "./config";
			import * as utils from "./utils";
			import fs from "node:fs";
		`;

		const result = analyzeSourceCode("src/app.ts", code);

		expect(result.imports.length).toBe(5);

		const routerImp = result.imports.find((i) => i.toModule === "./router");
		expect(routerImp?.importedSymbols).toContain("defaultRouter");

		const usersImp = result.imports.find((i) => i.toModule === "./users");
		expect(usersImp?.importedSymbols).toContain("UserService");
		expect(usersImp?.importedSymbols).toContain("User");

		const configImp = result.imports.find((i) => i.toModule === "./config");
		expect(configImp?.isTypeOnly).toBe(true);

		const utilsImp = result.imports.find((i) => i.toModule === "./utils");
		expect(utilsImp?.importedSymbols).toContain("*");
	});
});

describe("ts-analyzer — Dependency Graph & God Nodes", () => {
	it("resolves module paths, builds edges, and identifies god nodes", () => {
		const files: Record<string, string> = {
			"src/types.ts": `
				export interface AppConfig { port: number; }
			`,
			"src/db.ts": `
				import { AppConfig } from "./types";
				export class Database { connect() {} }
			`,
			"src/user-service.ts": `
				import { Database } from "./db";
				import { AppConfig } from "./types";
				export class UserService {}
			`,
			"src/order-service.ts": `
				import { Database } from "./db";
				import { AppConfig } from "./types";
				export class OrderService {}
			`,
			"src/server.ts": `
				import { UserService } from "./user-service";
				import { OrderService } from "./order-service";
				import { Database } from "./db";
			`,
		};

		const graph = buildDependencyGraph(files);

		expect(graph.stats.totalFiles).toBe(5);
		expect(graph.edges.length).toBe(8);

		// db.ts is imported by user-service, order-service, server (inDegree 3) and imports types (outDegree 1)
		const dbNode = graph.files["src/db.ts"];
		expect(dbNode.inDegree).toBe(3);
		expect(dbNode.outDegree).toBe(1);

		// God nodes detection: db.ts and types.ts should have highest centrality
		expect(graph.godNodes.length).toBe(5);
		const topGodNode = graph.godNodes[0];
		expect(["src/db.ts", "src/types.ts"]).toContain(topGodNode.filePath);
	});

	it("detects circular dependencies", () => {
		const files: Record<string, string> = {
			"src/a.ts": `
				import { b } from "./b";
				export const a = 1;
			`,
			"src/b.ts": `
				import { c } from "./c";
				export const b = 2;
			`,
			"src/c.ts": `
				import { a } from "./a";
				export const c = 3;
			`,
		};

		const graph = buildDependencyGraph(files);

		expect(graph.circularDependencies.length).toBeGreaterThan(0);
		const cycle = graph.circularDependencies[0];
		expect(cycle).toContain("src/a.ts");
		expect(cycle).toContain("src/b.ts");
		expect(cycle).toContain("src/c.ts");
	});

	it("queries dependents and blast radius across multi-hop dependency chains", () => {
		const files: Record<string, string> = {
			"src/base.ts": `export const base = 1;`,
			"src/mid1.ts": `import { base } from "./base"; export const m1 = 2;`,
			"src/mid2.ts": `import { base } from "./base"; export const m2 = 3;`,
			"src/leaf.ts": `import { m1 } from "./mid1"; export const leaf = 4;`,
			"src/unrelated.ts": `export const x = 10;`,
		};

		const graph = buildDependencyGraph(files);

		// Direct dependents of base.ts
		const direct = queryDependents(graph, "src/base.ts");
		expect(direct.sort()).toEqual(["src/mid1.ts", "src/mid2.ts"]);

		// Full blast radius of base.ts (depth 2) includes mid1, mid2, and leaf
		const blast = queryBlastRadius(graph, "src/base.ts", 3);
		expect(blast).toContain("src/mid1.ts");
		expect(blast).toContain("src/mid2.ts");
		expect(blast).toContain("src/leaf.ts");
		expect(blast).not.toContain("src/unrelated.ts");
	});
});
