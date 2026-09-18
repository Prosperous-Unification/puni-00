# Tasks

- [ ] P5 — Switch every hook, workflow, gate, and deployment consumer through the trusted package bootstrap and execute the malicious-candidate matrix per [P5](../../../docs/superpowers/plans/2026-09-17-twilight-bureaucrat-package.md#p5--switch-every-consumer-path-to-the-package).
  - [x] Base-owned bootstrap manifest, explicit-registry frozen no-scripts install before candidate checkout, route switch in `trusted-wiki`.
  - [x] Malicious-candidate matrix (pin, lock, `.npmrc`, `bunfig.toml`, lifecycle scripts, validator source, Nx plugin, activation variables, wrapper) run through the workflow's own run blocks with sentinels against a loopback registry.
  - [x] Package/activation compatibility refusal; unconfigured, inactive and certified states preserved.
  - [x] Root compatibility route with recursion refusal; deployment admission descriptor contract.
  - [ ] Publish `twilight-bureaucrat@0.1.0` (P4 prerequisites), commit `infra/ci/bureaucrat/bun.lock`, prepare an activation from the installed package with real evidence, flip `admission`, then add the root pin and move hooks, CI diagnostic and gate to the route — runbook "Package-backed admission", "Flip".
  - [ ] F11 wires `requireDeploymentAdmission` into deployment preparation.
  - [ ] h2puni full gate and actual CI evidence.
