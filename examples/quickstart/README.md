# Small ContextOS demo

Use this fixture in a new project to see a TypeScript task select a domain skill
and an explicit team rule. No model or paid API is needed.

## Local 3.0.0-rc.1 candidate

The candidate is not published. From the repository root, build and pack the
core into a dedicated directory, then create a temporary project and install
that exact archive. No MCP package is built or installed.

```powershell
npm.cmd run build
New-Item -ItemType Directory -Force scratch/release-candidate-3.0.0-rc.1 | Out-Null
npm.cmd pack --ignore-scripts --pack-destination scratch/release-candidate-3.0.0-rc.1
$package = (Resolve-Path scratch/release-candidate-3.0.0-rc.1/contextos-agents-3.0.0-rc.1.tgz).Path
$demo = Join-Path $env:TEMP ('contextos-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demo | Out-Null
Copy-Item -Recurse examples/quickstart/src $demo
Push-Location $demo
try {
    npm.cmd init -y
    npm.cmd install --save-dev --save-exact --ignore-scripts $package
    git init
    npx.cmd --no-install contextos init
    npx.cmd --no-install contextos skill add typescript
} finally { Pop-Location }
```

On Linux or macOS (bash):

```bash
demo="$(mktemp -d -t contextos-demo-XXXXXX)"
npm run build
mkdir -p scratch/release-candidate-3.0.0-rc.1
npm pack --ignore-scripts --pack-destination scratch/release-candidate-3.0.0-rc.1
package="$PWD/scratch/release-candidate-3.0.0-rc.1/contextos-agents-3.0.0-rc.1.tgz"
cp -r examples/quickstart/src "$demo"
(
  cd "$demo"
  npm init -y
  npm install --save-dev --save-exact --ignore-scripts "$package"
  git init
  npx --no-install contextos init
  npx --no-install contextos skill add typescript
)
```

## Adding a Team Rule and Verifying Drift

Copy `examples/quickstart/team-order` from this repository to
`$demo/.agents/project/skills/team-order` (create the parent directories).
Then, from `$demo`:

```powershell
npx.cmd --no-install contextos compile
npx.cmd --no-install contextos resolve "Implement @team-order TypeScript validation" --files src/order.ts --explain
npx.cmd --no-install contextos export all
npx.cmd --no-install contextos export all --check --json
```

The selection must contain `typescript` and `team-order`. The team rule's generated
native entrypoint is `.agents/skills/team-order/SKILL.md` (discovered natively by Codex
and Gemini). Edit the source under `.agents/project/skills/team-order`, then compile
and export again. Drift checking must exit zero after a fresh export.

The installed-consumer CI gate (`scripts/check-release-install.cjs`) copies this same
fixture and verifies selection, projection, update preservation, drift, and uninstall
preservation against release archives.

Opening a compatible client is a separate step: give it a task referencing
`$team-order`, then inspect its skill-loading evidence and resulting patch.
Selection and export alone do not prove that a model followed the rule.

