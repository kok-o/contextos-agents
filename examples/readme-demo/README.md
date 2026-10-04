# ContextOS: one rule, three ways to deliver it

This local demo compares one order-normalization task in nine fresh Codex sessions:
no additional team rules (A), manual rules (B), and native skills exported by
ContextOS (C). It uses the **published npm package 2.3.1**, not this checkout's
uncommitted changes. The video is a labelled replay of saved events.

- [Recorded results and limitations](REPORT.md)
- [Frozen protocol](PROTOCOL.md)
- [Starting project](fixture/), [team rule](team-order/SKILL.md), [identical task](task.txt)
- [Independent evaluator](evaluator/README.md)
- [Full video](../../assets/contextos-demo.mp4), [28-second GIF](../../assets/contextos-demo.gif), [English subtitles](../../assets/contextos-demo.srt)

## Repeat the installation and drift demo without model costs

Prerequisites: Node.js 22.14+, npm, Git, and Python 3. Run from the repository root:

```sh
python examples/readme-demo/prepare.py --out /absolute/path/to/fresh/demo
python examples/readme-demo/drift.py --project /absolute/path/to/fresh/demo/C --out /absolute/path/to/fresh/drift
```

On Windows, use an absolute Windows path. The scripts select `npm.cmd` and
`npx.cmd` automatically. The output directories must not already exist; earlier
evidence is never overwritten. Preparation makes separate A/B/C repositories,
downloads the pinned public package, copies the rule, verifies document parity,
and records each actual command, exit code, output, time and source hash.

The core commands executed in C are:

```sh
npm install --save-dev --save-exact --ignore-scripts contextos-agents@2.3.1
npx --no-install contextos init --minimal --skip-compile
npx --no-install contextos skill add typescript
# Copy team-order/ into .agents/project/skills/team-order/.
npx --no-install contextos compile
npx --no-install contextos resolve "Implement @team-order TypeScript normalization" --files src/order.ts --explain
npx --no-install contextos export all
npx --no-install contextos export all --check --json
```

**Why `--skip-compile`?** In published 2.3.1, the automatic bootstrap export
executes a copied CommonJS `.agents/ctx.js` under this project's `type: module`
scope and fails. This supported flag, followed by the installed CLI's explicit
compile/export commands, is the verified workaround. The failed preflight is
retained in the evidence. Do not substitute `node .agents/ctx.js` in this ESM fixture.

The resolver command explicitly selects the team skill. Export projects the
installed profile; it is not filtered by that preceding resolver query. Native
client discovery and skill-body reading are separate from both operations.

## Repeat the native agent comparison

Docker is required to keep host skills, memories, other sessions, and hidden
evaluation files out of model workspaces. Build the pinned client image:

```sh
docker build -t contextos-readme-demo:20261004 examples/readme-demo/runner
```

First capture real native requests locally without calling a model:

```sh
node examples/readme-demo/runner/run-series.cjs --prepared /absolute/path/to/fresh/demo --out /absolute/path/to/fresh/capture
```

These three diagnostic requests intentionally receive a local HTTP 400 and
exit 1. They are not unsuccessful model attempts: no request is forwarded and
no inference is billed. Inspect their `request-1.json` files to confirm A has no
team instructions, B has the body, and C initially has skill metadata.
The additional [offline loader probe](runner/README.md) needs no network at all.

Only after authorizing a new monetary budget, expose your existing API key to
the **host process** through `OPENAI_API_KEY`, then run:

```sh
node examples/readme-demo/runner/run-series.cjs --prepared /absolute/path/to/fresh/demo --out /absolute/path/to/fresh/series --run-authorized --limit-usd 5
python examples/readme-demo/evaluate-series.py --series /absolute/path/to/fresh/series --out /absolute/path/to/fresh/evaluations
python examples/readme-demo/analyze.py --series /absolute/path/to/fresh/series --evaluations /absolute/path/to/fresh/evaluations --out /absolute/path/to/fresh/results.json
```

The key stays outside the Docker containers and output files. The runner pins
`gpt-6.1-sol / medium`, limits each attempt to 180 seconds and 12 requests,
limits output to 4096 tokens per request, and enforces conservative reservations
against the approved total. This run's authorization does not authorize anyone
else's future API spending. No paid retry is automatic.

Evaluate copied results in separate offline containers after agents finish.
The hidden evaluator is never mounted in an agent container. Useful new tests
must pass against final code and fail by assertion against the original code.

## Regenerate the media

The source scenes contain only excerpts and values from saved evidence. With
Python/Pillow and ffmpeg installed:

```sh
python examples/readme-demo/media-tools/render_demo.py examples/readme-demo/scenes.json --out-dir /absolute/path/to/fresh/render
```

Russian narration uses the installed Windows `Microsoft Irina Desktop` voice;
the reusable narration script and text are retained with the media sources.
The MP4/GIF are reconstructed visuals, not a continuous terminal recording.
Original events and commands remain available for auditing the montage.
