# ContextOS Product Requirements Document (PRD)

## Product Vision
ContextOS is a deterministic context and policy compiler for supported AI coding agents. It provides a version-controlled source for engineering rules, resolves the rules relevant to a task, compiles native agent configuration, and detects configuration drift.

## Target Audience (ICP)
- **Platform Engineering & DX Teams**: Need a centralized way to govern AI coding standards across multiple repositories and multiple AI agent tools.
- **AI Enablement Leads / Staff Engineers**: Seeking to eliminate "AI slop" by ensuring agents strictly follow architectural, security, and design policies.
- **Teams with Multi-Agent Toolchains**: Developers using a mix of Cursor, Claude Desktop, and CLI agents who suffer from fragmented, drifting `.rules` files.

## Goals
1. **Portable Rules**: Author engineering skills once in Markdown; automatically generate optimal configurations for Gemini, Claude, Cursor, Copilot, Aider, and Zed.
2. **Focused Context**: Resolve the rules and skills relevant to the immediate task.
3. **Verifiable Configuration**: Make generated configuration reproducible and detect drift with lockfiles and CI quality gates.

## Non-Goals
- We are not a new coding agent, IDE, or LLM wrapper.
- We do not aim to be a general-purpose multi-agent orchestrator or scheduler.
- We do not host LLMs or compete with model providers.
- Core does not orchestrate agents or provide code-execution sandboxes; those capabilities belong to separate experimental runtime work.

## Core Boundaries (Stable)
- **Manifests & Resolver**: The logic for determining which skills apply to which tasks.
- **Adapters**: The compilers that format rules for specific AI assistants.
- **Lockfile & Validation**: Lockfile v2 (dual hash, deterministic generation) and drift detection logic.

## Runtime Boundaries (Beta / Experimental)
- **MCP Bridge**: A read-only Model Context Protocol server exposing project rules to agents (Beta).
- **Worktree Execution**: Parallel sub-agent execution and sandboxed OCI verification (Experimental, isolated from Core distribution).
