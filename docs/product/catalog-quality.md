# ContextOS Catalog Quality: Skill Examples Verification and Quality Gate

This document records the verification framework, classification inventory, and execution results for code examples embedded across ContextOS skills.

---

## 1. Principles of Catalog Quality

Under Phase 4 of [docs/ROADMAP.md](../ROADMAP.md), ContextOS enforces that every claim of skill correctness must be backed by an automated verification check:

1. **No Phantom Code**: Code examples presented in `SKILL.md` files must be parsed or executed against declared language parsers and test runners.
2. **Deterministic Classification**: Every code block has an assigned ID, language, and category:
   - `runnable`: Executable code validated through AST syntax parsers, runtime type checks, or unit fixtures.
   - `illustrative`: Pseudo-code, directory trees, templates with placeholders (`{{...}}`), or HTTP headers with documented reasons.
   - `expected-failure`: Negative anti-patterns that must trigger specific errors.
   - `unverified`: Temporary backlog status; prohibited in certified skills.
3. **Negative Proof**: Automated tests must prove that introducing a defect or syntax error into an example makes the test suite fail (no false greens).
4. **Consumer Isolation**: All compilers, Playwright fixtures, and language runtimes (Python/Node) reside strictly within Author CI (`scripts/verify-skill-examples.js`, `tests/fixtures/skill-examples/`) and are never imposed as dependencies on consumer repositories.

---

## 2. First Coverage Inventory (Tasks 4.1 - 4.8)

The initial certification covers four foundational skills across backend, frontend, adapters, and security:

| Skill ID | File Path | Total Blocks | Runnable | Illustrative | Expected-Failure | Unverified | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **fastapi** | `catalog/skills/fastapi/SKILL.md` | 5 | 4 | 1 | 0 | 0 | PASSED |
| **web-accessibility** | `catalog/skills/web-accessibility/SKILL.md` | 3 | 3 | 0 | 0 | 0 | PASSED |
| **adapters** | `catalog/skills/adapters/SKILL.md` | 1 | 0 | 1 | 0 | 0 | PASSED |
| **security** | `.agents/core/skills/security/SKILL.md` | 3 | 2 | 1 | 0 | 0 | PASSED |
| **TOTAL** | - | **12** | **9** | **3** | **0** | **0** | **100% VERIFIED** |

---

## 3. Verified Code Blocks Breakdown

### 3.1 Backend: FastAPI (`fastapi`)
- `fastapi:pydantic-models`: Validates Pydantic v2 `BaseModel`, `EmailStr`, `Field`, and `ConfigDict(from_attributes=True)`.
- `fastapi:dependency-injection`: Validates `OAuth2PasswordBearer`, `AsyncSession` generator, and PyJWT error handling.
- `fastapi:error-handling`: Validates custom `AppException` subclassing `HTTPException`.
- `fastapi:testing`: Validates `@pytest.mark.asyncio` endpoint test signature with `httpx.AsyncClient`.
- `fastapi:project-structure`: Illustrative ASCII directory tree.

### 3.2 Frontend: Web Accessibility (`web-accessibility`)
- `web-accessibility:css:focus-visible`: Validates high-contrast focus rings (`outline: 2px solid #6366f1; outline-offset: 2px;`) and preservation of keyboard focus.
- `web-accessibility:modal:accessible-modal`: Validates HTMLDialogElement `.showModal()` contract, native keyboard focus trap, and Escape key cancellation.
- `web-accessibility:forms:accessible-forms`: Validates `aria-invalid`, `aria-describedby`, and mandatory `<label htmlFor>` association.

### 3.3 Security: Application Security (`security`)
- `security:timing-safe`: Validates `crypto.timingSafeEqual` HMAC webhook verification, length mismatch safety, and rejection of tampered payloads.
- `security:ssrf:allowlist`: Validates OWASP SSRF prevention client (`fetchFromAllowlist`), enforcing HTTPS, blocking embedded URL credentials, enforcing strict host allowlists, and rejecting automatic HTTP redirects.
- `security:headers`: Illustrative list of production HTTP security headers (CSP, HSTS, X-Frame-Options).

### 3.4 Adapters: Cross-Agent CLI (`adapters`)
- `adapters:cli:commands`: Validates that `contextos export` and supported target list (`gemini`, `claude`, `cursor`, `copilot`, `aider`, `zed`) map to verified commands in `bin/commands.js`.
- `adapters:aider:yaml`: Illustrative Aider configuration template.

---

## 4. Backlog Registry for Subsequent Catalog Skills

The remaining 29 skills in `catalog/skills/` are cataloged in the Phase 4 backlog and will be certified in prioritized groups:

| Priority Group | Skills Included | Planned Verification Fixtures |
| --- | --- | --- |
| **Group 2 (Frontend Core)** | `react`, `react-best-practices`, `nextjs`, `typescript`, `state-management` | React 19 hooks, server actions, TS generic constraints |
| **Group 3 (Design Systems)** | `ui-ux-pro`, `impeccable-design`, `ui-design`, `ux-design`, `minimalist-design`, `brutalist-design`, `soft-design`, `redesign-audit` | Design tokens, color contrast, CSS scale compliance |
| **Group 4 (Backend Services)** | `node`, `nestjs`, `system-design`, `microservices`, `ddd`, `database` | Node stream timeouts, NestJS decorators, parameterized SQL |
| **Group 5 (DevOps & Cross-Cutting)** | `testing`, `docker`, `decisions`, `architecture-diagrams`, `generators`, `graphify`, `performance`, `vercel-optimize` | Dockerfile multistage syntax, Vitest mocks, Edge cache headers |

---

## 5. Verification Commands

To run skill example verification:

```sh
# Full human-readable CLI report
node scripts/verify-skill-examples.js

# Machine-readable JSON summary for CI pipelines
node scripts/verify-skill-examples.js --json

# Dedicated npm script
npm run test:skills

# Integrated test suite including negative proof
node --test tests/skill-examples.test.js
```
