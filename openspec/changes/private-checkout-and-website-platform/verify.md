# Verify — private checkout and the website platform prerequisites

Taken on the developer workstation on 2026-10-06 (Bun 1.4.2, Docker with the containerd image
store; containers on this host have no route out, hence `--import-images` below). No host,
cluster, DNS or registry was touched.

## 1. Platform prerequisites

### 1.1 Tenant namespaces and probes

- [x] `platform.test.ts` green, including `rejects a tenant namespace without restricted Pod Security or default-deny` and `probes both dev preview hostnames from the production blackbox`.
- [x] Red with the enforce guard in `assertTenantIsolation` replaced by `void 0`: the test
      failed (0 pass / 1 fail, "Received promise that resolved").
- [x] Red with the default-deny guard disabled: the same test failed (0 pass / 1 fail).

### 1.2 Traefik on 80/443

- [x] Values schema: with `port: '80'` loosened to `number` in `TraefikValues`,
      `rejects Traefik host ports other than 80 and 443` failed (0 pass / 1 fail).
- [x] The plan's `ports.web.redirections` and `service.type` were wrong for chart 41.6.0: the
      real `tool-fleet:check` helm family refused `redirections` ("additional properties
      'redirections' not allowed"), and the chart's values schema accepts and ignores
      `service.type`. Committed as `ports.web.http.redirections.entryPoint` and
      `service.spec.type`; the render shows `--entryPoints.web.address=:80/tcp`,
      `--entryPoints.websecure.address=:443/tcp`, the three redirect arguments and
      `type: ClusterIP`.
- [x] Render judge: with the argument loop of `judgeTraefikEdge` disabled, and separately with
      its Service comparison disabled, `refuses a Traefik render on the chart default ports`
      failed (22 pass / 1 fail each).
- [x] `tool-fleet:check:faults`: all 13 families failed on their fault, including the new
      `helm: Traefik web entry point back on the chart default 8000` (failing families
      `[schema, helm]`) and `ansible-inventory: base sysctl template no longer lowers the port floor on ingress hosts` (`[ansible-inventory]`); the clean copy exited 0.
- [x] k3d rehearsal (`bun tools/tool-fleet/src/traefik-rehearsal.ts --import-images`): floor
      1024 → `bind: permission denied` observed; floor 0 → DaemonSet Ready; `GET` → 301 and
      `POST` → 308 to `https://dev.puni.dev/probe?x=1`; HTTPS 404 for an unrouted host;
      "every Traefik edge case passed", exit 0.
- [x] Rehearsal negative: with the first phase's floor set to 0 instead of 1024, the run
      threw `Traefik did not log permission denied with the floor at 1024` after its
      deadline (see §3).
- [ ] The rehearsal in CI (`infra-check.yml` `k3s-rehearsal`, without `--import-images`) runs on
      the pull request; not observed here.

**Finding for the plan.** Traefik answers a permanent entry-point redirect with **301** for
`GET` and **308** for other methods (observed in the rehearsal, and `curl -I` gets 308). The
Compose edge's Caddy answers 308. The private plan's live checks ("HTTP→HTTPS 308") and the
`curl -I http://<h4claw>/` expectation must allow 301 for `GET`.

### 1.3 Ingress-node port floor

- [x] `judgeKernelSettings`: with its comparison replaced by `false`, `requires the port floor on ingress hosts only` failed (22 pass / 1 fail).
- [x] The real `tool-fleet:check` rendered the template for both static hosts
      (`k3s-sysctl rendered for 2 static hosts`) and passed; `check:faults` above.
- [ ] QEMU platform lab (`tool-fleet:lab --provider qemu`): **owed**. This host has `/dev/kvm`
      but no QEMU build at the locked prefix (`infra/local/qemu-lab.lock.json`), and the lab
      is not a CI job. The k3d rehearsal proves the mechanism (a host-network pod obeys its
      network namespace's floor), not the role on a real kernel.

### 1.4 Platform docs

- [x] `docs/infra/platform.md` gains "Application sources" and the Traefik paragraph; format
      only.

## 2. Private companion nesting

- [x] `checkout.test.ts`: with the not-ignored throw removed, `refuses a path the public repository does not ignore` failed (8 pass / 1 fail); with the dirty guard disabled,
      `refuses a dirty nested checkout and leaves it untouched` failed (8 pass / 1 fail,
      returned `fast-forwarded`).
- [x] `nested.test.ts`: with the early return removed, `propagates the first failing command`
      failed (4 pass / 1 fail); with the non-ENOENT rethrow removed, `refuses a checkout it cannot inspect rather than reading it as absent` failed (5 pass / 1 fail).
- [x] `private-nesting.test.ts`: each of the five guards disabled in turn (empty list,
      `/private/` line, `private/` path, gitlink, `.gitmodules`) failed exactly its own test
      (6 pass / 1 fail each).
- [x] `gate-workflow.test.ts`: with the CI step renamed away both new cases failed (0 / 2);
      with its `bun run` replaced by `true` the forced-add case failed (1 pass / 1 fail).

## 3. Commands

All on the final tree before commit, uncached:

- `env -u CLAUDECODE bunx nx run-many -t test lint typecheck -p tool-fleet tool-git-hooks tool-private --skip-nx-cache`: exit 0 (tool-fleet 386 tests / 32 files, tool-git-hooks 142 /
  12, tool-private 15 / 2).
- `bunx nx run tool-fleet:check --skip-nx-cache`: exit 0, "every family passed", including
  `k3s-sysctl rendered for 2 static hosts`.
- `bun tools/tool-fleet/src/check-faults.ts`: exit 0, "all 13 families failed on their fault".
- `bun tools/tool-fleet/src/traefik-rehearsal.ts --import-images`: exit 0; its negative (floor 0
  in the first phase) exit 1 with `Traefik did not log permission denied with the floor at 1024`.
- `tools/tool-devsync`: `bun test --preload ../test/scratch/preload.ts --timeout=30000`: 392
  pass / 0 fail (with the new files staged; unstaged, the index checker refuses untracked paths).
- `git ls-files -z | xargs -0 bun run tools/tool-git-hooks/src/hooks/private-nesting.ts`: exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all`: 149 passed, 0 failed.
- Not run: `bin/h2puni-gate.sh` (not requested), the QEMU lab (owed, §1.3), the CI rehearsal.
