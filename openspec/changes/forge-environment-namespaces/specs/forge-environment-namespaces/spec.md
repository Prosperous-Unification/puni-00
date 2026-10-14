## ADDED Requirements

### Requirement: Environment namespace isolation

The tool SHALL bind every workload to `puni-forge-<slug>` and SHALL retain the shared controller identity and both uniqueness Leases in `puni-forge`. Namespace-local Pod permissions SHALL reference only the shared controller.

#### Scenario: Two simultaneous environments

- **WHEN** alpha and beta serve distinct owned worktrees concurrently
- **THEN** their Pods, Services, Ingresses, NetworkPolicies and database claims occupy distinct namespaces and their policies deny traffic between environments

### Requirement: Namespace ownership and partial creation

The tool SHALL atomically create a namespace carrying its lab, slug, source trust and worktree identity. It MUST refuse an existing namespace with missing, malformed or mismatched ownership and MUST refuse creation while deletion is pending.

#### Scenario: Retry a partial create

- **WHEN** namespace creation succeeded but workload creation did not finish
- **THEN** retrying the same lab, slug and worktree uses the same namespace without overwriting its ownership

#### Scenario: Foreign or preexisting namespace

- **WHEN** the reserved namespace is unlabelled or has another lab, slug, trust identity or worktree
- **THEN** up, status and down refuse before changing that namespace

### Requirement: Owned destructive teardown

The tool SHALL inspect namespace ownership before deletion and SHALL require its inspected UID at the API deletion boundary. It SHALL delete that namespace and its database volume, release its admission claim and delete its uniqueness Leases only after namespace deletion succeeds.

#### Scenario: Delete one of two environments

- **WHEN** alpha is torn down while beta exists
- **THEN** alpha's namespace and database claim disappear, beta remains and the shared controller authority namespace remains

#### Scenario: Replacement race

- **WHEN** the namespace is replaced after ownership inspection
- **THEN** deletion fails its UID precondition and the replacement survives
