# ContextOS Product Requirements Document (PRD)

## Product Vision
ContextOS is a deterministic context compiler and policy engine for AI coding agents. It provides a single source of truth for engineering rules (skills) and compiles them into minimal, verifiable context payloads tailored to the specific agent and task. It ensures that regardless of whether a team uses Cursor, Claude Code, Copilot, or Aider, the AI operates under identical, version-controlled guidelines without prompt bloat.

## Target Audience (ICP)
- **Platform Engineering & DX Teams**: Need a centralized way to govern AI coding standards across multiple repositories and multiple AI agent tools.
- **AI Enablement Leads / Staff Engineers**: Seeking to eliminate "AI slop" by ensuring agents strictly follow architectural, security, and design policies.
- **Teams with Multi-Agent Toolchains**: Developers using a mix of Cursor, Claude Desktop, and CLI agents who suffer from fragmented, drifting `.rules` files.

## Goals
1. **Portable Rules**: Author engineering skills once in Markdown; automatically generate optimal configurations for Gemini, Claude, Cursor, Copilot, Aider, and Zed.
2. **Minimal Context Budget**: Dynamically resolve and inject only the rules relevant to the immediate task to preserve LLM token context windows.
3. **Verifiable & Drift-Free**: Guarantee what context the agent actually received using dual-hashed lockfiles and CI quality gates.

## Non-Goals
- We are not a new coding agent, IDE, or LLM wrapper.
- We do not aim to be a general-purpose multi-agent orchestrator or scheduler.
- We do not host LLMs or compete with model providers.
- We do not execute untrusted LLM-generated code in the Core product (execution capabilities belong strictly to the separate, experimental Runtime package).

## Core Boundaries (Stable)
- **Manifests & Resolver**: The logic for determining which skills apply to which tasks.
- **Adapters**: The compilers that format rules for specific AI assistants.
- **Lockfile & Validation**: Lockfile v2 (dual hash, deterministic generation) and drift detection logic.

## Runtime Boundaries (Beta / Experimental)
- **MCP Bridge**: A read-only Model Context Protocol server exposing project rules to agents (Beta).
- **Worktree Execution**: Parallel sub-agent execution and sandboxed OCI verification (Experimental, isolated from Core distribution).
