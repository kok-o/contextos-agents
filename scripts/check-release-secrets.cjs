#!/usr/bin/env node
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// bin/lib/git-snapshot.js
var require_git_snapshot = __commonJS({
  "bin/lib/git-snapshot.js"(exports2, module2) {
    "use strict";
    var path2 = require("path");
    var { execFileSync: execFileSync2 } = require("child_process");
    function findGitRoot(cwd = process.cwd()) {
      try {
        const root = execFileSync2("git", ["rev-parse", "--show-toplevel"], {
          cwd,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"]
        });
        return path2.resolve(root.trim());
      } catch {
        return null;
      }
    }
    function findHooksDir(cwd = process.cwd()) {
      try {
        const gitDir = execFileSync2("git", ["rev-parse", "--git-path", "hooks"], {
          cwd,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"]
        }).trim();
        return path2.resolve(cwd, gitDir);
      } catch {
        return null;
      }
    }
    function getStagedFiles(cwd = process.cwd()) {
      try {
        const output = execFileSync2(
          "git",
          ["-c", "core.quotepath=false", "diff", "--cached", "-z", "--name-status", "--no-ext-diff"],
          { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
        );
        if (!output) return [];
        const parts = output.split("\0");
        const entries = [];
        let i = 0;
        while (i < parts.length) {
          const statusRaw = parts[i];
          if (!statusRaw) {
            i++;
            continue;
          }
          const status = statusRaw[0];
          if (status === "R" || status === "C") {
            const oldPath = parts[i + 1];
            const newPath = parts[i + 2];
            if (newPath) {
              entries.push({ status, path: newPath, oldPath });
            }
            i += 3;
          } else {
            const filePath = parts[i + 1];
            if (filePath) {
              entries.push({ status, path: filePath });
            }
            i += 2;
          }
        }
        return entries;
      } catch (err) {
        throw new Error(`Failed to query staged files from Git: ${err.message}`);
      }
    }
    function getStagedBlob2(relativePath, cwd = process.cwd()) {
      const posixPath = relativePath.replace(/\\/g, "/");
      try {
        const buf = execFileSync2(
          "git",
          ["--literal-pathspecs", "show", `:${posixPath}`],
          {
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 10 * 1024 * 1024
          }
        );
        return buf;
      } catch (err) {
        const errMsg = err.stderr ? err.stderr.toString("utf8").trim() : err.message;
        throw new Error(`Failed to read staged blob for "${posixPath}": ${errMsg}`);
      }
    }
    function getStagedAddedLines(cwd = process.cwd(), files = null) {
      const addedLinesByFile = /* @__PURE__ */ new Map();
      let targetFiles = files;
      if (!targetFiles) {
        const staged = getStagedFiles(cwd);
        targetFiles = staged.filter((e) => e.status !== "D").map((e) => e.path);
      }
      for (const filePath of targetFiles) {
        try {
          const posixPath = filePath.replace(/\\/g, "/");
          const diffOutput = execFileSync2(
            "git",
            [
              "--literal-pathspecs",
              "-c",
              "core.quotepath=false",
              "diff",
              "--cached",
              "-U0",
              "--no-ext-diff",
              "--no-textconv",
              "--",
              posixPath
            ],
            {
              cwd,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "pipe"],
              maxBuffer: 10 * 1024 * 1024
            }
          );
          if (!diffOutput) continue;
          const lines = diffOutput.split(/\r?\n/);
          let currentLineNum = 0;
          const fileAddedLines = [];
          for (const line of lines) {
            if (line.startsWith("@@ ")) {
              const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
              if (match) {
                currentLineNum = parseInt(match[1], 10);
              }
            } else if (line.startsWith("+") && !line.startsWith("+++")) {
              const content = line.slice(1);
              fileAddedLines.push({
                line: currentLineNum,
                content
              });
              currentLineNum++;
            }
          }
          if (fileAddedLines.length > 0) {
            addedLinesByFile.set(filePath, fileAddedLines);
          }
        } catch (err) {
          throw new Error(`Failed to extract staged diff for "${filePath}": ${err.message}`);
        }
      }
      return addedLinesByFile;
    }
    module2.exports = {
      findGitRoot,
      findHooksDir,
      getStagedFiles,
      getStagedBlob: getStagedBlob2,
      getStagedAddedLines
    };
  }
});

// bin/lib/secret-fixtures.json
var require_secret_fixtures = __commonJS({
  "bin/lib/secret-fixtures.json"(exports2, module2) {
    module2.exports = {
      description: "Exact-line synthetic test fixture exceptions; never a directory-wide exemption. Additional or changed content is scanned.",
      entries: [
        {
          file: "contextos-mcp/tests/security.test.ts",
          ruleId: "SEC-006",
          lineSha256: "609e5a1c12f51db2215f5a1ff4095f18609b52a95dc69ea365eaef01133a06cc",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/security.test.ts",
          ruleId: "SEC-006",
          lineSha256: "0af0188e268b06c292b0134a78e2207e19da29683db8589d2bae9f832a92b61e",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/security.test.ts",
          ruleId: "SEC-001",
          lineSha256: "a45ffb1f850502e9aea96c153613e3c72d5e5575c879ba95c332b90977919888",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/security.test.ts",
          ruleId: "SEC-003",
          lineSha256: "64118e1e212cc7558e4f7cca2e5b8ce5918a1bd19cd5d53c540d9766832b545a",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/security.test.ts",
          ruleId: "SEC-010",
          lineSha256: "f5281868c169ec9c02b745c55d9c5af1f20bf9ee167396899f631693f079374d",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/secret-filter.test.ts",
          ruleId: "SEC-011",
          lineSha256: "2402d8df78dccea700ac4017d572ae15d683bc4113269aa46678aa7be6466ab5",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/secret-filter.test.ts",
          ruleId: "SEC-011",
          lineSha256: "8a9792709df2a04fbdb1cf15f04197560cf3291d961381618ea2604d0fb94624",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/secret-filter.test.ts",
          ruleId: "SEC-003",
          lineSha256: "5181b1eb3c9ac66411a163e6aeeda459a171f51a97c17098415f82eb0cda0e43",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/secret-filter.test.ts",
          ruleId: "SEC-001",
          lineSha256: "fc8ba571b10e2a16c34ca9bad88ff13ed3c1af24a48bab5f5b81fcd40175e869",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/verification-spec.test.ts",
          ruleId: "SEC-003",
          lineSha256: "0ab64d6e85e36feda50f0b5493fc39b3d3094345a8848b550f980ba643d8b8ea",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "contextos-mcp/tests/unit/verification-spec.test.ts",
          ruleId: "SEC-003",
          lineSha256: "d2b7caaa8ccb06f187c86477a0a328de677e5a37d81d0b4bd0bc3aacc34bc2e6",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/scan.test.js",
          ruleId: "SEC-006",
          lineSha256: "6e3d99b590e999aaac37cb42624d47bbe8a14284dd414807fbccdf6b1f6178c9",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/scan.test.js",
          ruleId: "SEC-006",
          lineSha256: "aeaca8d2c4466a616141900dab705b33feaaef32af9c44e414fdc2fc09fac347",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/scan.test.js",
          ruleId: "SEC-006",
          lineSha256: "dd7609bba90bea89d57c0afd9b7840bd4880fd3ea41059a57431e13154c4cdd8",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/scan.test.js",
          ruleId: "SEC-006",
          lineSha256: "41b5fb501baed20db2615d161afe9d3665c620e74a748f33f3929736fced3c3b",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/tarball-smoke.test.js",
          ruleId: "SEC-006",
          lineSha256: "6e3d99b590e999aaac37cb42624d47bbe8a14284dd414807fbccdf6b1f6178c9",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/tarball-smoke.test.js",
          ruleId: "SEC-006",
          lineSha256: "d6e68ed1fa3aa50dbfe9c25dc86a28595b91e93f1f46d25f7f68c57b8f28d690",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/verification-reviewer-pipeline.test.js",
          ruleId: "SEC-006",
          lineSha256: "5981e8c7fd1d64f3f19de11759d60070d81eb7840c5679700d94ccb184bb7a36",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        },
        {
          file: "tests/verification-reviewer-pipeline.test.js",
          ruleId: "SEC-006",
          lineSha256: "e5a8db914291b091ab94fea5ffde4df0975f9f523f8849083cc013ef67828292",
          reason: "Existing synthetic security regression fixture; only this exact line and rule are excluded."
        }
      ]
    };
  }
});

// bin/lib/scan.js
var require_scan = __commonJS({
  "bin/lib/scan.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs");
    var path2 = require("path");
    var crypto = require("crypto");
    var syntheticFixtures = require_secret_fixtures().entries;
    var {
      findGitRoot,
      getStagedFiles,
      getStagedBlob: getStagedBlob2,
      getStagedAddedLines
    } = require_git_snapshot();
    var BLOCKED_EXACT_NAMES2 = /* @__PURE__ */ new Set([
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
      ".env.staging",
      ".env.test",
      ".netrc",
      ".git-credentials",
      ".npmrc",
      "credentials.json",
      "service-account.json",
      "serviceaccountkey.json",
      "id_rsa",
      "id_ed25519",
      "mcp_config.json"
    ]);
    var BLOCKED_EXTENSIONS2 = /* @__PURE__ */ new Set([
      ".key",
      ".pem",
      ".pfx",
      ".p12",
      ".pkcs12"
    ]);
    var SECRET_PATTERNS2 = [
      {
        ruleId: "SEC-001",
        name: "Private Key Header",
        pattern: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA|PGP)?\s*PRIVATE\s+KEY-----/
      },
      {
        ruleId: "SEC-002",
        name: "Hardcoded User Home Path Leak",
        pattern: /(?:[a-zA-Z]:[/\\]Users[/\\]|\/(?:home|Users)\/)[a-zA-Z0-9_-]+[/\\](?:Desktop|Documents|Downloads|code|projects|repos)\b/i
      },
      {
        ruleId: "SEC-003",
        name: "GitHub Personal Access Token",
        pattern: /\b(?:ghp|gho)_[A-Za-z0-9]{36}\b/
      },
      {
        ruleId: "SEC-004",
        name: "GitHub Fine-Grained PAT",
        pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/
      },
      {
        ruleId: "SEC-005",
        name: "Google API Key",
        pattern: /\bAIza[A-Za-z0-9_-]{35}\b/
      },
      {
        ruleId: "SEC-006",
        name: "OpenAI API Key",
        pattern: /\bsk-[A-Za-z0-9]{32,}\b/
      },
      {
        ruleId: "SEC-007",
        name: "Anthropic API Key",
        pattern: /\bsk-ant-[A-Za-z0-9-]{90,}\b/
      },
      {
        ruleId: "SEC-008",
        name: "OpenRouter API Key",
        pattern: /\bsk-or-v1-[a-f0-9]{64}\b/
      },
      {
        ruleId: "SEC-009",
        name: "Slack Token",
        pattern: /\bxox[baprs]-[A-Za-z0-9_-]{10,48}\b/
      },
      {
        ruleId: "SEC-010",
        name: "npm Access Token",
        pattern: /\bnpm_[A-Za-z0-9]{32,36}\b/
      },
      {
        ruleId: "SEC-011",
        name: "AWS Access Key ID",
        pattern: /\bAKIA[0-9A-Z]{16}\b/
      }
    ];
    var PLACEHOLDER_PATTERNS = [
      {
        ruleId: "CODE-001",
        name: "Lazy Stub Comment",
        pattern: /(?:\/\/|\/\*|#)\s*(?:TODO:\s*implement later|\.\.\.\s*rest of code stays here\s*\.\.\.|TODO:\s*implement\b)/i
      },
      {
        ruleId: "CODE-002",
        name: "NotImplementedError Stub",
        pattern: /raise\s+NotImplementedError\s*\(\s*["'].*TODO.*["']\s*\)/i
      },
      {
        ruleId: "CODE-003",
        name: "Python Pass Stub",
        pattern: /^\s*pass\s*#\s*TODO\b/i
      }
    ];
    var EXEMPT_SEGMENTS = /* @__PURE__ */ new Set([
      ".git",
      "node_modules"
    ]);
    function isExempt2(filePath) {
      const norm = filePath.replace(/\\/g, "/");
      const segments = norm.split("/");
      return segments.some((seg) => EXEMPT_SEGMENTS.has(seg));
    }
    function syntheticFixtureException2(filePath, ruleId, line) {
      const file = filePath.replace(/\\/g, "/");
      const lineSha256 = crypto.createHash("sha256").update(line).digest("hex");
      return syntheticFixtures.find((entry) => entry.file === file && entry.ruleId === ruleId && entry.lineSha256 === lineSha256);
    }
    function redact2(str) {
      if (str.length <= 8) return "***";
      return str.slice(0, 4) + "..." + str.slice(-4);
    }
    function matchesScope(filePath, pattern) {
      const normFile = filePath.replace(/\\/g, "/").toLowerCase();
      const normPattern = pattern.replace(/\\/g, "/").toLowerCase();
      if (normPattern.endsWith("/**")) {
        const prefix = normPattern.slice(0, -3);
        return normFile === prefix || normFile.startsWith(prefix + "/");
      }
      if (normPattern.endsWith("/*")) {
        const prefix = normPattern.slice(0, -2);
        if (!normFile.startsWith(prefix + "/")) return false;
        const rest = normFile.slice(prefix.length + 1);
        return !rest.includes("/");
      }
      if (normPattern.includes("*")) {
        const reg = new RegExp("^" + normPattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*") + "$");
        return reg.test(normFile);
      }
      return normFile === normPattern || normFile.startsWith(normPattern + "/");
    }
    function runScan(options = {}) {
      const cwd = path2.resolve(options.cwd || process.cwd());
      const gitRoot = findGitRoot(cwd);
      if (!gitRoot) {
        return {
          ok: false,
          code: 2,
          error: "Not a Git repository. ContextOS scanner requires Git.",
          findings: [],
          stats: { filesScanned: 0, violations: 0 }
        };
      }
      const checkSecrets = options.secrets !== false;
      const checkPlaceholders = Boolean(options.placeholders);
      const enforce = Boolean(options.enforce);
      let targetScopeFile = options.scope || null;
      let scopeStatus = "not_configured";
      if (!targetScopeFile) {
        const defaultScope = path2.join(gitRoot, ".agents", "task-scope.json");
        if (fs2.existsSync(defaultScope)) {
          targetScopeFile = ".agents/task-scope.json";
        }
      }
      let allowedScopePatterns = null;
      if (targetScopeFile) {
        const resolvedScopePath = path2.resolve(gitRoot, targetScopeFile);
        if (!fs2.existsSync(resolvedScopePath)) {
          return {
            ok: false,
            code: 2,
            error: `Scope file not found: ${targetScopeFile}`,
            findings: [],
            stats: { filesScanned: 0, violations: 0 }
          };
        }
        try {
          const scopeData = JSON.parse(fs2.readFileSync(resolvedScopePath, "utf8"));
          const list = Array.isArray(scopeData) ? scopeData : scopeData.allowedPaths || scopeData.files;
          if (!Array.isArray(list)) {
            throw new Error("Scope declaration must be an array of paths or have an allowedPaths array");
          }
          for (const p of list) {
            if (path2.isAbsolute(p) || p.includes("..")) {
              throw new Error(`Scope entry "${p}" is invalid (must be relative and cannot traverse outside repo)`);
            }
          }
          allowedScopePatterns = list;
          scopeStatus = `active (${targetScopeFile})`;
        } catch (err) {
          return {
            ok: false,
            code: 2,
            error: `Invalid task scope file: ${err.message}`,
            findings: [],
            stats: { filesScanned: 0, violations: 0 }
          };
        }
      }
      let stagedEntries = [];
      try {
        stagedEntries = getStagedFiles(gitRoot);
      } catch (err) {
        return {
          ok: false,
          code: 2,
          error: `Failed to inspect Git index: ${err.message}`,
          findings: [],
          stats: { filesScanned: 0, violations: 0 }
        };
      }
      const findings = [];
      const excluded = [];
      let contentFilesScanned = 0;
      let addedLinesMap = /* @__PURE__ */ new Map();
      if (checkPlaceholders) {
        try {
          const activePaths = stagedEntries.filter((e) => e.status !== "D").map((e) => e.path);
          addedLinesMap = getStagedAddedLines(gitRoot, activePaths);
        } catch (err) {
          return {
            ok: false,
            code: 2,
            error: `Failed to inspect staged added lines: ${err.message}`,
            findings: [],
            stats: { filesScanned: stagedEntries.length, violations: 0 }
          };
        }
      }
      for (const entry of stagedEntries) {
        const relPath = entry.path;
        const baseName = path2.basename(relPath).toLowerCase();
        const extName = path2.extname(relPath).toLowerCase();
        if (allowedScopePatterns) {
          const inScope = allowedScopePatterns.some((p) => matchesScope(relPath, p));
          if (!inScope) {
            findings.push({
              ruleId: "SCOPE-001",
              file: relPath,
              type: "Scope Violation",
              severity: "error",
              details: `Staged file "${relPath}" is outside allowed task scope`
            });
          }
          if (entry.oldPath) {
            const oldInScope = allowedScopePatterns.some((p) => matchesScope(entry.oldPath, p));
            if (!oldInScope) {
              findings.push({
                ruleId: "SCOPE-001",
                file: entry.oldPath,
                type: "Scope Violation",
                severity: "error",
                details: `Source file of rename "${entry.oldPath}" is outside allowed task scope`
              });
            }
          }
        }
        if (entry.status === "D") continue;
        if (checkSecrets && BLOCKED_EXACT_NAMES2.has(baseName)) {
          findings.push({
            ruleId: "SEC-000",
            file: relPath,
            type: "Blocked Filename",
            severity: "error",
            details: `Filename "${baseName}" is forbidden from being committed into Git.`
          });
          continue;
        }
        if (checkSecrets && BLOCKED_EXTENSIONS2.has(extName)) {
          findings.push({
            ruleId: "SEC-000",
            file: relPath,
            type: "Blocked Extension",
            severity: "error",
            details: `Extension "${extName}" indicates private cryptographic keys or certificates.`
          });
          continue;
        }
        if (isExempt2(relPath)) {
          excluded.push({ file: relPath, reason: "Git/dependency internals", checks: ["secrets", "placeholders"] });
          continue;
        }
        let blob;
        try {
          blob = getStagedBlob2(relPath, gitRoot);
        } catch (err) {
          return {
            ok: false,
            code: 2,
            error: `Failed to read staged blob for "${relPath}": ${err.message}`,
            findings,
            stats: { filesScanned: stagedEntries.length, violations: findings.length }
          };
        }
        if (!blob) {
          return {
            ok: false,
            code: 2,
            error: `Failed to read staged blob for "${relPath}": file unreadable in git index`,
            findings,
            stats: { filesScanned: stagedEntries.length, violations: findings.length }
          };
        }
        if (blob.length > 2 * 1024 * 1024) {
          excluded.push({ file: relPath, reason: "Content exceeds 2MB limit", checks: ["secrets", "placeholders"] });
          if (enforce) {
            findings.push({
              ruleId: "SCAN-SKIP-001",
              file: relPath,
              type: "Skipped Large File",
              severity: "error",
              details: `Staged file "${relPath}" exceeds 2MB limit (${(blob.length / (1024 * 1024)).toFixed(2)}MB) and cannot be verified for secrets in enforce mode.`
            });
          }
          continue;
        }
        const content = blob.toString("utf8");
        const lines = content.split(/\r?\n/);
        contentFilesScanned++;
        if (checkSecrets) {
          for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
            const line = lines[lineNum - 1];
            for (const { ruleId, name, pattern } of SECRET_PATTERNS2) {
              const match = line.match(pattern);
              if (match) {
                const exception = syntheticFixtureException2(relPath, ruleId, line);
                if (exception) {
                  excluded.push({ file: relPath, line: lineNum, ruleId, reason: exception.reason });
                  continue;
                }
                findings.push({
                  ruleId,
                  file: relPath,
                  line: lineNum,
                  type: name,
                  severity: "error",
                  details: `Detected pattern "${name}": ${redact2(match[0])}`
                });
              }
            }
          }
        }
        if (checkPlaceholders && addedLinesMap.has(relPath)) {
          const addedLines = addedLinesMap.get(relPath);
          if (extName !== ".md" && extName !== ".txt") {
            for (const { line, content: addedLine } of addedLines) {
              if (addedLine.includes("contextos:allow-placeholder")) continue;
              for (const { ruleId, name, pattern } of PLACEHOLDER_PATTERNS) {
                const match = addedLine.match(pattern);
                if (match) {
                  findings.push({
                    ruleId,
                    file: relPath,
                    line,
                    type: name,
                    severity: "warning",
                    details: `Detected un-implemented placeholder stub: "${match[0].trim()}"`
                  });
                }
              }
            }
          }
        }
      }
      const hasViolations = findings.length > 0;
      const exitCode = hasViolations && enforce ? 1 : 0;
      return {
        ok: exitCode === 0,
        code: exitCode,
        message: !hasViolations ? "No violations found in the staged files" : enforce ? "Blocking violations detected in staged index" : `${findings.length} finding(s) reported in advisory mode; nothing blocks the commit (use --enforce to fail on them)`,
        gitRoot,
        enforce,
        scope: {
          file: targetScopeFile,
          status: scopeStatus
        },
        findings,
        coverage: { excluded },
        stats: {
          stagedFilesCount: stagedEntries.length,
          contentFilesScanned,
          violationsCount: findings.length,
          errorsCount: findings.filter((f) => f.severity === "error").length,
          warningsCount: findings.filter((f) => f.severity === "warning").length
        }
      };
    }
    module2.exports = {
      runScan,
      BLOCKED_EXACT_NAMES: BLOCKED_EXACT_NAMES2,
      BLOCKED_EXTENSIONS: BLOCKED_EXTENSIONS2,
      SECRET_PATTERNS: SECRET_PATTERNS2,
      PLACEHOLDER_PATTERNS,
      matchesScope,
      redact: redact2,
      isExempt: isExempt2,
      syntheticFixtureException: syntheticFixtureException2
    };
  }
});

// scripts/check-secrets.js
var fs = require("fs");
var path = require("path");
var { execFileSync } = require("child_process");
var { parseEnv } = require("node:util");
var { getStagedBlob } = require_git_snapshot();
var ROOT_DIR = path.resolve(__dirname, "..");
var {
  BLOCKED_EXACT_NAMES,
  BLOCKED_EXTENSIONS,
  SECRET_PATTERNS,
  redact,
  isExempt,
  syntheticFixtureException
} = require_scan();
function getFilesToScan(mode) {
  try {
    if (mode === "--staged") {
      const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z", "--no-ext-diff"], {
        cwd: ROOT_DIR,
        encoding: "utf8"
      });
      return output.split("\0").filter(Boolean);
    }
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT_DIR, encoding: "utf8" }).split("\0").filter(Boolean);
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT_DIR, encoding: "utf8" }).split("\0").filter(Boolean);
    return Array.from(/* @__PURE__ */ new Set([...tracked, ...untracked]));
  } catch (err) {
    console.error(`[check-secrets] Error: Failed to query git (${err.message}). Git repository verification required.`);
    process.exit(2);
  }
}
function findLocalEnvFiles(dir = ROOT_DIR, { coreOnly = false } = {}) {
  const envFiles = [];
  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (["node_modules", ".git", ".swarm-worktrees", ".contextos-worktrees", ".external-skills", "scratch"].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const rel = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
      if (coreOnly && (rel === "contextos-mcp" || rel === ".agents/mcp")) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if ((lower === ".env" || lower.startsWith(".env.")) && lower !== ".env.example") {
          envFiles.push(path.relative(ROOT_DIR, fullPath));
        }
      }
    }
  }
  walk(dir);
  return envFiles;
}
function scanFile(relPath, { isLocalEnvOnly = false, snapshot, excluded = [] } = {}) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (!snapshot && !fs.existsSync(fullPath)) return [];
  const stat = snapshot ? { size: snapshot.length, isDirectory: () => false } : fs.statSync(fullPath);
  if (stat.isDirectory()) return [];
  const violations = [];
  const baseName = path.basename(relPath).toLowerCase();
  const extName = path.extname(relPath).toLowerCase();
  if (!isLocalEnvOnly && BLOCKED_EXACT_NAMES.has(baseName)) {
    violations.push({
      file: relPath,
      type: "Blocked Filename",
      details: `Filename "${baseName}" is forbidden from being committed.`
    });
    return violations;
  }
  if (BLOCKED_EXTENSIONS.has(extName)) {
    violations.push({
      file: relPath,
      type: "Blocked Extension",
      details: `Extension "${extName}" indicates private keys or certificates.`
    });
    return violations;
  }
  if (isExempt(relPath)) {
    excluded.push({ file: relPath, reason: "Git/dependency internals" });
    return violations;
  }
  if (stat.size > 2 * 1024 * 1024) {
    excluded.push({ file: relPath, reason: "Content exceeds 2MB limit" });
    return violations;
  }
  let content;
  try {
    content = snapshot ? snapshot.toString("utf8") : fs.readFileSync(fullPath, "utf8");
  } catch {
    return violations;
  }
  const lines = content.split(/\r?\n/);
  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];
    for (const { ruleId, name, pattern } of SECRET_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const exception = syntheticFixtureException(relPath, ruleId, line);
        if (exception) {
          excluded.push({ file: relPath, line: lineNum, ruleId, reason: exception.reason });
          continue;
        }
        violations.push({
          file: relPath,
          line: lineNum,
          type: isLocalEnvOnly ? `Exposed Secret in Local Environment File (${name})` : name,
          details: `Detected pattern "${name}": ${redact(match[0])}`
        });
      }
    }
  }
  return violations;
}
function main() {
  const mode = process.argv.includes("--staged") ? "--staged" : "--all";
  const coreOnly = process.argv.includes("--core-only");
  const mcpOnly = process.argv.includes("--mcp-only");
  if (coreOnly && mcpOnly) throw new Error("Select only one secret-scan scope");
  if (mcpOnly && !fs.existsSync(path.join(ROOT_DIR, "contextos-mcp/package.json"))) throw new Error("MCP package is unavailable for secret scanning");
  const files = getFilesToScan(mode).filter((file) => {
    const normalized = file.replace(/\\/g, "/");
    if (mcpOnly) return normalized.startsWith("contextos-mcp/");
    return !coreOnly || !/^(?:contextos-mcp|\.agents\/mcp)\//.test(normalized);
  });
  const localEnvFiles = findLocalEnvFiles(mcpOnly ? path.join(ROOT_DIR, "contextos-mcp") : ROOT_DIR, { coreOnly });
  const knownSecrets = [];
  for (const file of localEnvFiles) {
    const values = parseEnv(fs.readFileSync(path.join(ROOT_DIR, file), "utf8"));
    for (const [name, value] of Object.entries(values)) {
      if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && value.length >= 16) knownSecrets.push(Buffer.from(value));
    }
  }
  const totalFilesCount = files.length;
  if (totalFilesCount === 0) {
    if (coreOnly || mcpOnly) {
      console.error("[check-secrets] Selected package scope has no files to scan.");
      process.exit(2);
    }
    console.log("[check-secrets] No files to scan.");
    process.exit(0);
  }
  console.log(`[check-secrets] Scanning ${totalFilesCount} file(s) for secrets and blocked credentials (${mode})...`);
  if (coreOnly) console.log("[check-secrets] Core-only scope excludes contextos-mcp/ and .agents/mcp/.");
  if (mcpOnly) console.log("[check-secrets] MCP-only scope includes contextos-mcp/ only.");
  const allViolations = [];
  const excluded = [];
  for (const file of files) {
    const snapshot = mode === "--staged" ? getStagedBlob(file, ROOT_DIR) : void 0;
    const v = scanFile(file, { snapshot, excluded });
    if (v.length > 0) {
      allViolations.push(...v);
    }
    const fullPath = path.join(ROOT_DIR, file);
    const data = snapshot || (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() ? fs.readFileSync(fullPath) : null);
    if (data && knownSecrets.some((secret) => data.includes(secret))) {
      allViolations.push({ file, type: "Local credential copied into exportable file", details: "Credential value redacted." });
    }
  }
  console.log(`[check-secrets] Content coverage exclusions: ${JSON.stringify(excluded)}`);
  if (allViolations.length > 0) {
    console.error("\n" + "=".repeat(70));
    console.error(" \u{1F6A8} SECURITY CHECK FAILED: Potential Secrets Detected");
    console.error("=".repeat(70));
    for (const v of allViolations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      console.error(` \u2022 [${v.type}] in ${loc}`);
      console.error(`   ${v.details}`);
    }
    console.error("=".repeat(70));
    console.error("Commit rejected. Please remove secrets or use environment variables.\n");
    process.exit(1);
  }
  console.log(" [check-secrets] Passed: No secrets or credentials found.\n");
  process.exit(0);
}
main();
