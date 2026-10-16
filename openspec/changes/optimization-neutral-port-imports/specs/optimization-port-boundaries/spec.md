## ADDED Requirements

### Requirement: Optimization consumes neutral contracts

Optimization transaction owners SHALL import UnitOfWork and WriteStamp from their defining ports, and SQLite symbols from their defining adapter leaves. The SQLite event-log adapter SHALL import and re-export its event-log contracts directly from the neutral port. The optimized reader SHALL import and re-export scheduler contracts from the scheduler port. The optimization contract and coordinator SHALL import committed event contracts from a neutral committed-fanout port.

#### Scenario: Production graph excludes accidental feature reachability

- **WHEN** the installed Burokrat K6 production graph evaluates the backend
- **THEN** transaction owners and the optimized reader introduce no sibling feature reachability through the application barrel, and the coordinator introduces none through the recorder type

#### Scenario: Restoring an accidental edge is detected

- **WHEN** a transaction owner barrel import, reader barrel re-export, or coordinator recorder type import is restored separately
- **THEN** the installed production graph reports the corresponding sibling feature dependencies

### Requirement: Existing recording and type compatibility remain

The recorder SHALL preserve its existing committed type exports and runtime calls, transaction ownership, event envelopes, and post-commit delivery semantics.

#### Scenario: Existing callers retain durable fanout

- **WHEN** optimization and committed fanout regression suites execute after the port extraction
- **THEN** their event recording, rollback, admission, and delivery assertions pass and existing recorder type imports typecheck
