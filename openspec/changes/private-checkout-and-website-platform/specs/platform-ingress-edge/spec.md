## ADDED Requirements

### Requirement: Traefik serves the ingress nodes' host ports 80 and 443

The platform Traefik SHALL run on the host network of `capability-ingress` nodes with entry
points on ports 80 (`web`) and 443 (`websecure`), SHALL redirect every `web` request permanently
to the same URL on `https`, and SHALL be exposed by a `ClusterIP` Service. `tool-fleet:check`
SHALL refuse values that differ and a rendered chart whose DaemonSet arguments, container ports
or Service type differ.

#### Scenario: chart default ports

- **WHEN** `ports.web.port` is 8000 in `infra/platform/networking/traefik.yaml`
- **THEN** the schema family refuses the Traefik values and the helm family names the missing
  `--entryPoints.web.address=:80/tcp`

#### Scenario: an ignored Service key

- **WHEN** the Service type is written as `service.type` instead of `service.spec.type`
- **THEN** the values are refused, because the chart accepts and ignores that key

#### Scenario: redirect on k3d

- **WHEN** the rehearsal sends `GET` and `POST` to `http://dev.puni.dev/probe?x=1` on the node
- **THEN** Traefik answers 301 and 308 respectively with `Location: https://dev.puni.dev/probe?x=1`

### Requirement: Only ingress nodes lower the unprivileged port floor

The base role's `k3s-sysctl.conf.j2` SHALL render `net.ipv4.ip_unprivileged_port_start = 0` for
exactly the hosts whose `puni_node_capabilities` include `ingress`, and nothing about that key
elsewhere.

#### Scenario: ingress host without the floor

- **WHEN** the template no longer renders the line for h4claw
- **THEN** the `ansible-inventory` family fails naming the host

#### Scenario: non-root bind refused at the kernel default

- **WHEN** the node's floor is 1024 and Traefik starts as UID 65532
- **THEN** the rehearsal observes `bind: permission denied`, and after the floor is set to 0 the
  DaemonSet becomes Ready
