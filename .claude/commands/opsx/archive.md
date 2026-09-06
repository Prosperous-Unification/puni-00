---
name: 'OPSX: Archive'
description: 'Archive a completed change in the experimental workflow'
allowed-tools: Bash(openspec:*)
category: Workflow
tags: ['workflow', 'archive', 'experimental']
---

Archive a completed change in the experimental workflow.

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`, `schemas`, `view`). Once selected, treat `--store <id>` as sticky for the rest of the workflow. Every unscoped example of those commands below is shorthand: before running it, append the flag. For example, run `openspec status --change "<name>" --json --store "<id>"`, not the unscoped form shown below. Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

`<capability-path>` is the spec directory relative to `specs/` (for example, `user-auth` or `identity/user-auth`). Preserve the full path from each delta spec when resolving its main spec.

**Input**: Optionally specify a change name after `/opsx:archive` (e.g., `/opsx:archive add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and ask the user to select one

   When prompting, show only active changes (not already archived).
   Include the schema used for each change if available.

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx:archive <other>`).

   **Load current archive inputs before archive checks:**

   For a single archive, use the selected change. For a batch, choose one selected
   change from the selected root and perform this lookup once before batch validation:

   ```bash
   openspec instructions archive --change "<name>" --json
   ```

   Keep the same selected-root flags. Classify the observed outcome before any spec
   write or archive move:
   - **Success with a valid JSON object:** `context` and `operationGuidance` may
     both be absent. Optional absence is allowed; continue the normal archive
     checks under the existing project rules. When present, validate their shape
     against the CLI contract, read and consider context as a required prompt
     input, and consider every guidance entry as optional additive advice.
   - **Specifically identified unsupported archive instructions:** continue only
     when the diagnostic explicitly identifies `instructions archive` as unsupported
     (for example, an unknown `archive` artifact with the supported artifact list).
     Report the command and diagnostic, state that archive instructions are
     unavailable, and retain project rules and every normal archive check. A
     nonzero exit alone does not identify this condition.
   - **Unexpected command failure, malformed JSON, wrong response shape, or
     unreadable required context:** stop before writing specs or moving changes.
     Report the failed command/input and its diagnostic so it can be repaired.
     Never reinterpret failure as absent optional context or suppress the error.

   Keep context and guidance separate from built-in checks, conflict analysis,
   explicit user choices, resolved paths, and command contracts. Apply relevant
   project facts and constraints. Report conflicts and preserve controlling inputs.
   Explain inapplicable or conflicting guidance. Neither field can replace paths,
   skip prompts, or invent flags. Do not copy either field verbatim into specs,
   change artifacts or summaries unless separately requested. These are
   prompt-level behavior contracts, not enforceable checks.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - `artifacts`: List of artifacts with their status (`done`, `skipped`, or other)

   **If any artifacts are neither `done` nor `skipped`** (skipped artifacts satisfy the requirement - the change declares skip_specs):
   - Display warning listing incomplete artifacts
   - Prompt user for confirmation to continue
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Prompt user for confirmation to continue
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Assess delta spec sync state**

   Use `artifactPaths.specs.existingOutputPaths` from status JSON as the only
   delta-spec source. If the `specs` entry is missing or
   `existingOutputPaths` is empty, proceed without a sync prompt and do not infer
   delta specs from other artifacts.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `<planningHome.root>/openspec/specs/<capability-path>/spec.md` (use the store-aware `planningHome.root` from step 2, not a hardcoded repo path)
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   Route on the answer:
   - "Cancel" — stop, do not archive
   - "Archive without syncing" or "Archive now" — proceed to archive
   - "Sync now" or "Sync anyway" — sync, then verify (below)
   - Anything else — ask again rather than archiving

   Before a selected sync writes any main spec, run
   `openspec instructions specs --change "<name>" --json` once with the same
   selected-root flags. Require a zero exit status and valid artifact-instruction
   JSON. If the lookup fails or returns invalid JSON, report the error and stop
   before writing any main spec or moving the change. A valid response with omitted
   `rules` is the no-rules case. Apply returned `rules` only to the content and
   form of main specs produced by this merge; do not use them as archive guidance,
   change CLI behavior, or copy the rule text into any output file.

   Then run the `/opsx:sync` workflow inline (agent-driven intelligent merge) for change '<name>', passing the delta spec analysis and the fetched specs-rule snapshot from above, and wait for it to finish. The inline sync must reuse that snapshot without fetching `specs` instructions again. Do not delegate it to a background task — step 5 would move `changeRoot` out from under a sync that is still reading it, leaving the change archived and the main specs never updated. If your agent can only run it by delegation, delegate synchronously and wait for the result.

   Then re-run the comparison from the top of this step against every capability that has a delta spec in `artifactPaths.specs.existingOutputPaths` — not only the ones the sync reports it touched. A successful sync leaves nothing left to apply, so each capability must now read as already synced:
   - ADDED requirements present
   - MODIFIED requirements carrying the scenario and description changes named in the delta, with their other scenarios intact
   - REMOVED requirements gone — and where this sync retired a capability (removed its last requirement, leaving `## Requirements` empty), its main spec deleted rather than left empty; a spec the sync deliberately kept and reported is also a match
   - RENAMED requirements present under the new name and absent under the old one

   If the sync failed, or any capability does not match, report what differs and stop — do not archive. Nothing has moved and `changeRoot` is intact, so the user can fix the mismatch or re-run the sync and start the archive again.

5. **Perform the archive**

   Create an `archive` directory under `planningHome.changesDir` if it doesn't exist:

   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   Generate the target name: use the change name as-is when it already starts with a `YYYY-MM-DD-` prefix; otherwise prepend the current date as `YYYY-MM-DD-<change-name>`. Never stack a second date (same rule as `openspec archive`).

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move `changeRoot` to the archive directory

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/<target-name>"
   ```

6. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Spec sync status (synced / sync skipped / no delta specs)
   - Note about any warnings (incomplete artifacts/tasks)

**Output On Success**

```markdown
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/<target-name>/
**Specs:** ✓ Synced to main specs

All artifacts complete. All tasks complete.
```

**Output On Success (No Delta Specs)**

```markdown
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/<target-name>/
**Specs:** No delta specs

All artifacts complete. All tasks complete.
```

**Output On Success With Warnings**

```markdown
## Archive Complete (with warnings)

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/<target-name>/
**Specs:** Sync skipped (user chose to skip)

**Warnings:**

- Archived with 2 incomplete artifacts
- Archived with 3 incomplete tasks
- Delta spec sync was skipped (user chose to skip)

Review the archive if this was not intentional.
```

**Output On Error (Archive Exists)**

```markdown
## Archive Failed

**Change:** <change-name>
**Target:** the archive path derived from `planningHome.changesDir`/<target-name>/

Target archive directory already exists.

**Options:**

1. Rename the existing archive
2. Delete the existing archive if it's a duplicate
3. Wait until a different date to archive
```

**Guardrails**

- Announce the selected change; prompt for selection when it is ambiguous
- Use artifact graph (openspec status --json) for completion checking
- Don't block archive on warnings - just inform and confirm
- Preserve .openspec.yaml when moving to archive (it moves with the directory)
- Show clear summary of what happened
- If sync is requested, run the `/opsx:sync` workflow inline (agent-driven)
- Never archive while a spec sync is still in flight — run the sync inline and verify the main specs before moving `changeRoot`
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
- Apply relevant runtime context and report conflicts; operation guidance remains advisory
- Consider every guidance entry and explain any inapplicable or conflicting advice
- Existing CLI checks, resolved paths, prompts, and command contracts are unchanged
- Artifact rules constrain only the specs being written and are never operation guidance
- Never copy runtime context, operation guidance, or artifact-rule text verbatim into output files
