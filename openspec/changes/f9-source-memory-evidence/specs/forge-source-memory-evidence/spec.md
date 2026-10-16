## ADDED Requirements

### Requirement: Exact first source binding

The validator SHALL consume an expected first PodObservation, an explicitly supplied binding containing Pod UID, full containerd container ID, init PID/starttime, and exact cgroup path/device/inode, plus structured CgroupObservation samples. It SHALL require exact matching Pod UID/container and cgroup identities and the bound init PID/starttime in every sample. It SHALL reject empty samples and incomplete metrics. Every sample SHALL have memory.max exactly 2147483648.

#### Scenario: Foreign or replacement identity

- **WHEN** a supplied binding names another Pod, a replacement or warm container, or a sample names a sibling/prefix cgroup, different device/inode, or reused init PID
- **THEN** validation throws and returns no evidence

#### Scenario: Complete bounded source evidence

- **WHEN** every structured sample has complete valid counters, process observations, the bound init member and the exact 2Gi limit
- **THEN** validation returns sanitized source evidence containing those observations

#### Scenario: Missing evidence

- **WHEN** samples are empty or a required metric or init member is missing, or memory.max is absent, unlimited, malformed or another limit
- **THEN** validation throws

### Requirement: Evidence has no acceptance authority

The validator SHALL return only source memory evidence. It SHALL omit raw argv, credentials and extra caller fields. It SHALL NOT authenticate the supplied binding or return readiness, OOM cause or acceptance verdicts. Recovery provisioning SHALL remain disabled and historical text logs SHALL remain historical evidence.

#### Scenario: Later readiness and injected verdict

- **WHEN** complete samples or bindings include caller-supplied credentials, argv, or successful restored-checker/acceptance fields
- **THEN** returned evidence omits those fields and grants no acceptance conclusion
