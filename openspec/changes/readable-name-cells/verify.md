# Verification Report

**Change**: `readable-name-cells`
**Verified at**: 2026-10-11
**Verifier**: UI subagent

## Structural validation

- `bunx @fission-ai/openspec@1.12.0 validate readable-name-cells --json`: 1 item, 1 passed,
  0 failed, with this report present.
- `bunx prettier --check` on the eight touched source, test, and Markdown files: all matched
  Prettier style before this report was added.
- `git diff --check`: exit 0 before this report was added.

## Task completion

Tasks 1.1, 1.2, 2.1, and 2.2 remain unchecked. The text and CSS changes are present, and the
existing status browser assertion was updated, but browser geometry and behavior have not been
observed. The focused browser tests and full gate were not run in this turn under the instruction
not to add or run tests unless requested. These gaps block archive and a verified visual claim.

## Delta spec sync

| Capability   | Status     | Note                                                                                                        |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `wbs-domain` | Needs sync | The main spec reflects the DONE-status wording; the new marker-clearance requirement remains in this delta. |

## Failure proofs

No safety check was added or changed. No fault-injection proof was run. The marker-clearance
and number-only strike behavior remain unverified in a browser.

## Gate output

`bunx nx format:check --all`, `bunx nx run-many -t test lint typecheck build`, and
`bin/h2puni-gate.sh <sha>` were not run. No CI result is available for this worktree yet.

## Implementation signal

The UI branch is `fix/name-cell-reading`. Record CI results and browser evidence before
treating this change as verified or archiving it. The PR records the commit SHA.

## Decision

**Unverified.** Code review found the scoped padding and number-only strike coherent; this is
not a browser visual proof. Commit and PR may proceed for review, with verification pending.

## Historical DONE-row synchronization

The DONE-row wording was synchronized into the canonical WBS specification by
[13e3c45c5421c538cf20bdbd8b2583ba50a6e01a](https://github.com/Prosperous-Unification/puni-00/commit/13e3c45c5421c538cf20bdbd8b2583ba50a6e01a).
The original overlay lives in blob `288be85df48e8c9eef9122462be67b4007045c25`. Its requirement
and all three complete scenario bodies match the canonical fragment at that commit
(blob `6b991c3ff59991ef90833192a59fde9741926c5b`) and at local
`e8c01f99401d2a5e15ee4c9e7380efb6aefc2420` (blob `a1f8509e16bd8d2c24970790c76afabc6ae7f24b`).
The active `status-at-a-glance` overlay owns the later Done-row wording and retains all
three scenario titles. This change keeps the independent Name-cell marker requirement and its
two scenarios active. The four original tasks and the existing verification gaps remain open.

The retired operation below records the historical wording, including the older status choices.

```text
## MODIFIED Requirements

### Requirement: The table shows Status, Fact start and Fact end, and marks a done row

The table SHALL offer three columns — `Status`, `Fact start`, `Fact end` — hidden by default
and offered in the Columns control in table order after `Deadline`. The Status cell SHALL show
the row's status in words and offer `Unknown` and `Done` to choose, on a parent as on a leaf;
`In progress` SHALL be shown but not offered. The two fact cells SHALL be date cells with the
deadline cell's rest and edit states. A row whose status is `done` SHALL carry `data-row-done`,
and its number SHALL read struck through. DONE status SHALL add no strike or muted ink to its
name, which retains its own Markdown formatting, on every stripe and under every row light.

#### Scenario: the Columns control offers the three in order

- **GIVEN** the Columns control open on a two-step plan
- **WHEN** its entries are read
- **THEN** `Status`, `Fact start`, `Fact end` follow `Deadline` in that order, and none of the
  three is on screen until chosen

#### Scenario: choosing Done marks the row and fills the fact end

- **GIVEN** a leaf reading `Unknown` with the three columns shown
- **WHEN** `Done` is chosen in its Status cell
- **THEN** the row reads `Done`, its number is struck through, DONE status adds no strike to its
  name, and its Fact end cell reads today

#### Scenario: a partly done row reads In progress and can still be finished

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** its Status cell is read and then opened
- **THEN** it reads `In progress`, and the list offers `Unknown` and `Done` only
```
