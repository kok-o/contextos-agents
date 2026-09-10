# ContextOS Product Requirements Document (PRD)

## Product Vision
ContextOS is an AI Project Operating System that transforms raw language models into deterministic, secure, and collaborative engineering agents. It acts as a local orchestrator and MCP (Model Context Protocol) server, providing immutable context boundaries, verifiable execution, and robust state management for autonomous workflows.

## Target Audience (ICP)
- **Senior/Staff Engineers**: Leading AI adoption in complex codebases who need strong guardrails against "AI slop" and hallucinations.
- **Platform Engineering Teams**: Governing multi-agent parallel workflows and establishing centralized architectural standards (skills/profiles).
- **Security Teams**: Requiring absolute auditability, zero-trust filesystem mutations, and secure sandbox execution for LLM-generated code.

## Goals
1. **Context Efficiency**: Keep token usage low by providing only strictly necessary context via a generated project graph.
2. **Execution Integrity**: All file mutations are governed by crash-resilient Journaled Transactions with a Dual-Hashing CAS.
3. **Provable Success**: Benchmark v2 execution harnesses evaluate true success rates with immutable evidence, not marketing claims.
4. **Tool Compatibility**: Unified adapter system integrates identically with Gemini, Claude, Cursor, Copilot, Aider, and Zed.

## Non-Goals
- We do not host LLMs or compete with model providers.
- We are not a cloud CI/CD platform (execution remains local).
- We do not support unverified/unsigned external plugin loading out-of-the-box.

## Core Stable Boundaries
- **Project Structure**: `.agents/` directory schema and `profiles.js` format are stable.
- **Verification API**: OCI execution isolation format and verification attestations are stable.
- **Lockfile Format**: Lockfile v2 (dual hash, exact byte and CRLF-normalized) is the definitive truth model.

## Beta Boundaries
- Interactive Swarm orchestration.
- Sub-agent parallel delegation API.
- Deep workspace context graph extraction algorithms.
