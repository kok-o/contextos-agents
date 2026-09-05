# engineering-workflow Troubleshooting & Common Mistakes

## 1. Premature Code Generation

- **Symptom**: Agent starts spitting out code blocks while the user is still clarifying requirements.
- **Root Cause**: Failure to enforce the IRON RULE of Phase 1 (DEFINE) and Phase 2 (PLAN).
- **Fix**: Halt code output immediately. Announce `[PHASE: Define]` or `[PHASE: Plan]` and provide the structured spec or task breakdown for user sign-off.

## 2. Blast Radius Creep

- **Symptom**: A simple bugfix in one module modifies 8 unrelated configuration and styling files.
- **Root Cause**: Missing isolation boundaries and speculative cleanup.
- **Fix**: Restrict edits strictly to files explicitly declared in the current atomic task's plan.

## 3. Unverified Claims of Completion

- **Symptom**: Agent reports "Task complete! Everything is working" without running tests or builds.
- **Root Cause**: Skipping Phase 4 (VERIFY).
- **Fix**: Always execute tests (`npm test`, validator, compiler) and quote actual terminal exit codes and outputs before declaring completion.
