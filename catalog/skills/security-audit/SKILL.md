---
name: security-audit
description: Security guidance and vulnerability review for codebases, APIs, and services. Orchestrates adversarial hunting and independent verification with sandbox write isolation and evidence ledgers.
---

# Security Audit

Find vulnerabilities that violate a real trust boundary, then give owners source evidence, safe reproduction, priority, and the smallest effective fix. This is a defensive, source-first workflow inspired by Cloudflare's security audit architecture.

## Operating Modes

This skill operates in two distinct modes:

- **Guidance Mode**: For security questions, focused reviews, threat modeling, or triage of specific components, use only the relevant parts of this skill. Do not automatically create audit directories or write audit artifacts.
- **Full Audit Mode**: Use the complete workflow when explicitly requested to audit, pen-test, or perform an end-to-end security review of a repository. Run all phases and generate structured artifacts.

## Adversarial Multi-Agent Audit Protocol

A core invariant of rigorous security auditing is adversarial verification:

1. **Separation of Hunter and Verifier**:
   - The agent that discovers a candidate vulnerability (**Hunter**) must never be the same agent that validates it.
   - The verifying agent (**Verifier**) starts with a fresh context and explicitly attempts to disprove each finding.
2. **Evidence-Based Standard**:
   - A candidate vulnerability is confirmed only if it has a complete source trace from untrusted input to a sensitive sink, along with a bounded, observable defect.
   - If an issue cannot be definitively reproduced or disproven locally, mark it as `needs_validation` rather than creating speculative findings.

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY AUDIT PIPELINE                  │
│                                                             │
│  Phase 1: Reconnaissance (Map trust boundaries & inputs)    │
│                     ↓                                       │
│  Phase 2: Coverage Hunting (Hunter agents search surfaces)  │
│                     ↓                                       │
│  Phase 3: Candidate Validation (Verifier agents disprove)   │
│                     ↓                                       │
│  Phase 4: Structured Output (findings.json & ledger)        │
│                     ↓                                       │
│  Phase 5: Record Verification (Final attestation review)    │
│                     ↓                                       │
│  Phase 6: Target-Neutral Reporting (REPORT.md)              │
└─────────────────────────────────────────────────────────────┘
```

## Universal Execution Safety & Sandbox Write Isolation

Target repositories must be audited without risking supply-chain compromise or data exfiltration:

- **Read-Only Target Code**: Source inspection is read-only. Target code must never be executed with write access to its own repository.
- **Dedicated Scratch Root**: All target-controlled builds, tests, or reproduction scripts execute inside an isolated sandbox writing strictly to `scratch/`.
- **Zero External Network**: Sandboxed processes must have no outbound internet access. Use isolated loopback namespaces if local client/server communication is needed.
- **Sanitized Environment**: Clear credentials, SSH keys, cloud tokens, and parent process environments before spawning reproduction commands.
- **Promotion to Artifacts**: Only trusted parent-side code may inspect and promote non-secret results from `scratch/` to retained `artifacts/`.

## Audit Artifacts & Findings Schema

Full audits produce machine-readable and human-readable artifacts:

### findings.json
```json
{
  "audit_version": "1.0.0",
  "target_repository": "example-repo",
  "commit_hash": "a1b2c3d",
  "findings": [
    {
      "id": "SEC-001",
      "title": "Path Traversal in File Download Handler",
      "severity": "HIGH",
      "cwe": "CWE-22",
      "source_trace": {
        "source_file": "src/controllers/download.ts",
        "source_line": 42,
        "entry_point": "req.query.filename",
        "sink_file": "src/services/storage.ts",
        "sink_line": 88,
        "sink_function": "fs.promises.readFile"
      },
      "verification_status": "CONFIRMED",
      "verifier_notes": "Reproduction script proved escape from base directory using %2e%2e%2f traversal.",
      "remediation": "Apply path.normalize and verify path.resolve starts with the designated root directory."
    }
  ]
}
```

### Required Reports
- `REPORT.md`: Executive summary, risk score, vulnerability distribution, and remediation priorities.
- `FINDINGS-DETAIL.md`: Detailed technical breakdown of each confirmed finding with step-by-step reproduction and surgical diff recommendations.
- `NEEDS-VALIDATION.md`: Potential leads that could not be conclusively verified without live cloud infrastructure or out-of-scope permissions.
