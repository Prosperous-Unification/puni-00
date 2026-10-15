## Context

WBS 080.25 next bounded packet on #488 exact
`f7f982cae8c633779f10f4f786da389dc1138be8`, inspected 2026-10-15. This is a
delegated design proposal, with no fresh human interview or implementation claim.
The WBS read returned revision 17, whose latest note is dated 2026-10-14 and
leaves receipt authenticity, current WBS authority and Dash emission open.

At this base, `validate-navigator-progress-receipts` already supplies the standalone
Burokrat validator, and `read-current-plan-exports-in-navigator` admits strict v9.
Navigator's README still correctly says Dash emits no progress receipt. Dash's
existing nine commands do not execute planning tasks or own a mapping from
CheckRun outcomes to WBS task completion. The [names and boundaries](../../../docs/twilight-structure/names.md)
place record production in Dash and static consistency in Burokrat.

The scoped outcome is a usable local artifact chain:

```text
Navigator plan-reference -> reference + tasks
operator entries + reference + tasks -> Dash record-progress -> progress receipt
receipt + reference + tasks -> Burokrat validate-progress-receipt
receipt + reference + tasks -> Navigator receipt-to-commands -> proposed WBS batch
```

## Goals / Non-Goals

Remove manual receipt-envelope construction and digest calculation, using the
contracts already consumed by Navigator and Burokrat. Preserve the operator's
assertions exactly and make their limited meaning explicit in CLI documentation.
The proposal owns the non-goals; in particular this is neither a Completion
receipt nor authenticated evidence of execution.

## Decisions

### Existing records, one command

Add `src/progress/record-progress.ts` under Dash and route it from `runDash`.
The four flags are specified in the delta. The entries file contains only the
array already represented by `ProgressReceiptRecord.entries`; it introduces no
new record kind, schema version or provenance envelope. The reference supplies
all six PlanRef fields, with no override flag.

Read each file once through role-aware strict UTF-8/JSON decoding. Parse the
reference and tasks with their existing contracts. Construct the receipt body
from schema version 1, kind, decoded PlanRef and the still-unknown entries value;
compute `digestOf(body)`, then decode the assembled record with
`ProgressReceiptRecord`. This validates the external entries through the existing
shape without duplicating a schema or adding a public contract export. Invoke
`checkProgressReceiptConsistency` on the decoded records before publication.
Its plan/task checks own supported version pairs and semantic membership.

Serialize with existing `canonicalJson(receipt)` plus newline. The same semantic
inputs therefore produce the same bytes regardless of input key ordering.
Preserve array order, repeated entries, optional measures, timestamps and evidence.
No timestamp is synthesized and no evidence path is resolved. The existing
receipt format carries no producer authentication; [ADR 0052](../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md)
records the related operator-evidence trust boundary.

### Exact dependency and publication boundaries

Dash imports the existing `@twilight-burokrat/contracts` alias only from the new
progress module and its scoped tests. Add an exact product-policy allowance for
those paths, retaining the inherited ring/runtime/product constraints and all
existing judge-only overrides. Do not widen the authority, activation, review or
check-run modules to contracts, or allow relative Burokrat imports. The existing
Dash-to-Burokrat project pair suffices; no production Navigator/WBS edge is needed.

Keep file IO local to Dash rather than importing Navigator's adapter helpers or
moving unrelated IO abstractions. Validate before opening output, create with
`wx` and mode 0600, write and close, then print the digest. On write/close failure,
clean up only a path created by this invocation and propagate failure, including
cleanup failure. Existing paths, including symlinks, are refused by exclusive
creation; no parent directory is created. Preserve Dash's existing exit-1 and
single-line error behavior, wrapping parser/schema and consistency failures so raw entries never
appear in diagnostics. In particular, unknown `stepCode` can include newlines or secrets;
retain the consistency exception as a cause behind the fixed single-line
`progress inputs are inconsistent` outer message. Dash prints cause codes only.

### Acceptance through the actual consumers

The end-to-end fixture invokes source entrypoints: Navigator creates a v9 reference
and tasks, Dash emits a receipt, Burokrat checks it, and Navigator produces the
unchanged expected batch. Also retain v6/v7/schema1 and v8/schema2 compatibility
fixtures; they are historical supplied records, not new legacy export support.
Production code calls neither consumer. No new Dash package artifact is claimed;
its build currently bundles the observation launcher only.

Dash test cache inputs must explicitly include any Navigator source/fixtures and
WBS contract/validation sources exercised by subprocess tests. Follow the existing
Burokrat subprocess-input pattern: workspace inputs rather than a production or
implicit project edge. Prove actual native Nx hash inputs include these files and
shared validation. Update only the corresponding relationship declarations in
`docs/wiki-policy/relationships{,.bootstrap}.json` when the new declared inputs
require it, and run their targeted relationship tests. Do not change policy tuples,
relax the project graph, or claim wiki certification.

## Risks / Trade-offs

An operator can assert `done` and recompute the receipt digest. This command
preserves that existing input model and must not suggest that Dash verified the
assertion. Current WBS state can also change after export; the output remains a
proposal for the existing person/MCP application path. Authentication and current
WBS admission require separate source identity, authority and concurrency
contracts. A local export comparison alone would not establish live authority.

Active PR inspection found #474 and #478 carry the already-composed receipt/v9
work, while #489 changes WBS optimization boundaries and #486 carries disabled
StepBlockage activation prerequisites. This packet does not extend their scopes.
Other Burokrat packaging/Performance branches can overlap shared test-input and
relationship files; preserve their unrelated declarations during integration.

## Migration Plan

Additive command only. Existing receipt bytes, validators, Navigator command
mapping, WBS APIs, stores and released binaries retain their contracts. Update the
Dash command count and workflow example, and replace Navigator's obsolete
no-producer sentence only when implementation lands. Record execution evidence in
`verify.md` after implementation; design validation is not a runtime proof.

## Open Questions

None for this bounded producer. Trusted producer identity, authenticated evidence,
current WBS write authority and automatic task measurement remain separate future
packets. Their absence does not prevent explicitly supplied local receipts.
