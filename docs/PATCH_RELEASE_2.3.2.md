# Maintenance release: core 2.3.2 / MCP 0.4.2

Status: verified maintenance candidate; publication is pending.
Previous published pair: core 2.3.1 / MCP 0.4.1. Its
[archive evidence](evidence/release-2.3.1.json) remains unchanged.
This candidate has its own [manifest](evidence/release-2.3.2.json).

## Resulting behavior

Manifestless skills retain their routing descriptions through compilation and
export. Generated Gemini YAML handles quotes, punctuation and multiline values;
complete frontmatter boundaries preserve inline `---`. Zed retains its body
preview when no routing metadata exists. The resolver recognizes destructive
RU/EN requests with intervening words while ordinary import cleanup remains
standard risk. Required safety guidance survives profile exclusions and small
soft budgets.

Core instructions use a proportional lifecycle and canonical aliases. Evidence
reports distinguish completion, partial work and unrun checks. The TypeScript
catalog example validates all required fields; examples are checked from their
original source with distinct behavioral and structural counts.

MCP 0.4.2 accompanies this maintenance pair with updated support documentation
and stronger regression coverage. Its runtime implementation is unchanged from
0.4.1. Runtime execution and recovery remain experimental, and the default MCP
interface remains read-only.

## CI repair

The failed [main run](https://github.com/kok-o/contextos-agents/actions/runs/37218620159)
contains two causes repeated across jobs:

- Seven core/OCI jobs fail the plugin-export regression because Zed omitted the
  existing body preview. Restore that fallback while retaining routing metadata.
- Three MCP jobs stop at Biome because the new integration test is unformatted.
  Formatting fixes this without changing its assertions.

Targeted local core checks pass 47/47 and MCP lint exits successfully. The full
local suites pass 542 core and 635 MCP tests, with zero failures or skips, plus
10 publication-recovery tests.

The [candidate CI run](https://github.com/kok-o/contextos-agents/actions/runs/37221385766)
passes all 19 jobs on `0c634f4`: core Node 22/24 on Windows/Linux/macOS, MCP on
all three platforms, OCI and production-only installed consumers. Each platform
passed upgrade/checkpoint rollback from 2.3.1 / 0.4.1 and legacy 2.2.0 / 0.3.1.
All retained candidate archives match the manifest SHA-256 values. Implementation
source is `051af18`; later evidence-only changes preserve those package bytes.

MCP archive comparison with 0.4.1 finds 223 files in both versions; only README
and package metadata differ. Executable payload bytes match the previous release.

## Acceptance

1. Match package/lockfile versions, build both packages and run core/MCP suites.
2. Run publication-recovery tests, Markdown, validation/drift and release surface.
3. Pack both archives with lifecycle scripts disabled and record their SHA-256.
4. Install those archives outside the checkout with production dependencies only;
   exercise lifecycle, routing, user-rule preservation and read-only MCP handshake.
5. Verify Windows/Linux/macOS CI and upgrade/checkpoint rollback from
   2.3.1 / 0.4.1 and legacy 2.2.0 / 0.3.1.
6. Publish only the verified archives through the existing release workflow;
   download registry archives and compare their hashes before registry acceptance.

Paid model benchmarks remain paused; they are outside this maintenance release.

## Upgrade

After publication:

```sh
npm install --save-dev --save-exact contextos-agents@2.3.2 contextos-mcp@0.4.2
npx --no-install contextos update
npx --no-install contextos compile
npx --no-install contextos export all
npx --no-install contextos export all --check --json
```

See [checkpoint rollback](COMPACT_CONTEXT_MIGRATION.md). Existing pinned versions
do not change automatically. Client routing, model quality, production egress
and power-loss durability retain their separately documented verification scope.
