---
name: terraform
description: Production-grade Terraform and OpenTofu IaC guidance. Enforces diagnose-first failure mode analysis, Safe Destroy Protocol, state management, and modular architecture.
---

# Terraform and OpenTofu

Diagnose-first guidance for Terraform and OpenTofu infrastructure as code, inspired by Anton Babenko's engineering standards.

## Response Contract

Every Terraform or OpenTofu modification must declare:
1. **Assumptions & Version Floor**: Runtime (`terraform` or `tofu`), exact version, providers, backend type, and environment criticality.
2. **Risk Category Addressed**: Identify whether the change impacts identity churn, secret exposure, blast radius, destroy cascades, or CI drift.
3. **Chosen Remediation & Trade-offs**: Why this approach was selected over alternatives.
4. **Validation Plan**: Exact commands (`terraform fmt -check`, `validate`, `plan -out=tfplan`) tailored to the change.
5. **Rollback Notes**: Clear procedure for reverting any state or resource mutation.

## Safe Destroy Protocol

Never run `terraform destroy` or remove state without strict guards:
- **Mandatory Plan-Destroy**: Never execute a destroy operation without first running `terraform plan -destroy` and displaying every single resource marked for deletion.
- **Check Implicit Dependents**: Review `locals` and `for_each` consumers referencing targeted resources to ensure no unexpected cascading deletions occur.
- **Zero Auto-Approve on Destroy**: The `-auto-approve` flag is strictly forbidden on destroy operations.

## Diagnose Before Generating

| Failure Category | Symptoms | Prevention Strategy |
|------------------|----------|---------------------|
| **Identity Churn** | Resource addresses shift after refactoring, recreation of stateful resources | Use `for_each` instead of numeric `count`; apply `moved` blocks for refactored addresses |
| **Secret Exposure** | Sensitive tokens in variables, plan outputs, or unencrypted state | Mark outputs/variables with `sensitive = true`; use KMS-encrypted remote backends |
| **Blast Radius** | Oversized monolithic state files, shared dev/prod configurations | Isolate state per environment and bounded context; keep modules focused |
| **Destroy Cascade** | Targeted destruction deletes dependent databases or networks | Run `plan -destroy` first; inspect dependency DAG |
| **CI Drift** | Local plan differs from CI runner; unpinned providers | Pin exact provider and module versions; run plans strictly against reviewed commit SHA |

## Module Hierarchy & Directory Layout

Structure infrastructure into three distinct layers:
1. **Resource Module**: Single logical grouping of closely connected resources (e.g. VPC + subnets, or S3 bucket + bucket policy).
2. **Infrastructure Module**: Collection of resource modules fulfilling a sub-system (e.g. multi-region compute cluster with monitoring).
3. **Composition**: Environment-level assembly tying modules together for a specific environment (`dev`, `staging`, `prod`).

```
environments/
  prod/
    main.tf           # Calls reusable modules
    variables.tf
    outputs.tf
    versions.tf       # Exact provider pins & backend configuration
modules/
  networking/
    main.tf
    variables.tf
    outputs.tf
```
