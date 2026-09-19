## ADDED Requirements

### Requirement: Dev follows puni-00 main

The dev auto-deploy SHALL fetch and deploy `main` of the puni-00 repository and SHALL NOT fetch wbs-tool-v1.

#### Scenario: a puni-00 merge

- **WHEN** a commit lands on puni-00 `main`
- **THEN** within two poller ticks dev reports that commit as served

### Requirement: A dev deploy proves the commit it serves

After syncing, the poller SHALL read the served commit from be-01's health endpoint. A missing, unreadable or different commit after the retry budget SHALL mark the deploy failed, SHALL exit non-zero, and SHALL be retried on the next tick rather than recorded as done.

#### Scenario: health unreadable

- **WHEN** the served commit cannot be read after the retry budget
- **THEN** the log says the deploy failed, the poller exits non-zero, and the next tick tries again

#### Scenario: health matches

- **WHEN** health reports the fetched commit
- **THEN** the log records it as served and the poller exits zero
