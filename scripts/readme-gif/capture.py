"""Capture the local CLI workflow in a fresh temporary project, without a model/API.

Run from any directory: python scripts/readme-gif/capture.py
CLI operations target only the temporary project. Existing evidence is never
overwritten; the requested evidence directory is the only checkout output.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
BEFORE = """---
name: team-auth
description: Team rules for authentication code.
---
# Team security

- Never log authorization headers.
"""
AFTER = BEFORE + "- Never log session tokens.\n"
OUTPUTS = {
    "Cursor": ".cursor/rules/team-auth.mdc",
    "Claude": ".agents/generated/claude/skills/team-auth/SKILL.md",
    "Codex": ".agents/skills/team-auth/SKILL.md",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=HERE / "evidence")
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        raise SystemExit("Choose a fresh --out directory; evidence is immutable.")
    out.mkdir(parents=True)
    project = Path(tempfile.mkdtemp(prefix="contextos-readme-gif-"))
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required.")
    cli = REPO / "bin/index.js"
    commands = []

    def run(label: str, cli_args: list[str], expected: int = 0):
        argv = [node, str(cli), *cli_args]
        start = time.monotonic()
        result = subprocess.run(argv, cwd=project, capture_output=True, text=True,
                                encoding="utf-8", errors="strict", timeout=120,
                                env={**os.environ, "NO_COLOR": "1"})
        # Preserve literal output, replacing only machine-specific absolute paths.
        def portable(value: str):
            return value.replace(str(REPO), "<repository>").replace(str(project), "<temporary-project>")
        commands.append({
            "id": label,
            "argv": ["node", "<repository>/bin/index.js", *cli_args],
            "displayCommand": "contextos " + " ".join(cli_args),
            "cwd": "<temporary-project>",
            "exitCode": result.returncode,
            "durationMs": round((time.monotonic() - start) * 1000),
            "stdout": portable(result.stdout), "stderr": portable(result.stderr),
        })
        (out / "commands.json").write_text(json.dumps(commands, indent=2) + "\n", encoding="utf-8")
        print(f"{label}: exit {result.returncode}", flush=True)
        if result.returncode != expected:
            raise RuntimeError(f"{label}: expected {expected}\n{result.stdout}\n{result.stderr}")
        return result

    run("init", ["init", "--minimal", "--skip-compile"])
    source = project / ".agents/project/skills/team-auth/SKILL.md"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text(BEFORE, encoding="utf-8")
    (out / "source-before.md").write_text(BEFORE, encoding="utf-8")
    run("compile-before", ["compile"])
    run("export-before", ["export", "all"])
    before_check = json.loads(run("check-before", ["export", "all", "--check", "--json"]).stdout)
    assert before_check["status"] == "pass" and before_check["totalFindings"] == 0
    before_bytes = {name: (project / path).read_bytes() for name, path in OUTPUTS.items()}
    for data in before_bytes.values():
        assert b"Never log authorization headers." in data
        assert b"Never log session tokens." not in data

    source.write_text(AFTER, encoding="utf-8")
    (out / "source-after.md").write_text(AFTER, encoding="utf-8")
    run("compile-after", ["compile"])
    stale = json.loads(run("check-stale", ["export", "all", "--check", "--json"], 1).stdout)
    assert stale["status"] == "drift" and stale["hasDrift"] is True
    stale_paths = {finding.get("path") for finding in stale["findings"]["STALE_INPUT"]}
    assert set(OUTPUTS.values()).issubset(stale_paths)
    # Check mode must leave the older outputs untouched.
    for name, path in OUTPUTS.items():
        assert (project / path).read_bytes() == before_bytes[name]

    run("export-after", ["export", "all"])
    fresh = json.loads(run("check-fresh", ["export", "all", "--check", "--json"]).stdout)
    assert fresh["status"] == "pass" and fresh["hasDrift"] is False and fresh["totalFindings"] == 0
    artifacts = []
    for name, path in OUTPUTS.items():
        data = (project / path).read_bytes()
        assert b"Never log authorization headers." in data
        assert b"Never log session tokens." in data
        sample = out / "exports" / name.lower()
        sample.mkdir(parents=True)
        (sample / Path(path).name).write_bytes(data)
        artifacts.append({"agent": name, "path": path, "beforeSha256": sha(before_bytes[name]), "afterSha256": sha(data)})

    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    summary = {
        "recordedUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "candidate": "Local source checkout; not a published-package or client-loader test",
        "repositoryRevision": revision,
        "packageVersion": json.loads((REPO / "package.json").read_text())["version"],
        "nodeVersion": subprocess.run([node, "--version"], capture_output=True, text=True, check=True).stdout.strip(),
        "cliSha256": sha(cli.read_bytes()),
        "compilerEntrySha256": sha((REPO / ".agents/ctx.js").read_bytes()),
        "sourceBeforeSha256": sha(BEFORE.encode()), "sourceAfterSha256": sha(AFTER.encode()),
        "baseline": {"status": before_check["status"], "totalFindings": before_check["totalFindings"]},
        "stale": {"status": stale["status"], "totalFindings": stale["totalFindings"], "exitCode": 1},
        "fresh": {"status": fresh["status"], "totalFindings": fresh["totalFindings"], "exitCode": 0},
        "projectedCount": fresh["projectedCount"], "artifacts": artifacts,
        "scope": "Export consistency only. No client opened, model run, API call, or application-code claim.",
        "presentation": "Reconstructed demo. CLI executable is displayed as contextos; JSON output is excerpted. Animation timing is editorial.",
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Verified evidence: {out}\nTemporary project retained: {project}")


if __name__ == "__main__":
    main()
