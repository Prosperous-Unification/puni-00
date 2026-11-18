## ADDED Requirements

### Requirement: The enrolled gate launcher submits its own calibration

The outer gate launcher SHALL accept `bin/h2puni-gate.sh --calibrate <sha>` as an explicit top-level request. It SHALL resolve the supplied commit and use the ordinary gate's external verifier preparation before submitting exactly one enrolled `ops job calibrate --type gate` request. The admitted command SHALL consist of the launcher's existing fixed gate payload and that full resolved commit. The gate type's declared argument profile and execution limits apply.

#### Scenario: An operator calibrates the gate from the enrolled launcher

- **WHEN** a top-level operator supplies one resolvable target to the calibration form and the fixed enrollment reader confirms enrollment
- **THEN** the launcher supplies its existing gate label, wait and poll settings, verifier handoff, and fixed payload argv in one calibration submission
- **AND** Dash owns the drained pool reservation, calibration scope, job-private scratch, assigned gate tree and measurement record
- **AND** the payload checks out and prints the target under admission, applies the existing wiki activation decision and gate steps, and restores the enrolled checkout on success or failure.

#### Scenario: Calibration argument or authority is unavailable

- **WHEN** the calibration form has a missing, empty, unresolvable or extra target argument
- **THEN** the launcher refuses with status 64 before any admission or payload.
- **WHEN** an otherwise valid calibration invocation has a set Dash job identity, including an empty value, or enrollment is absent or indeterminate
- **THEN** it refuses with status 70 before submitting a job, acquiring a standalone legacy lock or starting the payload.

#### Scenario: Configured external verification fails

- **WHEN** the external activation is configured and its existing preparation refuses
- **THEN** the same refusal reaches the operator before admission.
- **WHEN** the preserved verifier runs inside the assigned tree and rejects its pinned HEAD
- **THEN** the candidate steps do not start and the verifier failure and checkout restoration follow the ordinary gate contract.

#### Scenario: Operator interruption or child termination

- **WHEN** Dash returns a nonzero terminal status, or the outer launcher receives a supported interruption during admission or execution
- **THEN** the enrolled forwarding and wait contract propagates Dash's terminal status and the outer launcher runs its existing cleanup once.

#### Scenario: Ordinary and nested callers keep their gate behavior

- **WHEN** the gate is invoked normally with its ordinary target or with no arguments
- **THEN** it uses the ordinary target resolver and existing heavy-job dispatch, including its HEAD default.
- **WHEN** an admitted job attempts another ordinary gate
- **THEN** the existing nested exclusive-unit protection applies.
