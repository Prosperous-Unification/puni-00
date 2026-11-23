## Why

The operator inbox retains all proposal requests. Operators need a way to mark requests that are irrelevant and to narrow the inbox by status.

## What Changes

- Allow signed-in operators to mark a request Irrelevant from any workflow status.
- Keep the request and its prior workflow information in storage.
- Add an inbox filter for All statuses, Submitted, Reviewing, Contacted, Closed and Irrelevant.

## Capabilities

- `operator-inbox`: Irrelevant status and status filtering.

## Domain Terms

- Irrelevant proposal request

## Decisions Recorded

None.

## Impact

Website contract, requests API, SQLite migration and operator inbox.
