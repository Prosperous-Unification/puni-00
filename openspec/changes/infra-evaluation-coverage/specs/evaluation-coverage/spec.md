## ADDED Requirements

### Requirement: Exact committed authority

The diagnostic SHALL accept only a full committed identity and external validated
rule policy and coverage review. The requested full identity MUST equal the
resolved commit identity itself; an annotated-tag object identity MUST be refused
even when its peeled commit matches the review. It MUST compare the exact revision, tree,
candidate digest, complete path/mode/object inventory, policy bytes, explicit
adopted set, full registry contracts with modes and actual runtime identity.

#### Scenario: Omitted committed tuples

- **WHEN** a review omits committed YAML or a committed extensionless executable
- **THEN** the command refuses without emitting a report.

#### Scenario: Annotated tag object is not a commit identity

- **WHEN** a caller supplies the full object SHA of a real annotated tag whose target matches the correctly reviewed candidate
- **THEN** the command refuses the input identity before emitting a report rather than silently peeling the tag.

#### Scenario: Invalid authority

- **WHEN** either external authority is absent, unreadable, malformed or inside the candidate
- **THEN** the command refuses and names the failed boundary.

#### Scenario: Stale joined identity

- **WHEN** any required joined identity differs or any registry mode is missing
- **THEN** the command refuses before generating evaluation coverage.

### Requirement: Complete explicit subject matrix

The report SHALL contain exactly one row for every explicitly selected unique
inventory tuple in a nonempty selection crossed with every registered rule. Subjects MUST equal the reviewed path/prefix selectors expanded over the
complete committed inventory, with every selector resolving a tuple.
Unknown, duplicate or
changed subject tuples and unknown or duplicate exclusions MUST be refused.

#### Scenario: Full registry expansion

- **WHEN** two valid tuples are selected and no exclusions are supplied
- **THEN** the report contains exactly twice the number of registered rules, including unsupported rules.

#### Scenario: Invalid selection

- **WHEN** a selected tuple is absent, changed or repeated
- **THEN** the command refuses without a partial matrix.

#### Scenario: Omitted selected subject

- **WHEN** review retains complete inventory but omits YAML or an extensionless executable matched by its path/prefix selectors
- **THEN** exact selector expansion refuses the missing subject before a matrix is emitted.

### Requirement: Applicability does not establish evaluation

The diagnostic MUST distinguish applicability from evaluation. Review SHALL only
provide attributed inapplicability reasons bound to the exact path/mode/object
tuple and a registry-supported reason code whose engine predicate holds.
Unadapted semantic rules MUST reject coverage exclusions. Only actual engine judgment within
the concrete INV-CLASSIFY, MOD-INDEX, MOD-DIRECT-ENTRIES and F7 footprints SHALL
establish evaluated rows. Other rows MUST remain unevaluated absent a later
concrete adapter. No findings SHALL be interpreted as proof of semantic coverage.

#### Scenario: Unsupported semantics

- **WHEN** YAML or extensionless shell is classified successfully
- **THEN** relationship and infrastructure semantic judgments remain unevaluated.

#### Scenario: Attributed exclusion

- **WHEN** a valid review excludes one subject/rule pair with reason, reviewer and reference
- **THEN** the exact tuple and supported reason predicate are checked before that row records inapplicability, and its evaluation is `not-run`; it supplies no evaluated judgment.

#### Scenario: Evaluation claim in review

- **WHEN** review supplies an evaluated status or unrecognized field
- **THEN** strict schema validation refuses it.

#### Scenario: Unsupported exclusion

- **WHEN** review attempts to exclude an unadapted semantic rule or uses a false exclusion predicate
- **THEN** the command refuses; review cannot hide unsupported semantics.

#### Scenario: Index ownership evidence

- **WHEN** MOD-INDEX is marked evaluated for a subject
- **THEN** the row names each associated index from the actual returned index/member relationships.

### Requirement: Separate noncertifying diagnostic

The command SHALL emit a separate version 1 report with literal `allowed:false`
and `certifies:false`, embedding the unchanged check verdict. It MUST run the
complete registry once, accept no rule selector, and claim no native execution,
activation, deployment, live health or WBS closure. The CLI SHALL emit complete
JSON and exit one for unresolved cells. Every current nonempty full-registry
matrix contains unadapted rules and is unresolved; this slice SHALL expose no
reachable successful exit. Refusal findings MUST remain in the embedded verdict.

#### Scenario: Diagnostic with unevaluated engine rules

- **WHEN** report generation succeeds but engine rules are unevaluated
- **THEN** the diagnostic emits complete JSON and exits one, preserving engine reasons and emits no certification claim.

#### Scenario: Existing check compatibility

- **WHEN** the existing check command runs the same candidate and policy
- **THEN** its version 1 verdict fields and semantics remain unchanged.

#### Scenario: Unsupported option

- **WHEN** a caller supplies `--rule` or an extra operand
- **THEN** the diagnostic refuses with its usage contract.
