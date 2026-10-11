## Why

Twilight Navigator owns the planning question and today is only a name. Nothing turns an
accepted WBS plan into a record that Twilight Dash can consume or Twilight Burokrat can judge.
The suite says Navigator and Dash exchange records, not calls, yet Burokrat's contracts declare
no plan reference or progress receipt, so every planning agent invents its own shape.

## What Changes

Add the Navigator CLI `twin` (`apps/twilight-structure/twilight-navigator/cli`, Nx
`twilight-navigator`), local and non-mutating like Dash's first slice:

1. Burokrat's contracts library declares the record kinds `plan-reference` and
   `progress-receipt` (version 1), each carrying a SHA-256 digest of its canonical JSON;
   `decodeRecord` refuses anything else. Navigator depends on Burokrat, never the reverse.
2. `twin plan-reference` reads one exported WBS plan document (version 6) and a requirements
   file, and writes a digest-identified plan reference and a deterministic task export,
   created exclusively with mode 0600.
3. `twin receipt-to-commands` checks a progress receipt against its plan reference and task
   export and writes a WBS command-batch document. A person or the WBS MCP applies it;
   Navigator applies nothing.

## Non-Goals

No server, frontend, MCP, secretary runtime, plan lock, completion receipt, Backlog.md storage,
planning broker, WBS write, WBS contract change, Dash receipt emission, network, clock or
authority-store access.

## Constraints

Bun and Nx; ArkType at every boundary with undeclared keys rejected; missing, unreadable and
malformed inputs refuse before any write; unknown commands and flags refuse before any read;
identical inputs give identical bytes; the Dash CLI layout and lint policy are copied, not
shared.

## Capabilities

### New Capabilities

- `navigator-records`: plan reference and progress receipt records, decoded by Burokrat.
- `navigator-plan-reference`: a plan reference and task export from a WBS plan export.
- `navigator-receipt-commands`: a WBS command batch from a progress receipt.

### Modified Capabilities

None.

## Domain Terms

Plan reference, Progress receipt, Twilight Navigator — `docs/twilight-structure/CONTEXT.md`.
None added.

## Decisions Recorded

No ADR: the record kinds are additive versioned contracts, and the Navigator→Burokrat
dependency follows `docs/twilight-structure/names.md`. Choices are in design.md.

## Impact

New `twilight-navigator` application; two record kinds and a canonical digest helper in
Burokrat's contracts; an exact path alias and lint allowance; tool-devsync inventories.
