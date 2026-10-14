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

**Performance publication inspection**

- From: `evaluatePerformanceRun` judges supplied evidence but does not inspect immutable publication integrity.
- To: `inspect-performance` binds the current publication to committed sources and external policy, decodes raw reports independently, and reconciles measurements and JUnit.
- Impact: read-only diagnostic with authentication absent and `certifies:false`; historical failure bundles remain diagnostics.

## Non-Goals

This change renames no existing test. Existing targets remain intact. Conformance and Architecture tests remain outside T2 because they prove contracts and rules rather than scenarios. Migration of every legacy OpenSpec scenario is outside the first adopted set; the ledgers must report that debt explicitly.

## Constraints

Scenario identifiers use square brackets at the start of scenario and test titles, are allocated without reuse, and preserve predecessors. Existing identifiers are reserved before provenance enforcement. Existing aggregate targets are preserved.

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

## 4.1b.6b.1 intent

Problem: a committed Conformance authority currently refuses even when its exact manifest
contains a bounded explicit test selection. Outcome: validate that selection without executing
candidate code, retain all committed selected source identities, and report the sorted
intersection with the complete Performance fixture scope. Constraints: retain strict external
version-1 authority, exact SHA/blob selection, closed Nx target and options, literal safe Bun
command grammar with explicit `./` file operands and explicit absence. Update the Memory and
SQLite target operands and canonical path consumers together; bare Bun filters cannot prove
literal complete membership. The exact SQLite migration input is permitted only at
its reviewed project root and remains dependency metadata. Non-goals: Architecture extraction,
classification, target isolation, report inspection, reviewer authentication and coverage credit.

## 4.1b.7 intent

Problem: complete committed level facts and inspected Performance publications are separate observations, so they cannot yet establish target isolation. Outcome: a bounded `inspect-performance-levels` diagnostic joins those real inspectors against one exact committed declaration and classifies only its complete Performance fixture scope through the earlier rows of the shared first-match table. Constraints: compare exact revision/candidate, declaration path and semantic digest, config/project/digest, selected source tuples and complete recorded collection; preserve legitimate Conformance and Architecture overlap, then report it as typed wrong-level isolation with nonzero CLI status. Raw declaration byte pins and normalized declaration digests are distinct identities and must be verified through the shared decoder. Non-goals: later table rows, owner-output changes, coverage, independent authentication, certification, admission, sync or archive.
