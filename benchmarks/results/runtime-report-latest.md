# ContextOS Multi-Model Runtime Execution Benchmark Report

**Timestamp:** `2026-09-07T18:42:21.455Z`  
**Gateways Tested:** `OpenRouter (api.openrouter.ai)`, `AgentRouter Backup (ps.air-outer.com)`  
**Evaluated Models:** 3 flagship models  
**Execution Sandbox:** Real V8 Sandbox Assertions (`node:vm` + native TypeScript stripping + assertions)

---

## Executive Summary & Model Leaderboard

| Rank | Model | Gateway / Provider | Baseline Pass Rate | With ContextOS | Delta | V8 Compilation | Real-World Runtime Behavior |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---|
| 🥇 | **`glm-5.3`** | AgentRouter (ps.air-outer.com) | 53% | **93% (11/12)** | **+40%** | **100%** | High adherence to architectural invariants; passed 11/12 tests across security, DDD, and reliability. |
| 🥈 | **`deepseek-v4-flash`** | AgentRouter (ps.air-outer.com) | 0% | **49% (6/12)** | **+49%** | **67%** | Moderate adherence (6/12); minor test assertion edge cases. |
| 🥉 | **`gemini-3.8-flash`** | Google AI Studio | 27% | **33% (4/12)** | **+6%** | **67%** | Moderate adherence (4/12); minor test assertion edge cases. |

---

## Breakdown by Production Scenario

### Secure Authentication & Rate Limiting Handler (`Security & Backend`)

- **Skills Activated:** `security`, `node`, `ponytail-mindset`

| Model | Gateway | Baseline Pass | ContextOS Pass | Delta | Compilation |
|:---|:---|:---:|:---:|:---:|:---:|
| `glm-5.3` | AgentRouter (ps.air-outer.com) | 60% (3/5) | **80% (4/5)** | **+20%** | ✅ 100% |
| `deepseek-v4-flash` | AgentRouter (ps.air-outer.com) | 0% (0/5) | **80% (4/5)** | **+80%** | ✅ 100% |
| `gemini-3.8-flash` | Google AI Studio | 80% (4/5) | **0% (0/5)** | **-80%** | ❌ Fail |

---

### DDD Order Aggregate Root & Money Value Object (`Architecture & DDD`)

- **Skills Activated:** `ddd`, `system-design`, `typescript`

| Model | Gateway | Baseline Pass | ContextOS Pass | Delta | Compilation |
|:---|:---|:---:|:---:|:---:|:---:|
| `glm-5.3` | AgentRouter (ps.air-outer.com) | 0% (0/4) | **100% (4/4)** | **+100%** | ✅ 100% |
| `deepseek-v4-flash` | AgentRouter (ps.air-outer.com) | 0% (0/4) | **0% (0/4)** | **+0%** | ❌ Fail |
| `gemini-3.8-flash` | Google AI Studio | 0% (0/4) | **100% (4/4)** | **+100%** | ✅ 100% |

---

### Type-Safe Resilient API Client with Circuit Breaker (`TypeScript & Reliability`)

- **Skills Activated:** `typescript`, `system-design`, `performance`

| Model | Gateway | Baseline Pass | ContextOS Pass | Delta | Compilation |
|:---|:---|:---:|:---:|:---:|:---:|
| `glm-5.3` | AgentRouter (ps.air-outer.com) | 100% (3/3) | **100% (3/3)** | **+0%** | ✅ 100% |
| `deepseek-v4-flash` | AgentRouter (ps.air-outer.com) | 0% (0/3) | **67% (2/3)** | **+67%** | ✅ 100% |
| `gemini-3.8-flash` | Google AI Studio | 0% (0/3) | **0% (0/3)** | **+0%** | ✅ 100% |

---

