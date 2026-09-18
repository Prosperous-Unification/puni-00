# Intent

## Problem

WBS deployment scripts assume the current host/Compose topology. Flux reconciliation alone cannot safely own the stateful SQLite migration, tier rollout, health proof, and rollback transaction on k3s.

## Desired outcome

Provide a lease-protected, journaled WBS release coordinator that deploys immutable staged digests, preserves one-writer migration safety, resumes or rolls back after interruption, and supports source-run development plus staged production promotion.

## Non-goals

- Replacing SQLite with another database engine.
- Building a new Compose provisioning stage.
- Letting production rebuild artifacts that staging proved.
- Automatically applying a production cutover from repository merge.

## Constraints

The coordinator suspends only the named WBS Flux unit during its transaction. It binds source, package, activation, image, migration, backup, and cluster identities. Production candidate code never receives persistent host credentials. First cutover preserves a recoverable old deployment until the documented write boundary.
