# Twilight review hardening

The user accepted the branch review and requested its fixes. This change repairs
the repository workflow and updates proposed contracts; no runtime guarantee is
implemented by editing a specification.

## Runtime and planning contract ownership

Amend the existing control-plane design and delta specifications in place. Define
three deep modules: workflow restore owns executable compatibility and checkpoint
loading; authority owns pinned approval scope intersected with current permissions;
effect execution owns dispatch fencing, reconciliation and resource release.
Put corresponding acceptance experiments into the existing product tasks.

Separate immutable input receipt snapshots from completion receipts produced by
a source candidate. Support multiple change-keyed plan references and test merging
independent changes. Retain one accepted planning ref, with explicit conflict
semantics and a measurable workload budget for the storage spike.

## Repository workflow

Include conditional design in Twilight's planning dependency traversal, so the
existing fast-forward conditional-artifact rule can assess it before planning.
Optional design remains an explicit applicability decision; verification remains
post-work. Test the actual pinned CLI graph in a disposable repository.

Replace the archive/bulk-archive blanket failure fallback with explicit outcome
handling: valid optional absence is allowed; an identified unsupported command is
reported as unavailable with the normal archive checks retained; other command,
parse or required-context failures stop the operation with actionable output.

Keep a canonical repository-owned workflow source and deterministic provider
rendering. An Nx generation command writes the installed variants; a check command
compares all expected files and fails on missing, unreadable or divergent inputs.
The check is part of CI through an existing gate target or explicit CI step.
Generated files retain provider-specific names and tool syntax. Upstream refreshes
are reviewed into the canonical source before regeneration, preserving repo policy.

## Evidence

Retain CLI tests and workflow drift regressions under repository tooling. Execute
real CLI entrypoints on fixtures; remove design traversal and corrupt/delete a
generated file to observe failures. Test missing and unreadable files separately
where the implementation distinguishes them. Skill scenario tests cover malformed
archive output, optional absence and unsupported-command behavior. Record observed
output before Proof comments. Formatting, lint and source/spec typechecks cover
new tooling; runtime/browser/deployment checks remain out of scope.
