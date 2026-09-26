# Security Audit - Troubleshooting & Common Edge Cases

## Common Diagnostic Scenarios

### 1. Hunter Agent Generates Speculative or Untraceable Findings

- **Symptom**: Candidate vulnerability report contains vague descriptions like "Potential SQL injection in database layer" without line numbers, parameters, or affected sinks.
- **Root Cause**: The Hunter agent skipped Step 1 (Reconnaissance) and performed heuristic keyword matching instead of taint tracking.
- **Fix Protocol**:
  1. Reject candidate immediately: mark status as `INVALID_SPECULATION`.
  2. Mandate the 3-point trace requirement:
     - Entry Point (HTTP param, header, body field, CLI flag).
     - Intermediate Propagation (functions, transforms, assignments).
     - Sensitive Sink (database query, filesystem access, shell execution, reflection).
  3. If any of the three points is missing, the candidate cannot be submitted to the Verifier.

---

### 2. Sandbox File Promotion Failure (`scratch/` to `artifacts/`)

- **Symptom**: Parent process fails to copy verified findings or test outputs from `scratch/` to `artifacts/`, throwing an access violation or promotion blocker.
- **Root Cause**: Target-controlled code created symlinks, hardlinks, or unescaped nested paths attempting to escape the assigned scratch root.
- **Fix Protocol**:
  1. Never perform recursive copy or glob promotion across boundaries.
  2. Walk paths with `no-follow` directory descriptors.
  3. Verify that the leaf is a regular file with link count exactly 1 and size within the byte allowance.
  4. Discard any entry violating promotion bounds and log `PROMOTION_SECURITY_REJECT`.

---

### 3. Loopback Port Collisions During Local Reproduction

- **Symptom**: Standalone verification script fails with `EADDRINUSE: address already in use 127.0.0.1:3000`.
- **Root Cause**: Fixed port numbers in reproduction tests collide with existing developer processes.
- **Fix Protocol**:
  - Always bind reproduction servers to port `0` (`server.listen(0)`), allowing the OS to allocate an ephemeral free port.
  - Read `server.address().port` dynamically in test fixtures.

---

### 4. False Positives Due to Upstream Middleware Sanitization

- **Symptom**: Hunter flags `req.query.path` passed to `res.sendFile`, but global Express middleware already calls `path.normalize` and rejects relative traversals.
- **Root Cause**: Single-file inspection without analyzing the global middleware chain.
- **Fix Protocol**:
  - The Verifier agent must inspect the application entrypoint (`app.ts`, `server.ts`, router configuration) to verify active global filters before concluding the audit verdict.
