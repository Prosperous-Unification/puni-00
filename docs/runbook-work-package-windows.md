# Work package migration windows

The non-additive windows require the stopped application, paused deployment poller and held
host heavy lock throughout the operation. A successful checkpoint or verifier is a
point-in-time observation, not an enduring writer barrier. No live window has been proved
by local CLI or fake-Docker tests. The candidate verifier must run from the explicit
candidate image with its Bun entrypoint and pinned readonly artifact mounts, not the
application entrypoint or a dev source bind.

Embedded PUNI operations must call the import-safe Bun backup/window entrypoints with explicit
database, snapshot, report, candidate-image, container and state-directory arguments. The
backup report and stdout have eight fields; report-mode stderr separately describes
publication state and observed staging locations. A nonzero backup or gate command stops
the window even if a report or snapshot appears at a requested path. Missing, unreadable
or malformed evidence is not permission to proceed. Follow design E36–E39 in
[the window design](../openspec/changes/wbs-work-packages/design.md).

Report mode deliberately retains staging directories and their hard links on both success
and failure. The verified final snapshot remains usable. Hard links allocate no second
copy of the DB blocks, but a retained link prevents block reclamation after the final
snapshot pathname is removed. Plan storage and retain the auxiliary artifact diagnostics
with the window receipt. Legacy no-flag backup behavior is unchanged.

Artifact paths are locations this invocation created or possibly retained, not claims
about their current inode or authority to remove them. After namespace rebinding, a path
may contain another actor's files and the original stage may be elsewhere. The wrapper
does not recursively delete stages or unlink a possibly published report. An acquisition
failure may report only the parent in which a stage may have been created. Preserve the
original operation and descriptor-close failures, including lower snapshot cleanup
uncertainty; do not retry blindly or claim that an artifact is absent.

Before manual reconciliation or deletion, establish exclusive control of the affected
filesystem namespace and stop every actor that can rename, create or replace its entries.
Reconcile requested outputs and observed stages against retained receipts and actual
filesystem evidence; diagnostics alone are not a deletion list. Preserve competing or
unattributable artifacts for investigation. Cleanup is an explicit operator action, not an
automatic continuation of a failed backup.

## Admitted stopped migration and startup

The entity window requires an explicitly admitted one-off candidate migration before current
application startup. The current boot inspector keeps its strict current-layout contract;
ordinary startup does not translate old durable authority. The raw path-based migration CLI
and the backup/window verifier do not supply the required transition owner.

Follow the candidate/store/complete-ledger binding and permissions 6.4b/6.4e owner in the
[dev window procedure](runbook-dev-deploy.md#work-package-rename-window). Positive execution
remains unqualified until that owner, the historical-to-current correspondence and the
actual one-off invocation are implemented and proved. Keep authenticated snapshot reads
available through the transition and retire old HTTP/WS authorizers before upgraded exposure.
Unknown transition or exposure state retains the barriers and explicit recovery ownership;
E38 does not permit automatic old-role restoration after possible upgraded writes.
