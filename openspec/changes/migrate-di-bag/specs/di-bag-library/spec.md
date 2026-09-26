## ADDED Requirements

### Requirement: One composition library release, from one entry point

The root manifest SHALL pin `di-bag` to one exact release, and browser code SHALL reach the
library only through its root entry, so that no Node built-in is bundled for the browser.

#### Scenario: The pin is exact

- **WHEN** the pins suite reads the root manifest
- **THEN** `di-bag` is pinned to `0.5.1` with no range

#### Scenario: A Node built-in reaches the browser probe

- **WHEN** the browser package probe imports a Node built-in
- **THEN** the browser build test reports it as externalized for the browser

### Requirement: A lifetime's close budget reaches the library's wait

A runtime acquired transactionally SHALL hand the lifetime slot's close budget to DI Bag as the
container's wait budget, both when the runtime closes and when a half-finished read is released.

#### Scenario: A runtime whose disposal never settles is closed

- **WHEN** the runtime is closed with a budget of 25 milliseconds
- **THEN** DI Bag refuses the close with `DiBagCloseCancelledError` naming a 25 millisecond wait

#### Scenario: A half-finished read is released

- **WHEN** the refused read's release is given a budget of 30 milliseconds
- **THEN** DI Bag refuses the release with `DiBagCloseCancelledError` naming a 30 millisecond wait
