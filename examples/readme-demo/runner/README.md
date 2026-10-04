# Isolated Codex runner

The image contains Node 22.14.0, Codex CLI 0.149.1, Git, ripgrep, and Python.
It contains no ContextOS installation, model credentials, user configuration,
conversation history, or team skills. The Node base image is pinned by digest.
Record the resulting image ID and installed package versions for each series;
Debian package revisions can change on a future rebuild.

```sh
docker build -t contextos-readme-demo:20261004 examples/readme-demo/runner
docker image inspect contextos-readme-demo:20261004 --format '{{.Id}}'
```

`runtime-config.toml` supplies the same model, **low** reasoning, and tools settings to
each condition of the optional offline probe. The recorded comparison uses
`run-series.cjs` with **medium** reasoning and its own pinned CLI overrides;
its exact-config capture is saved separately. Both disable memories, apps,
plugins, subagents, browser use, and web search. The container is the external sandbox; do not use its
`danger-full-access` configuration for an unrestricted host process.

## No-inference loader preflight

Mount one prepared condition at `/fixture` read-only, the common task at
`/task.txt` read-only, and an empty result directory at `/out`. Start a new
container for each condition. For example, with absolute paths in the shell:

```sh
docker run --rm --network none --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 128 --memory 2g --cpus 2 \
  --mount type=bind,source="$FIXTURE",target=/fixture,readonly \
  --mount type=bind,source="$TASK",target=/task.txt,readonly \
  --mount type=bind,source="$OUTPUT",target=/out \
  contextos-readme-demo:20261004
```

The probe copies the fixture without `.git` or `node_modules`, initializes a
fresh repository, and uses a fresh home and Codex home. It records:

- CLI help, enabled features, and installed versions;
- `codex debug prompt-input` output;
- the actual first Responses request, sent only to a local HTTP capture server;
- exact commands, exit codes, request hash, and diagnostic timestamps.

The local server deliberately returns HTTP 418 with
`LOCAL_DISCOVERY_PROBE_NO_MODEL_INFERENCE`. The captured Codex invocation exits
with code 1. This is an expected probe stop, not a failed model attempt or a
generated agent response. Request headers are not saved. No credential is
provided, and `--network none` prevents external model traffic.

After placing outputs in `A/`, `B/`, and `C/` below one directory:

```sh
node examples/readme-demo/runner/summarize-probe.mjs "$PROBE_OUTPUT_ROOT"
```

The summary compares actual tool definitions and built-in instructions by hash,
lists the initial native skill catalog, and checks whether the team rule body
was present initially. Codex's bundled system skills remain identical in all
conditions. Baseline isolation means no additional ContextOS/team guidance,
not the removal of Codex's ordinary built-in instructions.

This verifies native instruction discovery and request construction only.
Native catalog discovery is not proof that the model opened a skill, and neither
is proof that its code followed the rule. Preserve later read events, tool
outputs, diffs, and independent verification separately.

Codex 0.149.1 accepts `--strict-config` for `exec` but rejects it for `debug` and
`features`. The probe therefore uses strict validation on the actual captured
`exec` invocation. `--ignore-rules` disables execpolicy rules; it does not disable
AGENTS.md or native skill discovery. `--ephemeral` only disables rollout files
and should not be confused with instruction isolation.
