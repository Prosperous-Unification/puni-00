## ADDED Requirements

### Requirement: Unread host identities are operator inputs

Desired state SHALL mark a machine ID not yet read from its host with the `operator-input:`
prefix, and every fleet operation on such a node SHALL refuse.

#### Scenario: Enrollment of an unresolved node

- **GIVEN** the committed desired fleet naming h4claw with an `operator-input:` machine ID
- **WHEN** an enrollment plan is requested for h4claw
- **THEN** planning refuses and names the unresolved operator input

### Requirement: One SSH address belongs to one node

The desired-fleet decoder SHALL refuse two SSH nodes with the same address.

#### Scenario: Two nodes at one private address

- **GIVEN** h3mon and h4claw both declared at 10.1.0.4
- **WHEN** desired state is decoded
- **THEN** decoding refuses and names both nodes

### Requirement: Enrollment targets are observed at their identity

Enrollment planning SHALL require the detailed observation to show the target desired node
discovered and unenrolled at its desired provider identity and address, with no other observed
machine at that address.

#### Scenario: Another machine answers at the desired address

- **GIVEN** discovery observed a machine with another machine ID at h4claw's address
- **WHEN** enrollment of h4claw is planned
- **THEN** planning refuses and names the observed identity

#### Scenario: Target is missing or already enrolled

- **GIVEN** the target is reported missing or enrolled
- **WHEN** enrollment is planned
- **THEN** planning refuses without writing a plan

### Requirement: Existing hosts are inspected read-only before and after enrollment

A preflight play SHALL record machine ID, OS, memory, private MTU, swap, listeners, containers and
subnets, and SHALL refuse a pre-enrollment host with k3s installed, a k3s port in use, a cluster
or service CIDR overlapping a host or Docker network, a connecting user whose sudo the base role
would remove, or an existing operator whose keys the base role would replace. After enrollment it
SHALL refuse when a preserved listener or container is gone.

#### Scenario: Port already in use

- **GIVEN** a listener on port 10250
- **WHEN** preflight runs at stage before-enrollment
- **THEN** it fails naming the port

#### Scenario: Preserved service stopped

- **GIVEN** a preserved container stopped after enrollment
- **WHEN** preflight runs at stage after-enrollment
- **THEN** it fails naming that container or listener

### Requirement: Hosts keep one sized swap file and a capped kubelet

The base role SHALL accept Ubuntu 24.04 and 26.04, and SHALL keep exactly one fleet swap file of
the configured size or no swap. k3s SHALL run with `fail-swap-on=false`, configured system and
kube memory reservations, and every default hard-eviction threshold.

#### Scenario: Second convergence with a swap file

- **GIVEN** an agent converged with a 1024 MiB fleet swap file
- **WHEN** bootstrap and join converge again
- **THEN** the recap reports `changed=0` and the swap file stays active at that size

### Requirement: A failed first enrollment can be removed

A rollback play SHALL remove k3s, its mounts, links, iptables chains, the fleet nftables table,
units, swap file and fleet files from exactly one confirmed host, and SHALL leave Docker, its
containers and its rules running.

#### Scenario: Rollback on a Docker host

- **GIVEN** an enrolled agent running a Docker container on a published port
- **WHEN** rollback runs for that host
- **THEN** k3s and the fleet table are gone, the container still serves, and the host can enroll again
