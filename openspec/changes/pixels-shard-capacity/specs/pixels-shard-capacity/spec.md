## ADDED Requirements

### Requirement: Complete eight-way browser partition

When the browser stack is affected, CI SHALL schedule shards 1 through 8 with matching `/8` display names and Playwright shard arguments, with a finite 35-minute job budget and disabled fail-fast.

#### Scenario: Every partition is scheduled

- **WHEN** the production workflow selects browser checks
- **THEN** its matrix contains exactly shards 1 through 8 and each layout invocation uses that shard with total 8
- **AND** the activated organization check runs on shard 1
- **AND** the existing `bunx nx run wbs-fe-01:e2e-cross-project` command runs exactly once, conditioned on shard 4
- **AND** ordinary Playwright selection continues to exclude the dedicated cross-project spec

### Requirement: Stable required browser verdict

The required `pixels` check SHALL depend on browser scope and the entire shard matrix, preserving the existing success, skip, failure and cancellation rules.

#### Scenario: One partition does not succeed

- **WHEN** browser scope succeeds as affected and any browser shard fails or is canceled
- **THEN** the required `pixels` aggregate fails

#### Scenario: Explicit browser exemption

- **WHEN** browser scope succeeds as unaffected and the entire matrix is skipped
- **THEN** the required `pixels` aggregate succeeds
