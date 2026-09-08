/**
 * ts-analyzer.ts
 * AST-based symbol and dependency graph analyzer using the TypeScript Compiler API.
 * Provides deterministic import/export resolution, god-node detection, and blast radius mapping.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

export interface SymbolNode {
	name: string;
	kind: "function" | "class" | "interface" | "type" | "variable" | "enum" | "unknown";
	exported: boolean;
	line: number;
	character: number;
}

export interface ImportEdge {
	fromFile: string;
	toModule: string;
	resolvedPath?: string;
	importedSymbols: string[];
	isTypeOnly: boolean;
}

export interface ExportEdge {
	fromFile: string;
	symbolName: string;
	isDefault: boolean;
	isTypeOnly: boolean;
}

export interface FileNode {
	filePath: string;
	symbols: SymbolNode[];
	imports: ImportEdge[];
	exports: ExportEdge[];
	inDegree: number;
	outDegree: number;
}

export interface DependencyGraph {
	files: Record<string, FileNode>;
	edges: Array<{
		source: string;
		target: string;
		type: "imports" | "re-exports";
		symbols: string[];
	}>;
	godNodes: Array<{
		filePath: string;
		centralityScore: number;
		inDegree: number;
		outDegree: number;
	}>;
	circularDependencies: string[][];
	stats: {
		totalFiles: number;
		totalSymbols: number;
		totalEdges: number;
	};
}

/**
 * Analyzes a single TypeScript/JavaScript source code string and extracts symbols, imports, and exports.
 */
export function analyzeSourceCode(filePath: string, code: string): FileNode {
	const sourceFile = ts.createSourceFile(
		filePath,
		code,
		ts.ScriptTarget.Latest,
		true,
		filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);

	const symbols: SymbolNode[] = [];
	const imports: ImportEdge[] = [];
	const exports: ExportEdge[] = [];

	function isNodeExported(node: ts.Node): boolean {
		return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
	}

	function isDefaultExport(node: ts.Node): boolean {
		return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Default) !== 0;
	}

	function visit(node: ts.Node) {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

		// 1. Function Declarations
		if (ts.isFunctionDeclaration(node) && node.name) {
			const exported = isNodeExported(node);
			symbols.push({
				name: node.name.text,
				kind: "function",
				exported,
				line: line + 1,
				character: character + 1,
			});
			if (exported) {
				exports.push({
					fromFile: filePath,
					symbolName: node.name.text,
					isDefault: isDefaultExport(node),
					isTypeOnly: false,
				});
			}
		}

		// 2. Class Declarations
		else if (ts.isClassDeclaration(node) && node.name) {
			const exported = isNodeExported(node);
			symbols.push({
				name: node.name.text,
				kind: "class",
				exported,
				line: line + 1,
				character: character + 1,
			});
			if (exported) {
				exports.push({
					fromFile: filePath,
					symbolName: node.name.text,
					isDefault: isDefaultExport(node),
					isTypeOnly: false,
				});
			}
		}

		// 3. Interface Declarations
		else if (ts.isInterfaceDeclaration(node)) {
			const exported = isNodeExported(node);
			symbols.push({
				name: node.name.text,
				kind: "interface",
				exported,
				line: line + 1,
				character: character + 1,
			});
			if (exported) {
				exports.push({
					fromFile: filePath,
					symbolName: node.name.text,
					isDefault: false,
					isTypeOnly: true,
				});
			}
		}

		// 4. Type Alias Declarations
		else if (ts.isTypeAliasDeclaration(node)) {
			const exported = isNodeExported(node);
			symbols.push({
				name: node.name.text,
				kind: "type",
				exported,
				line: line + 1,
				character: character + 1,
			});
			if (exported) {
				exports.push({
					fromFile: filePath,
					symbolName: node.name.text,
					isDefault: false,
					isTypeOnly: true,
				});
			}
		}

		// 5. Enum Declarations
		else if (ts.isEnumDeclaration(node)) {
			const exported = isNodeExported(node);
			symbols.push({
				name: node.name.text,
				kind: "enum",
				exported,
				line: line + 1,
				character: character + 1,
			});
			if (exported) {
				exports.push({
					fromFile: filePath,
					symbolName: node.name.text,
					isDefault: false,
					isTypeOnly: false,
				});
			}
		}

		// 6. Variable Statements (const/let/var)
		else if (ts.isVariableStatement(node)) {
			const exported = isNodeExported(node);
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					symbols.push({
						name: decl.name.text,
						kind: "variable",
						exported,
						line: line + 1,
						character: character + 1,
					});
					if (exported) {
						exports.push({
							fromFile: filePath,
							symbolName: decl.name.text,
							isDefault: false,
							isTypeOnly: false,
						});
					}
				}
			}
		}

		// 7. Import Declarations
		else if (ts.isImportDeclaration(node)) {
			const toModule = (node.moduleSpecifier as ts.StringLiteral).text;
			const isTypeOnly = Boolean(node.importClause?.isTypeOnly);
			const importedSymbols: string[] = [];

			if (node.importClause) {
				if (node.importClause.name) {
					importedSymbols.push(node.importClause.name.text); // default import
				}
				if (node.importClause.namedBindings) {
					if (ts.isNamespaceImport(node.importClause.namedBindings)) {
						importedSymbols.push("*");
					} else if (ts.isNamedImports(node.importClause.namedBindings)) {
						for (const el of node.importClause.namedBindings.elements) {
							importedSymbols.push(el.name.text);
						}
					}
				}
			}

			imports.push({
				fromFile: filePath,
				toModule,
				importedSymbols,
				isTypeOnly,
			});
		}

		// 8. Export Declarations (export { a, b } from './module')
		else if (ts.isExportDeclaration(node)) {
			const isTypeOnly = Boolean(node.isTypeOnly);
			if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				for (const el of node.exportClause.elements) {
					exports.push({
						fromFile: filePath,
						symbolName: el.name.text,
						isDefault: false,
						isTypeOnly,
					});
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return {
		filePath,
		symbols,
		imports,
		exports,
		inDegree: 0,
		outDegree: 0,
	};
}

/**
 * Resolves a module specifier against known files in the project.
 */
function resolveImportPath(fromFile: string, specifier: string, knownPaths: Set<string>): string | undefined {
	if (!specifier.startsWith(".")) {
		return undefined; // external npm module or node built-in
	}

	const dir = path.dirname(fromFile);
	const rawTarget = path.normalize(path.join(dir, specifier)).replace(/\\/g, "/");

	const candidates = [
		rawTarget,
		`${rawTarget}.ts`,
		`${rawTarget}.tsx`,
		`${rawTarget}.js`,
		`${rawTarget}.jsx`,
		`${rawTarget}/index.ts`,
		`${rawTarget}/index.tsx`,
		`${rawTarget}/index.js`,
	];

	for (const candidate of candidates) {
		if (knownPaths.has(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

/**
 * Builds a complete dependency graph from a map of relative file paths to their file contents.
 */
export function buildDependencyGraph(files: Record<string, string>): DependencyGraph {
	const fileNodes: Record<string, FileNode> = {};
	const knownPaths = new Set(Object.keys(files));

	// 1. Analyze AST for each file
	for (const [relPath, content] of Object.entries(files)) {
		fileNodes[relPath] = analyzeSourceCode(relPath, content);
	}

	// 2. Resolve import paths and build edges
	const edges: DependencyGraph["edges"] = [];

	for (const [fromPath, fileNode] of Object.entries(fileNodes)) {
		for (const imp of fileNode.imports) {
			const resolved = resolveImportPath(fromPath, imp.toModule, knownPaths);
			if (resolved) {
				imp.resolvedPath = resolved;
				fileNode.outDegree++;
				fileNodes[resolved].inDegree++;

				edges.push({
					source: fromPath,
					target: resolved,
					type: "imports",
					symbols: imp.importedSymbols,
				});
			}
		}
	}

	// 3. Detect God Nodes (ranked by centrality = inDegree + outDegree)
	const godNodes = Object.values(fileNodes)
		.map((node) => ({
			filePath: node.filePath,
			centralityScore: node.inDegree + node.outDegree,
			inDegree: node.inDegree,
			outDegree: node.outDegree,
		}))
		.sort((a, b) => b.centralityScore - a.centralityScore);

	// 4. Detect Circular Dependencies (Tarjan or DFS cycle detection)
	const circularDependencies: string[][] = [];
	const visited = new Set<string>();
	const recStack: string[] = [];

	function detectCycles(current: string) {
		visited.add(current);
		recStack.push(current);

		const currentNode = fileNodes[current];
		if (currentNode) {
			for (const imp of currentNode.imports) {
				const next = imp.resolvedPath;
				if (!next) continue;

				if (!visited.has(next)) {
					detectCycles(next);
				} else {
					const cycleStart = recStack.indexOf(next);
					if (cycleStart !== -1) {
						const cycle = [...recStack.slice(cycleStart), next];
						circularDependencies.push(cycle);
					}
				}
			}
		}

		recStack.pop();
	}

	for (const filePath of Object.keys(fileNodes)) {
		if (!visited.has(filePath)) {
			detectCycles(filePath);
		}
	}

	let totalSymbols = 0;
	for (const node of Object.values(fileNodes)) {
		totalSymbols += node.symbols.length;
	}

	return {
		files: fileNodes,
		edges,
		godNodes,
		circularDependencies,
		stats: {
			totalFiles: Object.keys(fileNodes).length,
			totalSymbols,
			totalEdges: edges.length,
		},
	};
}

/**
 * Scans a repository directory and builds a full dependency graph for all TS/JS files.
 */
export function analyzeProject(rootDir: string, extensions = [".ts", ".tsx", ".js", ".jsx"]): DependencyGraph {
	const files: Record<string, string> = {};

	function walk(currentDir: string) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === ".next") {
				continue;
			}

			const full = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name);
				if (extensions.includes(ext) && !entry.name.endsWith(".d.ts")) {
					const rel = path.relative(rootDir, full).replace(/\\/g, "/");
					try {
						files[rel] = fs.readFileSync(full, "utf8");
					} catch {}
				}
			}
		}
	}

	walk(rootDir);
	return buildDependencyGraph(files);
}

/**
 * Queries all files that directly depend on (import) the target file.
 */
export function queryDependents(graph: DependencyGraph, targetFile: string): string[] {
	const normalizedTarget = targetFile.replace(/\\/g, "/");
	const dependents = new Set<string>();

	for (const edge of graph.edges) {
		if (edge.target === normalizedTarget) {
			dependents.add(edge.source);
		}
	}

	return Array.from(dependents);
}

/**
 * Traverses inbound edges up to maxDepth to calculate the full blast radius of a change.
 */
export function queryBlastRadius(graph: DependencyGraph, targetFile: string, maxDepth = 3): string[] {
	const normalizedTarget = targetFile.replace(/\\/g, "/");
	const visited = new Set<string>();
	const queue: Array<{ file: string; depth: number }> = [{ file: normalizedTarget, depth: 0 }];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;

		if (current.depth >= maxDepth) continue;

		const directDependents = queryDependents(graph, current.file);
		for (const dep of directDependents) {
			if (!visited.has(dep) && dep !== normalizedTarget) {
				visited.add(dep);
				queue.push({ file: dep, depth: current.depth + 1 });
			}
		}
	}

	return Array.from(visited);
}
