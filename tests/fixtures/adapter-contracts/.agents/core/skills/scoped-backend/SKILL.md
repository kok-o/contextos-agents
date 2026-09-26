---
name: scoped-backend
description: Backend service architecture and API endpoints
---

# Scoped Backend Skill

<!-- BACKEND_SCOPED_RULE_MARKER -->

Rules for backend API services:
- Route handlers only validate requests and dispatch to service layer.
- Never write business logic inside route controllers.
- Use parameterized queries; prevent SQL injection.
- Validate all inputs using strict schemas.
