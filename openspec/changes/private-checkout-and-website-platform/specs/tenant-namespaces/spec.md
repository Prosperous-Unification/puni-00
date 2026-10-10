## ADDED Requirements

### Requirement: Tenant namespaces are restricted and default-deny

Every tenant namespace (`wbs`, `workers`, `website-dev`) SHALL be declared once in
`infra/platform/policy` with `pod-security.kubernetes.io/enforce: restricted` and
`enforce-version: latest`, and SHALL have a `default-deny` NetworkPolicy selecting every pod and
denying both Ingress and Egress. `tool-fleet:check` SHALL refuse the platform otherwise.

#### Scenario: enforce label removed

- **WHEN** `website-dev` loses its `enforce: restricted` label
- **THEN** validation fails with `tenant namespace website-dev must enforce Pod Security restricted`

#### Scenario: egress left open

- **WHEN** the `website-dev` default-deny lists only `Ingress`
- **THEN** validation fails with `tenant namespace website-dev has no default-deny NetworkPolicy`

### Requirement: The production blackbox probes the preview hostnames

The production `public-endpoints` Probe SHALL include `https://dev.puni.dev/` and
`https://dev.app.puni.dev/`.

#### Scenario: probe targets

- **WHEN** the production alerts kustomization is read
- **THEN** both preview URLs are among its static targets
