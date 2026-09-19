# dev-deploy Specification

## Purpose
TBD - created by archiving change dev-deploy-from-puni-00. Update Purpose after archive.

## Requirements

### Requirement: Dev follows puni-00 main

The dev auto-deploy SHALL fetch and deploy `main` of the puni-00 repository and SHALL NOT fetch wbs-tool-v1.

#### Scenario: a puni-00 merge

- **WHEN** a commit lands on puni-00 `main`
- **THEN** within two poller ticks the poller records that commit as proven

### Requirement: A dev deploy is done only when its checkout commit is proven

The poller SHALL treat a deploy as proven only when be-01's `/health` answers HTTP 200 with `status:"ok"` and a `commit` equal to the fetched 40-hex SHA. It SHALL persist the last proven SHA, and on every tick where that value differs from `HEAD` it SHALL re-attempt the proof even when `HEAD` already equals `origin/main`.

#### Scenario: proof unreadable, then recovered

- **WHEN** one tick resets to a new commit but `/health` is unreadable, and a later tick reads the matching commit
- **THEN** the first tick exits non-zero without advancing `last-proven`, and the later tick proves it and records it

#### Scenario: health degraded

- **WHEN** `/health` answers 503 with a body containing the fetched commit
- **THEN** the proof fails

#### Scenario: nothing new and already proven

- **WHEN** `HEAD`, `origin/main` and `last-proven` are equal
- **THEN** the tick exits zero without calling `/health`

### Requirement: A rehearsal cannot touch live dev

`tools/tool-devsync` SHALL take its source directory, container name and state directory as explicit inputs, and SHALL refuse to run when a rehearsal input resolves to a live dev path.

#### Scenario: rehearsal pointed at the live tree

- **WHEN** the rehearsal is started with a source directory that resolves to `/home/puni1/wbs-dev/src`
- **THEN** it exits non-zero before any git or docker call
