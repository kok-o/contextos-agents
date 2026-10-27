# Codex Desktop Sol RC.1 evidence

Date: 27 October 2026. The [compatibility report](../../gemini_COMPATIBILITY.md)
keeps this desktop group separate from the earlier CLI group for
[issue #31](https://github.com/kok-o/contextos-agents/issues/31).

The visible app was ChatGPT in **Codex mode**, About version `26.1021.31345`,
backend `0.164.0-alpha.11.1`, with GPT-6.1 Sol / high reasoning. All 25 inference
trials used fresh chats created and submitted through the visible desktop UI.
The native picker was observed before selecting a skill. Five explicit trials
selected its candidate and produced a native skill chip; their transcripts
independently record the exported body injected by the client.

## Artifacts

| Artifact | Contents |
| --- | --- |
| [trial-table.md](trial-table.md) | One row per completed desktop inference trial |
| [trials.json](trials.json) | Serialized prompts, sanitized verbatim responses, native mention links/body injection, relevant tool output, settings, usage and original-log hashes |
| [discovery.json](discovery.json) | Visible picker metadata before selection; the path was confirmed separately by the native mention/injection |
| [environment.json](environment.json) | Frontend/backend versions, model/reasoning, inherited permissions, human trust handoffs, non-isolated profile and usage |
| [fixtures.json](fixtures.json) | Exact installed package versions/integrity, original drift checks and fixture bytes/hashes |
| [control.json](control.json) | No-rule control inventory, code/docs hashes and ancestor instruction checks |
| [final-checks.json](final-checks.json) | Clean checks from the four actual fixture directories after the study |
| [lifecycle.json](lifecycle.json) | Reference-only source edit, drift/regeneration/check output, old/new native bytes and hashes |
| [skill-inventory.json](skill-inventory.json) | 48 available global skill descriptions/paths from the actual control conversation's catalog; personal memory is omitted |
| [ui-evidence.json](ui-evidence.json) | Screenshot capture times, crop rectangles, original/cropped image hashes and transformation descriptions |
| [ui-text-evidence.json](ui-text-evidence.json) | Native chip/composer observations for explicit trials 2–4, without the personal sidebar |

## Visible UI evidence

- [About version](desktop-version.png).
- [Picker before selection](auto-picker-discovery.png).
- [Selected chip and exact prompt, trial 1](explicit-1-picker-selected.png).
- [First explicit response](explicit-1-response.png).
- [Selected chip and exact prompt, trial 5](explicit-5-picker-selected.png).
- [Selected resource skill and question](resources-explicit-picker-selected.png).
- [New reference confirmation after regeneration](lifecycle-resources-response.png).

Images are rectangular crops of actual Computer Use screenshots. No pixels were
generated or reconstructed. Original screenshots and full application rollouts
remain outside the repository. Cropping removes the personal sidebar; text
artifacts replace the user-profile and fixture-root paths. Prompt/response
wording is otherwise retained. The native picker serializes its chip into a
Markdown link in the accepted user message; those serialized links are preserved
with sanitized paths rather than presented as manually typed text.

## Reproduce this surface

1. Follow the issue's pinned npm setup in four new projects outside other
   repositories, using the [same external fixture script](../2026-10-27-codex-sol-rc1/fixture.cjs).
   Keep expected values and evidence outside the projects. Create a fifth
   source-free control with the identical ordinary code/docs.
2. Open the control in Codex Desktop and record its actual visible version,
   backend, model/reasoning, trust and permissions. Run the exact control prompt
   from `trials.json` before accepting marker evidence.
3. Open the auto project, start a fresh chat and type `$compat` in the composer.
   Record the visible `Compat Auto` candidate, description and project scope
   before selecting it. Click it or use Enter to create the native chip, append
   the issue's exact explicit review sentence, then submit. Do not paste a skill
   body or marker. Repeat in five fresh chats.
4. Use five further fresh chats for each exact automatic positive and arithmetic
   negative prompt. New chats must have no selected skill chip, matching editor
   tab or attached file. This run used the observed File → New chat shortcut
   `Ctrl+N` and verified the project and Sol/high setting before each submission.
5. Run the two resource prompts and all six always/scoped diagnostic prompts in
   their separate fixture contexts. Open folder (`Ctrl+O`) switched contexts;
   the human handled the native trust dialogs. Each prompt started a new chat.
6. After the original 24 trials, change only the resources source reference's
   confirmation externally. Save drift exit 1, export exit 0 and clean check exit
   0. Start a fresh resource chat in the same running desktop app, choose the
   native resource chip, and repeat the unchanged question. Record old versus
   new confirmation. This run did not restart the app.

The UI was operated through Computer Use. Read-only application/rollout tools
collected evidence after submission; they did not create inference trials or
replace desktop prompts with CLI calls. The backend's internal `source: vscode`
label is retained alongside `originator: Codex Desktop`; the visible UI and
originator establish this as a desktop run, not an IDE-extension test.

All original 24 trials and the lifecycle trial completed. No source-body or
confirmation-exposing broad search was observed. Some combined read/search
commands ended with exit 1 because an `rg --files -g AGENTS.md` search had no
matches; their output still contains the completed native skill read. Those
nonzero exits are retained, and body evidence is based on actual output/native
injection rather than assuming every preceding read failed with the last command.

The control retained the personal configuration: 48 global skills and an injected
memory summary were available. The random marker stayed outside automatic
prompts, and the control emitted none. This is not an isolated-profile result or
a reliability guarantee. Enforced always/glob activation remains unsupported by
the tested exporter. IDE-extension behavior remains untested.
