## Why

WBS can link a work item to a change request, but cannot show its delivery checks or explain CI waiting and execution time. Puni needs that feedback while developing itself, without tying its planning model to a particular repository host or runner.

## What Changes

Add an on-demand delivery view to existing work-item links. It shows the observed change revision, check outcomes, merge commit and separately labeled waiting and execution measurements. Missing, incomplete, unavailable and stale observations remain visible. A provider-neutral model separates change requests, delivery runs, attempts and executions; detected providers translate their records through adapters and retain source identities and provenance. GitHub public repositories are the first supported source, demonstrated with puni-00.

## Non-Goals

No automatic progress changes, deployment acceptance, merge decisions, provider writes, private-repository credentials, background polling, durable analytics warehouse, new CI requirements or runner orchestration. Additional providers need adapters; unsupported links remain explicitly unsupported.

## Constraints

Preserve organization/project access before any external read and resolve links from the authorized work item. Bound provider requests and pagination; never fetch arbitrary link destinations. Keep vendor and runner assumptions out of shared contracts and calculations. Preserve retry histories without counting reused executions twice. Record incomplete timing instead of inventing queue timestamps. Existing links and progress semantics remain unchanged. Production deployment, secrets and final merge require separate authorization.

## Capabilities

### New Capabilities

- `work-delivery-observation`: provider-neutral delivery observations exposed through authorized work-item links.

### Modified Capabilities

None.

## Domain Terms

Change request, delivery observation, delivery run, delivery attempt, delivery execution and carried execution, in the Twilight Structure glossary.

## Decisions Recorded

None: adapter placement and on-demand composition remain reversible.

## Impact

Shared delivery contracts/calculations, a GitHub adapter, WBS HTTP declarations and authorization, and the existing links modal. No database migration. OpenSpec records source limitations, negative proofs and a real Puni demonstration. The user authorized autonomous planning and implementation, including the provider-neutral constraint.
