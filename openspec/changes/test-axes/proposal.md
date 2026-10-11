## Why

The repository has several test runners and established test levels, but no complete binding from a test file to one level, one module and the OpenSpec scenario it proves. Passing totals therefore cannot show which scenarios or structural obligations remain unproved.

## What Changes

**Three test axes**

- From: suffixes, target membership and directory conventions classify tests inconsistently.
- To: every test resolves to exactly one level by an ordered table, lives in its tested module, and cites a stable scenario identifier where T2 applies.
- Impact: architectural; existing aggregate targets remain intact while each level gains an isolated target.

**Coverage ledgers**

- From: passing suites do not account for every scenario or module obligation.
- To: scenario and structural ledgers expose uncovered work, explicit dispositions and missing test levels.
- Impact: architectural; manual cases gain reviewed reasons, steps, environment-bound reports and staleness rules.

**Performance level execution**

- From: the isolated Performance target correctly refuses an empty declaration but has no repository fixture.
- To: one real WBS rendering case measures mounted table cells against a reviewed budget through the real FE/BE/GW stack; startup failures and timed-out process trees refuse without publishing a report.
- Impact: adds one measured Performance case and bounded runner lifecycle behavior. The resulting report remains operational and noncertifying.

## Non-Goals

This change renames no existing test. It adds test targets and test reporting only additively: an existing target is never renamed, removed or repurposed. Conformance and Architecture tests remain outside T2 because they prove contracts and rules rather than scenarios. Migration of every legacy OpenSpec scenario is outside the first adopted set; the ledgers must report that debt explicitly.

## Constraints

Scenario identifiers use square brackets at the start of scenario and test titles, are allocated without reuse, and preserve predecessors. Existing hand-written identifiers are imported and reserved before allocator provenance is enforced. Existing aggregate targets are preserved.

## Capabilities

### New Capabilities

- `test-axes`: Architectural rules for test levels, module ownership, scenario identifiers, coverage ledgers and manual evidence.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

Nx test targets, Bun, Vitest and Playwright reports, OpenSpec scenarios, Twilight Burokrat's identifier allocator and coverage ledgers.
