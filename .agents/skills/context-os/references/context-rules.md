# Context selection and budgeting

## Inspect actual evidence

Supply a concrete task and affected paths to resolve. Inspect selected skills,
reasons, risk, excluded candidates, and warnings. Select source files, callers,
tests, relevant contracts, and active decisions manually as the task requires.
Do not require a PRD, API document, database document, or module graph to exist.
An absent schema change does not make database semantics irrelevant.

## Budget contract

The resolver estimates skill entrypoint length divided by 3.8, rounded up. It
uses the requested positive --budget value or its current risk-tier default.
References, tool output, system instructions, documents, and chat history are
outside that estimate. Required safety guidance can exceed a soft budget and
must produce an explicit overflow warning. No fixed 8000-token total or measured
model token saving is promised.

Trim irrelevant documents and select relevant sections first. Preserve user
constraints and safety guidance. Inspect code dependencies and callers rather
than limiting all investigations to exactly one import hop.

## Aliases and unavailable skills

context-manager resolves to context-os; gstack-roles resolves to
engineering-workflow. The resolver avoids duplicate bodies and reports alias
warnings. Installation and export still retain compatibility identifiers.
Catalog skills are installed on demand; inspect unavailable-skill warnings.

## Verification boundaries

compile validates manifests and builds the registry. validate checks source
structure and sync. export --check inspects generated drift. Example tests run
specific scenarios. None of these by itself proves live client instruction
loading or improved model decisions.
