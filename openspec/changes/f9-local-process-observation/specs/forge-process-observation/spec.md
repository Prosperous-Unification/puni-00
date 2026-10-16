## ADDED Requirements

### Requirement: Stable local observations

The command SHALL observe only an explicitly selected exact local cgroup-v2 directory. It SHALL retain cgroup memory counters and each listed process PID, start time, PPID, executable basename, conservative launcher role, RSS and thread count. It MUST verify process identity and exact cgroup membership before and after inspection. It MUST omit raw argv and emit no acceptance verdict.

#### Scenario: Vite child identity

- **WHEN** a stable exact member executes the Vite launcher with a credential argument
- **THEN** the observation records its Vite role, process identity and memory, and contains no credential argument

#### Scenario: Trusted state failure or change

- **WHEN** a required file is absent, unreadable, malformed, or a process changes identity or membership
- **THEN** sampling fails visibly and emits no completed observation for that sample

### Requirement: Finite observation bounds

The command SHALL enforce at most 30 samples, a 1–30000ms elapsed budget, a 0–1000ms interval, at most 256 exact members, and at most 65536 bytes per required file. It SHALL reject unknown CLI arguments, foreign directories and symlink escapes before sampling. It MUST perform no lifecycle or remote operations.

#### Scenario: Oversized input or invalid bounds

- **WHEN** input exceeds a byte/process/time/sample bound or names a directory outside the cgroup root
- **THEN** sampling refuses

#### Scenario: Deadline expires

- **WHEN** the elapsed budget expires during a read or pause
- **THEN** the command exits unsuccessfully within scheduling tolerance and does not continue sampling
