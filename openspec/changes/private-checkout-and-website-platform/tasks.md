<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Platform prerequisites

- [x] 1.1 `website-dev` namespace (`restricted` enforced) and `default-deny` in
      `infra/platform/policy`; `assertTenantIsolation` in `validatePlatform` for `wbs`, `workers`
      and `website-dev`; both preview URLs in `alerts/production/public-probes.yaml`. Tests:
      `platform.test.ts` tenant negatives and probe targets.
- [x] 1.2 Traefik `ports.web.port: 80` with `http.redirections.entryPoint` (websecure, https,
      permanent), `ports.websecure.port: 443`, `service.spec.type: ClusterIP`; `TraefikValues`
      pins them; the helm family judges the render (`judgeTraefikEdge`); `check-faults.ts` adds
      the 8000 fault; `tool-fleet:rehearse:traefik` on k3d, wired into `infra-check.yml`.
- [x] 1.3 `k3s-sysctl.conf.j2` lowers the port floor for `ingress` hosts; `check-ansible.py`
      renders it per static inventory host and `judgeKernelSettings` binds it; `check-faults.ts`
      deletes the line. The QEMU platform lab run is owed (no QEMU build on this host).
- [x] 1.4 `docs/infra/platform.md`: application sources (`puni-fleet-auth`, `GitRepository puni-fleet`) and the Traefik edge.

## 2. Private companion nesting

- [x] 2.1 `/private/` in `.gitignore`, `private` in `.nxignore`; `tools/tool-private` with
      `checkout.ts` and `bun run private:checkout`. Tests: `checkout.test.ts` scratch
      organisation (clone, fast-forward, `--ref`, dirty refusal, not-ignored refusal, foreign
      remote).
- [x] 2.2 `private:check` / `private:rehearse` (`nested.ts`). Tests: `nested.test.ts` (absent
      skip, failing command propagates, file and unreadable path refused, `NX_*` stripped).
- [x] 2.3 `private-nesting.ts` in lefthook pre-commit and the `gate_workspace` CI step. Tests:
      `private-nesting.test.ts` per failure mode; `gate-workflow.test.ts` runs the CI step.
- [x] 2.4 `LLM_README.md` line and ADR 0036.
