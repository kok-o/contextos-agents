# Compiler and engineering boundaries

1. Inspect source manifests, declared entrypoints, overrides, and resources.
2. Run compile to build the deterministic registry.
3. Resolve the task with affected files and inspect risk, reasons, and warnings.
4. Load selected entrypoints and relevant references on demand.
5. For distribution, export the installed, profile-allowed sources and check drift;
   this branch does not consume the task resolver's selection.
6. Run structural, example, and behavioral checks at their actual scope.

For implementation use engineering-workflow's proportional lifecycle. Do not
create a full suite of product documents or skip security review merely because
a generic profile illustration says to do so. Profiles are runtime configuration
from the supported profile commands and manifests, not rules interpreted from
this skill's reference YAML files.
