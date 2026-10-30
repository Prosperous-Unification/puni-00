# Kubernetes dependency observation config identity

Base: `8415e5338`, isolated worktree `/tmp/puni-k3s-config-identity`, branch
`fix/k3s-config-identity`. This repairs the observed k3s `status.image` form in
CI run `39878782903`: the Job/Pod spec and runtime `imageID` retained the pinned
manifest reference, while `status.image` was the bare config digest. It does not
complete dependency admission, activation or the parent 10.1/10.2 work.

## Behavior and boundaries

`registryImageReader` returns `{ revision, configDigest }` only after verifying
the bytes of the pinned manifest or index, its linux/amd64 child when present,
and the named config. Config descriptors require `sha256:<64 lowercase hex>`.
`registryRevisionReader` retains descriptor admission's existing revision API;
`registryConfigDigestReader` exposes the same verified chain to observations.
All registry fetches and response bodies share the caller's remaining deadline.

`KubectlSettings.readConfigDigest` is optional only for non-observation adapter
consumers. The binary/store observation paths pass it through; an observation
without it throws before any kubectl call. Registry failure, malformed config
identity and an exhausted resolution deadline also refuse before Job creation.
Production CLI composition supplies `PUNI_REGISTRY_AUTH`; the observer does not
read process environment or invent a fallback reader.

A completed Pod's `status.image` must equal either the exact pinned reference or
that reference's exact verified config digest. Runtime `imageID`, the effective
Pod spec, Job/Pod attribution, single-Pod ownership, restart/exit state and the
post-log reinspection retain their independent checks. Config identities are
resolved independently for candidate and previous, including equal image refs.

The F8 lab injects `labConfigDigestReader(port)` for direct observations and its
CLI subprocesses. It rewrites only `k3d-puni-f8-registry:5000` to
`127.0.0.1:<port>`, preserves repository plus digest and supplies no production
authentication. `--lab-registry-port` refuses descriptor mode before preparation;
request mode additionally requires environment `local` and context
`k3d-puni-f8-lab`. Foreign/lookalike authorities are refused before lookup;
wrong repository/digest cannot resolve to the requested image.

Caller audit also found the F11 cutover rehearsal's follow-up release. Its
composition root now supplies `cutoverConfigDigestReader(port)`, separately
restricted to `k3d-puni-f11-registry:5000`. The caller test resolves the real
verified chain and refuses F8/foreign authorities and invalid ports. This avoids
leaving an existing `executeRelease` caller without its required reader.

## TDD and watched production faults

The initial observation tests failed for candidate, previous and store config
status, and missing/failing/malformed/late config readers. Existing behavior
still ignored the supplied reader and created a Job. The initial metadata import
also reported the absent new API; that loader error is not counted as a behavioral
proof. Receipt: `/tmp/k3s-config-red.log`.

Production mutations below ran one at a time and exited 1; every source file was
restored immediately in `finally`. These receipts establish the named observable
failure, rather than treating an arbitrary nonzero exit as sufficient proof.
The command prefix from `tools/tool-deploy` was:

```sh
bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/<suite>.test.ts -t '<filter>'
```

| Fault (receipt suffix)   | Observed failure                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                 | Five negatives accepted wrong config, changed post-log config, missing/malformed status, or an actual registry-verified foreign status with pinned imageID. |
| `runtime`                | Removing runtime digest attribution admitted foreign imageID despite verified config status.                                                                |
| `pod-spec`               | Removing effective-spec equality admitted a foreign Pod image despite verified config status.                                                               |
| `pod-uid`                | Removing Pod UID equality admitted replacement after logs despite verified config status.                                                                   |
| `config-required`        | A fallback identity admitted an observation with no reader.                                                                                                 |
| `config-lookup`          | A constant identity admitted reader failure, malformed identity and a delayed valid identity.                                                               |
| `config-syntax`          | Removing the returned digest check admitted the malformed reader with otherwise pinned status.                                                              |
| `config-deadline`        | Resetting the observation deadline after resolution admitted a valid identity delayed beyond the Job budget.                                                |
| `registry-hash`          | Removing hash equality independently admitted corrupted index, child manifest and config bytes.                                                             |
| `registry-config`        | Removing config-descriptor validation changed missing/malformed-config refusals into the later fetch-boundary error; other integrity checks still refused.  |
| `registry-child-syntax`  | Removing digest syntax validation attempted a malformed child lookup instead of refusing before the request.                                                |
| `registry-budget-syntax` | Removing budget validation lost the named nonpositive/fractional/non-finite deadline refusals.                                                              |
| `registry-deadline`      | Replacing the single caller budget with 60 seconds admitted the delayed chain.                                                                              |
| `registry-body-deadline` | Replacing the fetch signal budget with 60 seconds admitted the delayed config body.                                                                         |
| `adapter-store`          | Removing store-reader forwarding loses the injected store config refusal before kubectl.                                                                    |
| `cutover-authority`      | Removing F11 authority validation attempted foreign registry lookup instead of the required early refusal.                                                  |
| `cutover-port`           | Removing F11 port validation returned readers for all five invalid ports.                                                                                   |
| `adapter-config`         | Substituting one config for both roles failed distinct candidate/previous config attribution through `kubectlEffects`.                                      |
| `lab-authority`          | Removing authority validation attempted foreign DNS lookup instead of the required early refusal.                                                           |
| `lab-repository`         | Changing the repository during mapping admitted a different requested repository.                                                                           |
| `lab-port`               | Removing port validation returned readers for all five invalid ports.                                                                                       |
| `cli-scope`              | Removing request scope accepted production and foreign-context lab redirects.                                                                               |
| `cli-descriptor`         | Removing the early descriptor refusal reached the absent kubectl executable.                                                                                |

Receipts are `/tmp/k3s-config-fault-<suffix>.log`. Adjacent `Proof:` comments name
these faults at the changed production checks. Existing guard proofs also remain
in [the binary-preflight record](verify-k8s-binary-preflight.md) and
[the observation record](verify-k8s-dependency-observation.md).

The final suite additionally uses a real loopback registry and production config
reader to accept the bare config status and reject a well-formed foreign config
status while preserving the pinned `imageID`. It covers each role, missing and
malformed status, post-log replacement, registry hash corruption, absent config,
reader failure/deadline, distinct adapter configs and lab mapping. The existing
backend capability and store scanner fixtures execute the real emitted commands;
they do not execute the container image in Kubernetes.

## Verification and limits

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, independent locked
  worktree dependencies; no lockfile change. A preliminary shared-dependency
  symlink produced the wrong Drizzle migrator API and sandbox loopback sockets
  were denied; the symlinks were removed, then the isolated baseline passed
  **92 tests, 0 failures** with loopback permission.
- A six-suite checkpoint passed **234 tests, 0 failed, 623 assertions**. A later
  **235-test** run passed 234 and failed only the new store-forwarding test's
  assertion that the log file was absent. The fixture creates an empty log
  upfront; the no-call assertion was corrected to require exact empty contents.
  Its injected reader-error assertion already passed. Final rerun evidence is
  recorded below.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=lint,typecheck --projects=tool-deploy --outputStyle=stream`:
  configured targets passed uncached. The initial run failed import ordering and
  `require-await` style checks; those were corrected before the passing runs.
- Final restored core command from `tools/tool-deploy`:
  `bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/dependency-observation.test.ts src/k8s/registry.test.ts src/k8s/lab-registry.test.ts src/k8s/lab-diagnostics.test.ts src/k8s/deploy-k3s.test.ts`:
  **144 passed, 0 failed, 290 assertions** (6.02s).
- Final restored adapter command:
  `bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/execute-adapter.test.ts -t 'dependency observations through kubectlEffects|release binary preflight'`:
  **35 passed, 0 failed, 181 assertions** (29.21s), including store-reader
  forwarding and the mounted release preflight. The other 63 adapter tests were
  filtered out in this final run; the earlier broad checkpoints cover them.
  Receipts: `/tmp/k3s-config-final-core.log`,
  `/tmp/k3s-config-final-adapter.log`.
- Changed-file `bunx prettier --check`: exit 0; `git diff --check`: exit 0.
  Final added-test ESLint also passed. The full configured lint target passed
  after F11 wiring; a final uncached `nx run tool-deploy:typecheck --skip-nx-cache` passed after the last added test.
- `bunx openspec validate --all --json`: exit 0, **271/271** items valid. This
  validates the isolated change state; the parent owns the amended delta-spec
  wording and integration validation.

No full configured tool-deploy test target, real k3s lab, exact-SHA h2/h4 host gate, full workspace CI, deploy, push or
merge was performed. The local fixtures do not establish live admission,
container execution, platform behavior beyond the observed CI failure, recursive
mount enforcement or successful deployment. Parent review and fresh k3s CI remain
required before claiming the live failure repaired.
