## ADDED Requirements

### Requirement: Retired Pod images permit only native terminal finalizer cleanup

The trusted workload image-membership check SHALL admit a retired image only for an ordinary Pod UPDATE whose old Pod is already deleting and terminal Failed or Succeeded, whose spec, labels, annotations and owner references are unchanged, and whose finalizers strictly decrease by removing only `batch.kubernetes.io/job-tracking` and/or `orphan`. Absent optional maps/lists SHALL compare consistently with empty values. Every other validation SHALL remain enforced.

#### Scenario: Native cleanup of a terminal deleting old-image Pod

- **WHEN** an original Failed or Succeeded deleting Pod has native cleanup finalizers and a private sentinel
- **AND** a server-side dry-run removes only native cleanup keys and retains the sentinel
- **THEN** image membership permits that update without broadening executable digests

#### Scenario: Other retired-image requests remain refused

- **WHEN** a retired-image CREATE, live/nonterminal/nondeleting update, changed spec/image/labels/annotations/owners, added finalizer, foreign-key removal or subresource update is requested
- **THEN** the image-membership policy or the existing Kubernetes finalizer-addition invariant refuses the request

### Requirement: Synthetic drain Job excludes unused S3 trust dependency

The synthetic backup drain fixture SHALL validate and remove exactly its unused S3 trust mount and matching secret volume alongside its unused environment, while preserving its PVC/runtime mounts, controller UID ownership, graceful signal delay and ordinary Pod grace.

#### Scenario: S3 trust resource is not mounted by the synthetic command

- **WHEN** the local CronJob is transformed into the synthetic drain Job
- **THEN** the exact S3 CA mount and volume are removed and unrelated storage and lifecycle behavior remain intact
