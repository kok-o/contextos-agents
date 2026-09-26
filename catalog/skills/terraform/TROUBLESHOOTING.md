# Terraform - Troubleshooting & Common Edge Cases

## Common Diagnostic Scenarios

### 1. Stuck Remote State Lock (`Error acquiring the state lock`)

- **Symptom**: Terraform commands abort with `Error message: ConditionalCheckFailedException: The conditional request failed` or `Lock Info: ID: <lock-id>`.
- **Root Cause**: A previous CI runner or local process crashed, timed out, or was killed before releasing the DynamoDB or backend lock.
- **Fix Protocol**:
  1. Inspect the Lock Info: verify the lock owner and creation timestamp.
  2. Confirm that no active pipeline or engineer is running an apply on this workspace.
  3. Force-unlock using the exact Lock ID:
     ```bash
     terraform force-unlock <lock-id>
     ```
  4. Never disable locks by setting `-lock=false`.

---

### 2. Cascading Destruction of Dependent Resources via `for_each` / `locals`

- **Symptom**: Destroying a single resource triggers planned deletion of dozens of downstream resources.
- **Root Cause**: Downstream resources reference the targeted resource in a `for_each` map or local projection. Removing the upstream resource causes keys in `for_each` to disappear, queueing destruction of all instances.
- **Fix Protocol**:
  1. Always run `terraform plan -destroy -target=<resource>` first.
  2. Inspect the resource changes list for unexpected deletions.
  3. Decouple downstream configurations or provide static placeholder values in `locals` before attempting targeted deletion.

---

### 3. Identity Churn on Refactoring Module Paths

- **Symptom**: After restructuring modules, `terraform plan` reports: `Plan: 5 to add, 0 to change, 5 to destroy` for existing stateful resources.
- **Root Cause**: Changing module names or nesting paths changes the resource addresses in the Terraform state file.
- **Fix Protocol**:
  - Use `moved` blocks to cleanly inform Terraform of the address change:
    ```hcl
    moved {
      from = module.old_network.aws_vpc.main
      to   = module.vpc.aws_vpc.this
    }
    ```
  - Re-run `terraform plan`. It should now report `Plan: 0 to add, 0 to change, 0 to destroy` with a clear notice of moved resource addresses.

---

### 4. Cyclic Dependency Errors (`Cycle: module.a, module.b`)

- **Symptom**: Terraform graph computation aborts with a cyclic dependency error.
- **Root Cause**: Module A references outputs from Module B, while Module B references outputs from Module A.
- **Fix Protocol**:
  1. Break bidirectional coupling by extracting the shared configuration or data resource into a dedicated upstream module (e.g. `module.shared_networking`).
  2. Pass IDs downward; never allow lower-tier modules to depend on upper-tier compositions.
