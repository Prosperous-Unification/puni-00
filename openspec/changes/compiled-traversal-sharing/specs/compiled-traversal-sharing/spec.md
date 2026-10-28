## ADDED Requirements

### Requirement: Native patch registration is exact and version-specific

The candidate SHALL register only the authenticated `@ark/schema@0.56.2` patch at `patches/@ark%2Fschema@0.56.2.patch`. Its body SHALL change only package-relative `out/scope.js`, from qualified stock SHA256 `1f31a41cd404c84460837145bf7569087bfdedf3cb2d949299caac592a9729f4` to canonical SHA256 `53763b12710126fe3027f60e7adfc67f012a415a13d6ddf3b8dd15827d693446`. Existing top-level0.56.0, dependency graph, integrity/resolution and unrelated manifest values SHALL remain unchanged.

#### Scenario: Integrate the pinned R16 metadata proposal

- **WHEN** the proposed native property and exact three native lock lines are added to pinned R16 inputs
- **THEN** proposed package/lock hashes equal the authenticated native artifacts
- **AND** removing only those insertions restores the entire current package/lock bytes exactly
- **AND** a changed starting pin or conflicting registration stops preparation for renewed inspection

#### Scenario: Materialize the exact candidate under ordinary policy

- **WHEN** later authorized normal frozen candidate materialization completes
- **THEN** its native inputs remain unchanged and all105 canonical nested schema files match
- **AND** its exact native-derived empty regular marker is separately checked without wildcard acceptance
- **AND** top-level0.56.0 remains stock; marker bookkeeping never replaces canonical-file checks

### Requirement: Reuse requires an exact eligible reference closure

A callback SHALL be borrowed only for a precompiled node outside the current owning scope, or with no owning scope, whose complete non-self reference closure is reusable. Every represented reference SHALL match the same object at its ID in the current reference map. Cyclic nodes, aliases, an ineligible descendant, an identity mismatch or a visiting nonalias cycle SHALL cause conservative original code generation for affected nodes rather than borrowed callbacks.

#### Scenario: Reuse an external compiled reference

- **WHEN** a precompiled external node and every non-self reference satisfy exact-object eligibility
- **THEN** its generated table slots reference the exact existing bound callback objects
- **AND** its existing node callbacks are not rebound to the new table

#### Scenario: Refuse borrowing across closure conflicts

- **WHEN** the closure contains an alias, cyclic node, same-ID different object, visiting cycle or owning-scope reference
- **THEN** the affected node retains the original generated implementation path
- **AND** semantic results and complete slot coverage remain unchanged

### Requirement: Owning scopes generate and bind their own callbacks

Scope export SHALL pass its owning scope into compilation. A node owned by that scope SHALL use original code generation and binding even if already compiled. Anonymous compilation and other-scope references SHALL retain the existing binding policy.

#### Scenario: Export an already compiled owned node

- **WHEN** the owning scope exports its already compiled node
- **THEN** the scope generates and binds its own new table callbacks
- **AND** externally owned compiled nodes preserve their original bound callback identities

### Requirement: All required callbacks preserve identity and union coverage

Borrowing SHALL require own function-valued Allows and Apply callbacks; a union SHALL additionally require its own function-valued Optimistic callback. A precompiled external node missing a required callback during reuse evaluation SHALL throw the existing compiled-traversal invariant error. Borrowed slots SHALL preserve exact callback identity and their original bound receiver/table behavior.

#### Scenario: Borrow a fully eligible three-unit union

- **WHEN** an eligible precompiled union and its exact three-unit closure are compiled
- **THEN** Allows, Apply and Optimistic slots preserve exact existing callback objects
- **AND** valid and invalid inputs preserve the qualified slot behavior

#### Scenario: A compiled callback invariant is broken

- **WHEN** a required callback is absent or not an own function during reuse evaluation
- **THEN** compilation throws the compiled-traversal invariant error instead of publishing an incomplete borrowed table

### Requirement: Candidate acceptance preserves semantics and reports tradeoffs accurately

The exact integrated candidate SHALL preserve complete contract/producer parity and broader type-negative behavior under normal candidate checks. The existing memory test SHALL retain its strict less-than500MB assertion. Historical evidence SHALL be inherited only for exact byte-bound inputs and SHALL retain its original provenance and limits.

#### Scenario: Interpret historical qualification

- **WHEN** the private result is cited
- **THEN** candidate381/379/384MB and stock509/513MB are identified as RSS increments with unchanged threshold outcomes
- **AND** aggregate+13.02% within the1.20 budget and raw Standard Schema+40.16% are reported together
- **AND** no retained-heap, total/peak RSS, long-lived retention or512MiB deployed-headroom claim follows

### Requirement: Patch maintenance retains explicit removal conditions

WBS contracts maintainers SHALL own the private patch and its canonical/target pins. Registry-held callbacks and their old bound tables SHALL be acknowledged as strongly retained; sharing SHALL NOT be described as weak ownership or a proven retained-memory improvement.

#### Scenario: The patch loses its qualified basis

- **WHEN** upstream replaces the mechanism, target version changes, canonical identity is lost, candidate semantics fail or the measured tradeoff is unacceptable
- **THEN** maintainers remove the registration/patch together or prepare a separately reviewed replacement
- **AND** normal candidate checks confirm stock/replacement resolution before any adoption decision
