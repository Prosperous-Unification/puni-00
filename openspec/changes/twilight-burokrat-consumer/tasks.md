# Tasks

- [ ] P5 — Switch every hook, workflow, gate, and deployment consumer through the trusted package bootstrap and execute the malicious-candidate matrix per [P5](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md#p5--switch-every-consumer-path-to-the-package).
  - [x] Base-owned bootstrap manifest, explicit-registry frozen no-scripts install before candidate checkout, route switch in `trusted-wiki`.
  - [x] Malicious-candidate matrix (pin, lock, `.npmrc`, `bunfig.toml`, lifecycle scripts, validator source, Nx plugin, activation variables, wrapper) run through the workflow's own run blocks with sentinels against a loopback registry.
  - [x] Package/activation compatibility refusal; unconfigured, inactive and certified states preserved.
  - [x] Root compatibility route with recursion refusal; deployment admission descriptor contract.
  - [ ] Publish `twilight-burokrat@0.1.0` (P4 prerequisites), commit `infra/ci/burokrat/bun.lock`, prepare an activation from the installed package with real evidence, flip `admission`, then add the root pin and move hooks, CI diagnostic and gate to the route — runbook "Package-backed admission", "Flip".
  - [x] F11 wires `requireDeploymentAdmission` into deployment preparation: `sealDescriptor` admits every tier digest and `deploy:k3s` re-admits the descriptor's package and activation ([k3s-wbs-delivery verify.md](../k3s-wbs-delivery/verify.md#r5-failure-proofs-each-guard-disabled-the-named-test-observed-failing-then-restored-and-passing)).
  - [ ] h2puni full gate and actual CI evidence. Next: `bin/h2puni-gate.sh <merged sha>` on h2puni, then the first `ci` and `trusted-wiki` runs of that commit, including the `Twilight Burokrat packed package suite` step.
