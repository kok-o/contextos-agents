# Contributing to contextos-agents

Thank you for contributing! This guide explains how to add skills, run tests, and submit pull requests.

---

## How to Add a New Skill

### Step 1: Create the skill directory

```bash
mkdir .agents/core/skills/<your-skill-name>
```

Skill names should be lowercase, hyphenated (e.g., `vue`, `prisma`, `docker`).

### Step 2: Create `SKILL.md`

```bash
touch .agents/core/skills/<your-skill-name>/SKILL.md
```

**Required structure:**

```markdown
---
name: your-skill-name
description: >
  One or two sentence description of what this skill does
  and when it activates.
---

# Skill Title — Short Tagline

Brief explanation of the source/inspiration.

## Core Principle

> One-sentence guiding principle in a blockquote.

---

## [Main content sections...]
```

**Rules for skill content:**

- Must have valid YAML frontmatter with `name:` and `description:`
- Must have at least one `## Section` heading
- Must be > 100 bytes (not empty)
- Should include concrete examples, not just abstract principles
- Should include an anti-patterns table where applicable

### Step 3: Compile and test

```bash
# Compile skills for all agents
node .agents/ctx.js export all

# Verify the generated output
cat .agents/generated/gemini/skills/<your-skill-name>/SKILL.md
cat .agents/generated/claude/skills/<your-skill-name>/SKILL.md
```

### Step 4: Run tests

```bash
npm test
```

All 245 tests across 39 suites (and 510 MCP tests) must pass before submitting a PR.

---

## How to Test Locally (npm link)

To test the full installation flow as if a user ran `npx contextos`:

```bash
# In the repo root:
npm link

# In a fresh test project directory:
mkdir /tmp/test-project && cd /tmp/test-project
npm init -y
npx contextos

# Verify:
ls .agents/
cat .agents/AGENTS.md
```

To unlink when done:

```bash
npm unlink contextos-agents
```

---

## CLI Commands Reference

| Command | Description |
| --------- | ------------- |
| `contextos doctor` | Diagnostic health check for skills, profiles, and sync |
| `contextos stats` | Token savings telemetry report across task categories |
| `contextos watch` | Continuous background watcher & auto-compiler daemon |
| `contextos resolve <prompt>` | Dynamic minimal skill resolution (`--explain`, `--json`) |
| `contextos detect` | Workspace Evidence Graph detection (`--scope`, `--explain`) |
| `contextos profile list/explain/apply` | Profile management (`--scope`, `--no-export`, `--json`) |
| `contextos export gemini` | Compile skills for Gemini / Antigravity |
| `contextos export claude` | Compile skills for Claude Code |
| `contextos export cursor` | Compile → `.cursorrules` + `.cursor/rules/*.mdc` |
| `contextos export copilot` | Compile → `.github/copilot-instructions.md` |
| `contextos export aider` | Compile → `.aider.conf.yml` + `CONVENTIONS.md` |
| `contextos export zed` | Compile → `.zed/rules.md` + `.zed/prompts/*.md` |
| `contextos export all` | Compile for all agents |
| `contextos validate` | Validate skills, frontmatter, schemas v2, deps & sync |
| `node .agents/ctx.js skill add <ref>` | Install a plugin skill |
| `node .agents/ctx.js skill remove <name>` | Remove a plugin skill |
| `node .agents/ctx.js skill list` | List built-in + plugin skills |
| `node .agents/ctx.js skill search [q]` | Search community registry |
| `npm test` | Run full test suite (245 tests, 21 test files) |
| `npm run validate` | Alias for `ctx.js validate` |
| `npm run build` | Alias for `export all` |
| `npm run watch` | Alias for `contextos watch` |
| `npm run benchmark` | Run deterministic static benchmark suite |
| `npm run benchmark:runtime` | Run execution-backed V8 runtime benchmark suite |

---

## Skill Manifest V2 Format (`skill.yaml`)

Each skill must include a `skill.yaml` alongside `SKILL.md` conforming to the Manifest V2 schema ([`.agents/schemas/skill.v2.schema.json`](./.agents/schemas/skill.v2.schema.json)):

```yaml
schemaVersion: 2
id: your-skill-name
displayName: Your Skill Name
version: 1.0.0
description: >
  Concise description of what this skill does and when it activates.
type: instruction-only
category: frontend
entrypoint: SKILL.md

signals:
  aliases: [your-skill]
  keywords:
    - value: your feature keyword
      locale: en
      weight: 10
  fileGlobs:
    - value: "**/config.js"
      weight: 15
  packages:
    - ecosystem: npm
      name: your-package
      weight: 15

dependencies:
  requires: [typescript]      # mandatory transitive dependencies
  optional: []                # recommended auxiliary skills
  conflicts: []               # incompatible skills

context:
  priority: 50
  estimatedTokens: 1200

resources:
  - path: references/guide.md
    mode: on-demand
```

The manifest compiler validates DAG cycles, ensures referential integrity, and generates deterministic SHA-256 hashes into `.agents/compiled/registry.v2.json`.

---

## Architecture Decision Records (ADRs)

Any architectural changes, new platform layers, lifecycle phases, or contract modifications require an Architecture Decision Record (ADR) under [`docs/decisions/`](./docs/decisions/) before implementation. Follow the format of existing ADRs (ADR-001 through ADR-010).

---

## Publishing a Skill as a Plugin

You can share your skill with the community in three ways:

### Option A — GitHub (simplest)

1. Create a public GitHub repo (e.g. `alice/my-cool-skill`)
2. Put your `SKILL.md` (and optional `skill.yaml`) at the repo root
3. Users install it with:

   ```bash
   node .agents/ctx.js skill add alice/my-cool-skill
   ```

If your skill lives in a subdirectory of a monorepo:

```bash
node .agents/ctx.js skill add alice/my-monorepo/skills/docker
```

### Option B — npm package

1. Create a package with this structure:

   ```
   my-skill-package/
   ├── SKILL.md          ← required
   ├── skill.yaml        ← optional
   └── package.json      ← required for npm
   ```

2. `package.json` must have a `contextos` field:

   ```json
   {
     "name": "contextos-skill-docker",
     "version": "1.0.0",
     "contextos": {
       "type": "skill",
       "name": "docker"
     }
   }
   ```

3. Publish to npm: `npm publish`

4. Users install it with:

   ```bash
   node .agents/ctx.js skill add contextos-skill-docker
   ```

### Option C — Add to the Community Registry

Submit a PR to add your skill to [`registry.json`](./registry.json):

```json
{
  "id": "alice/my-skill",
  "name": "my-skill",
  "description": "Short description of what your skill does.",
  "author": "alice",
  "tags": ["backend", "docker"],
  "npm": null,
  "github": "alice/my-cool-skill",
  "path": null,
  "builtin": false
}
```

This makes your skill discoverable via:

```bash
node .agents/ctx.js skill search docker
```

### Plugin Skill Requirements

Your `SKILL.md` must:

- Have valid YAML frontmatter with `name:` and `description:`
- Have at least one `## Section` heading
- Be > 100 bytes
- **Not** use the same name as a built-in skill

---

## Pull Request Checklist

Before opening a PR:

- [ ] New skill directory is in `.agents/core/skills/<name>/`
- [ ] `SKILL.md` has valid YAML frontmatter with `name:` and `description:`
- [ ] `SKILL.md` has substantial content (> 100 bytes)
- [ ] `npm test` passes (all tests green)
- [ ] `node .agents/ctx.js export all` runs without errors
- [ ] `node .agents/ctx.js validate` passes with 0 errors
- [ ] Skill is referenced in `AGENTS.md` Skill Registry table (if major)

---

## Project Structure

```
contextos-agents/
├── bin/
│   └── index.js              ← npm installer & unified CLI (contextos)
├── registry.json             ← Community skill registry
├── registry.schema.json      ← JSON Schema for registry entries
├── .agents/
│   ├── AGENTS.md             ← Master orchestrator (skill routing rules)
│   ├── skills.json           ← Skill registry
│   ├── ctx.js                ← Context compiler + skill plugin CLI
│   ├── validate.js           ← Skill validation engine
│   ├── plugins.js            ← Plugin manager (add/remove/list/search)
│   ├── profiles.js           ← Profile definitions & stack auto-detection
│   ├── resolver.js           ← AST import graph & dynamic skill resolver
│   ├── doctor.js             ← Repository health diagnostic checker
│   ├── stats.js              ← Token savings benchmark reporter
│   ├── watch.js              ← Continuous file watcher auto-sync daemon
│   ├── core/
│   │   └── skills/           ← SKILL SOURCE FILES (edit these)
│   │       ├── gstack-roles/
│   │       ├── ui-ux-pro/
│   │       └── ...
│   ├── adapters/
│   │   ├── gemini/export.js  ← Gemini adapter
│   │   ├── claude/export.js  ← Claude adapter
│   │   ├── cursor/export.js  ← Cursor adapter
│   │   ├── copilot/export.js ← GitHub Copilot adapter
│   │   ├── aider/export.js   ← Aider adapter
│   │   └── zed/export.js     ← Zed IDE adapter
│   ├── plugins/              ← THIRD-PARTY SKILLS (auto-created on install)
│   │   └── <plugin-name>/
│   │       ├── SKILL.md
│   │       ├── skill.yaml    ← optional
│   │       └── .source       ← install provenance metadata
│   └── generated/            ← COMPILED OUTPUT (do not edit manually)
│       ├── gemini/skills/
│       └── claude/skills/
├── contextos-mcp/            ← MCP EXECUTION ENGINE (worktree subagent swarm)
├── tests/
│   ├── install.test.js
│   ├── export.test.js
│   ├── skills.test.js
│   ├── validate.test.js
│   ├── plugins.test.js
│   ├── profile.test.js
│   ├── resolver.test.js
│   └── benchmark.test.js
└── package.json
```

---

## Code of Conduct

Be kind. Be constructive. Focus on improving the quality of skills for the community.
