## ADDED Requirements

### Requirement: Browser provisioning and validation have explicit finite budgets

Every one of the eight browser shards SHALL declare a 55-minute whole-job budget, a 15-minute Chromium provisioning budget and a 25-minute layout validation budget. The organization validation on shard one SHALL have five minutes and the dedicated cross-project validation on shard four SHALL have ten minutes. The whole-job allowance SHALL include five minutes beyond the sum of the phases selected on each shard for other setup and artifact work. The production-workflow contract SHALL reject an absent phase allowance, an insufficient whole-job allowance or continued execution after a required phase failure.

#### Scenario: Slow valid provisioning leaves room for validation

- **WHEN** Chromium provisioning takes 12 minutes and layout validation takes 20 minutes
- **THEN** the declared phase and job budgets permit both phases to finish and retain time for the organization check and normal overhead

#### Scenario: A phase declaration is removed

- **WHEN** any required phase timeout is removed from the actual production workflow
- **THEN** its workflow contract fails rather than inheriting an unexamined platform default

#### Scenario: The former whole-job cap is restored

- **WHEN** the browser job is restored to a 25-minute cap while retaining the required phase budgets
- **THEN** the production-workflow contract fails because setup can consume the intended validation allowance

#### Scenario: Shard four needs its dedicated allowance

- **WHEN** the whole-job cap is reduced to 50 minutes while the dedicated cross-project step remains on shard four with its ten-minute limit
- **THEN** the production-workflow contract fails because that selected path requires 55 minutes including overhead

### Requirement: Deadline failures remain visible to the existing required verdict

A browser phase that exceeds its declared deadline SHALL fail the job and prevent subsequent required phases from being credited. The required pixels verdict SHALL continue rejecting failed, cancelled, missing and unexplained skipped shard outcomes. Timeout enforcement evidence SHALL distinguish actual Actions execution from static declaration checks.

#### Scenario: A phase exceeds its deadline

- **WHEN** a controlled dependency delay exceeds a phase timeout in an Actions execution derived from the production declaration
- **THEN** that phase fails visibly and a later validation marker does not run

#### Scenario: A timeout is removed from the fault control

- **WHEN** the same bounded delay runs without the phase timeout
- **THEN** it completes and the timeout-expected proof assertion fails, establishing that the observed refusal depended on the declaration

### Requirement: Budget correction preserves validation scope

The correction SHALL preserve eight shards, existing test commands, organization acceptance on shard one, dedicated cross-project validation on shard four, zero Playwright retries, provider and runner selection, affected/docs scope selection, artifacts, and the stable pixels reducer. It SHALL add no merge serialization or review requirements.

#### Scenario: The complete browser validation succeeds

- **WHEN** every selected browser shard and required organization validation finish successfully
- **THEN** the unchanged pixels reducer reports success using the existing required context

#### Scenario: An unrelated successful job exists

- **WHEN** browser verification is retried
- **THEN** the budget change does not introduce a requirement to rerun a successful workspace or Twilight job within the same source revision
