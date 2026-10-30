# Proposed solver supervisor identity broker: provenance and feasibility

2026-10-23. Base `b2a9f1bb1`; isolated worktree `/tmp/puni-supervisor-ambient-packet`. Status: proposed separate followup, outside cross-project-dependencies delivery. This records the planning packet and explicitly bounded disposable feasibility evidence only. The production identity protocol, root broker/provisioning and actual unit policies are unimplemented. Parent Task 10.2 remains open; this is not an archive/activation/adoption acceptance.

## Runtime and commands

Fresh runtime output:

```text
bun --version
1.4.2
sha256sum /home/df/.bun/bin/bun
a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c  /home/df/.bun/bin/bun
```

`readelf -l` identified `/lib64/ld-linux-x86-64.so.2` as interpreter. `readelf -d` listed libc, loader, pthread, dl and m dependencies. `/usr/bin/cc` compiled only a disposable constructor-marker shared library, removed with the fixture. Existing node_modules is reused by symlink to the root checkout; no frozen dependency install or dependency reproducibility claim.

Run from the isolated worktree:

```sh
bun openspec/changes/solver-supervisor-identity-broker/evidence/ambient-spike.mjs
```

Exit 0. [Exact output](evidence/ambient.log) ends:

```text
PASS pinned ambient controls; removing environment/config policy admits measured faults; no unit lifecycle exercised
```

The fixture runs each child with a five-second process timeout and a disposable cwd/home. Baseline env explicitly sets only HOME, PATH, LANG and XDG_CONFIG_HOME. Baseline flags are compared with `--config=/dev/null --no-env-file --no-install`; each injected environment is explicit, not inherited from the invoking shell.

## Measured startup inputs

| Input                                                                  | Actual observation on pinned Bun                                                                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| cwd bunfig `preload`                                                   | `PRELOAD_EXECUTED` stderr and changed bootstrap global; explicit `/dev/null` config excludes it                                                     |
| `BUN_OPTIONS=--require=<fixture>`                                      | Executes preload before the constant `-e` body, even with explicit config flags when retained                                                       |
| `NODE_OPTIONS=--require=<fixture>`                                     | No preload effect in the tested form; initial contrary assumption failed and was corrected, retained in [discovery-red](evidence/discovery-red.log) |
| `BUN_CONFIG`, `BUN_CONFIG_PATH` set to preload config path             | No preload effect; these are tested candidate names, not established config-path interfaces                                                         |
| `BUN_CONFIG_REGISTRY=<fixture path>`, `BUN_CONFIG_MAX_HTTP_REQUESTS=1` | No preload effect in the offline bootstrap; this says nothing about their network/install semantics                                                 |
| `$HOME/.bunfig.toml`, `$XDG_CONFIG_HOME/bun/bunfig.toml`               | No preload effect for these tested paths and `-e` invocation                                                                                        |
| cwd `.env`                                                             | Changes visible AMBIENT_DOTENV; `--no-env-file` excludes it                                                                                         |
| `LD_PRELOAD=<constructor .so>`                                         | Constructor marker appears before Bun bootstrap; clean child env excludes it                                                                        |
| `LD_LIBRARY_PATH=<directory>`                                          | Empty directory has no marker; shadow malformed `libm.so.6` prevents Bun startup with exit 127 and a named loader error                             |
| `LD_AUDIT=<absent .so>`                                                | Loader emits ignored-audit diagnostic even though Bun exits 0; exit status alone would miss this influence                                          |
| existing local package under `--no-install`                            | Resolves and executes `PACKAGE_EXECUTED`; no-install does not close the bundle's import graph                                                       |

`strings` also exposes other `BUN_CONFIG_*` names in this binary; those were not all behaviorally tested. This packet does not infer a complete startup-input inventory from strings or from the absence of a marker. It proves the listed effective faults and requires actual unit/environment closure in slice 1.2. No registry/network request was necessary.

## Watched faults

Each command used the same real Bun startup fixture with one policy removed; each failed with exit 1 and AssertionError. This is spike-path evidence, not production-path R5 coverage; no production check was added.

| Removed control                                  | Test that failed                         | Exact output                                          |
| ------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| Clean child environment; retain BUN_OPTIONS      | `environment-policy` baseline equality   | [mutant environment](evidence/mutant-environment.log) |
| Explicit `/dev/null` config; discover cwd bunfig | `explicit-null-config` empty stderr      | [mutant config](evidence/mutant-config.log)           |
| `--no-env-file`                                  | `no-env-file` baseline equality          | [mutant dotenv](evidence/mutant-dotenv.log)           |
| Clean loader environment; retain LD_PRELOAD      | `loader-environment-policy` empty stderr | [mutant loader](evidence/mutant-loader.log)           |

Reproduce by appending `--mutant=environment`, `--mutant=config`, `--mutant=dotenv` or `--mutant=loader` to the command above. Adjacent Proof comments identify the injected fault. Each process removes its own fixture in finally; no tracked production source is mutated.

## Structural and scoped checks

`bun node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` exited 0. [Exact full JSON](evidence/openspec-all.json):

```json
{
  "totals": { "items": 274, "passed": 274, "failed": 0 },
  "byType": {
    "change": { "items": 256, "passed": 256, "failed": 0 },
    "spec": { "items": 18, "passed": 18, "failed": 0 }
  }
}
```

Every item has valid=true. Existing warning-level findings remain; no invalid item is hidden. This packet adds requirements to the existing parent delta and keeps its separate intent/design/ordered tasks under that same change; no second OpenSpec change or main-spec sync is performed.

Explicit packet-file Prettier check exited 0 with `All matched files use Prettier code style!`; `git diff --check` exited 0 with no output. Scoped ESLint for the disposable `.mjs` fixture exited 0 with no output. The first commit attempt correctly failed lint because an evidence `.ts` outside any tsconfig was not found by the project service; the fixture was converted to plain `.mjs` with explicit builtin imports, without widening lint configuration. The spike and all four mutants were rerun successfully in that final form. Normal repository hooks remain enabled. A clean commit SHA is reported after commit; the packet's own verification text cannot include its own hash without changing it.

## Remaining gates and limitations

Only slice 1.1 is complete. Slices 1.2 and 1.3 are mandatory pre-implementation P1 gates. Slice 1.2 requires: real generated unit literal bootstrap argv and effective pre-exec environment policy under a disposable user manager, including independently removed unit controls. Clean Bun.spawn env is not proof about systemd UnsetEnvironment, manager inheritance, drop-ins or the actual service. The draft unit policy is explicitly provisional pending that experiment.

All protocol slices remain unchecked: captured bundle/config production loader, `/proc/self/exe` production identity, private nonce readiness, both host installer socket kernel peer bindings, namespace-compatible public client authentication/expectation refresh and pre-send admission, typed before/after systemd properties, bounded convergence, final hashes under retained admission and composed failures. Existing prior-spike evidence is [snapshotted](evidence/prior-identity-spike.md) with its original distinct source SHA and limitations; none of it is relabeled as current production acceptance.

No production runtime code, unit, installer or service was changed or run. No service install/start/restart, Docker operation, deployment, activation, adoption, full Nx gate, h2 gate, push or PR was performed. Full project tests, lint/typecheck/build and full CI are skipped for this docs/disposable experiment packet; normal scoped hooks and explicit formatting are separate limited checks. No independent Astra review or integrated exact-SHA host acceptance is claimed. Remaining followup tasks block this proposal's archive, not cross-project-dependencies delivery. Parent continuous exclusion and restoration have their own still-open acceptance.

## Astra namespace correction after 08a5cedb

The review identified that a Docker backend's private PID namespace cannot compare the host listener's kernel peer PID to the host systemd MainPID. The corrected design preserves both host installer MainPID/UID checks, and adds unchecked Task 1.3 before production implementation: demonstrate and review namespace-compatible public-client authentication and trusted expectation refresh. Legitimate authenticated request, foreign same-UID listener, replay, restart, stale/unavailable/raced refresh and refusal-before-work cases are required. PID 0 or UID alone is insufficient; sharing host PIDs or giving the backend systemd/host authority is prohibited. At that correction stage no replacement authentication protocol was chosen or claimed proven; the subsequent broker design section below records the new preference, still unimplemented. Actual generated-unit policy gate 1.2 also remains open.

A disposable pinned-runtime probe uses the actual `readSupervisorPeerCredentials` helper with a host listener, then a client launched through `/usr/bin/unshare --user --map-current-user --pid --fork`. Both client connections use actual Bun.connect and raw kernel getsockopt; no payload PID establishes the raw credentials. The host control sees the independently observed listener process PID. The private-namespace client observes raw PID 0 with UID 1000, and asserts that the existing production helper rejects that invisible PID rather than weakening it.

```sh
bun openspec/changes/solver-supervisor-identity-broker/evidence/namespace-spike.mjs
```

Exit 0; [exact output](evidence/namespace.log):

```text
READY 2781123
{"name":"host","exit":0,"clientPid":2781163,"serverPid":2781123,"serverUid":1000}
{"name":"private-pid-namespace","exit":0,"stdout":"{\"clientPid\":1,\"serverPid\":0,\"serverUid\":1000}","stderr":""}
PASS host SO_PEERCRED equals host listener PID; private PID namespace observes 0 and production credential helper refuses
```

The initial sandbox run denied disposable Unix listen with EPERM; narrowly scoped execution approval permitted only this fixture outside that socket restriction. The probe owns a private mkdtemp directory, bounds its server to fifteen seconds and each client to five seconds, and terminates the listener/removes its directory in finally. No Docker daemon or production service was used. This establishes the PID-visibility mismatch using a private user/PID namespace; it is not the actual Docker runtime-directory mount or a completed request/authentication/refresh proof, so Task 1.3 stays unchecked. No production safety check is added or changed; there is no new production R5 claim. Scoped fixture ESLint passes. Fresh explicit packet-file formatting and git diff --check pass; fresh structural validation reports 274 items, 274 passed, 0 failed. Normal commit hooks remain enabled for the correction commit.

## Root-owned online broker design extension after 52afcb19

Source recommendation: `/tmp/puni-namespace-identity-recommendation.md`, supplied by Astra and read in full. Preferred architecture is now the independently root-owned online broker, as recorded in proposed ADR 0062; the alternatives live in that ADR. This is a privilege/deployment expansion: protected root code/runtime/ancestors, approved admission baseline, root private broker key, public pin provisioning/rotation, and per-node authority are later privileged operations requiring owner-provided credentials and explicit operational acceptance. No root files, unit, key, mount, broker or baseline were provisioned by this packet.

Design/spec/tasks now require nonce-bound resolve → pinned solver TLS hello → same-session confirm-current → start, fresh host bracketed observations against independently approved identities, zero unauthenticated start/create/runner calls, finite deadlines/retries and complete failed-attempt cleanup. Both host installer SO_PEERCRED MainPID/UID probes, captured execution/config buffers, proc executable identity and final four-artifact readback under installer edge.lock remain mandatory. The broker cannot acquire that lock or perform lifecycle/adoption actions. Docker generated production/dev surfaces and k3s base/overlay/generated desired/live/admission/node authority are separate acceptance slices, including explicitly read-only base solver runtime and dedicated public-trust/broker-runtime directory mounts.

The local TLS probe was supplied evidence, not rerun here. Its [restored log](evidence/tls-feasibility-supplied.log) reports Bun 1.4.2 real same-namespace Unix TLS: admitted exact leaf received five work bytes; foreign and TLS-authorized-but-wrong leaf each received zero; accepted TLS sockets exposed fd and kernel credentials. Astra reports that removing exact pin admitted five work bytes and failed the acceptance, but this packet has no raw mutation log and does not claim independently watched production proof. The evidence does not implement broker resolve/confirm, root path/key protection, actual Docker PID boundary, expectation refresh, generated units or deployment provisioning. The probe's openssl use is not a selected production dependency; `socket.getProtocol()` is not assumed available on pinned Bun. No keys or executable fixture from that external experiment are copied here.

Only the existing disposable ambient slice 1.1 remains checked. Generated supervisor/broker units, Docker/broker gate 1.3, every production slice, root provisioning, k3s acceptance and parent Task 10.2 remain unchecked. Existing historical feasibility observations retain their original source/version context. No new production guard is added, so no new production R5 completion claim is made; all future guards have named production-path negatives and watched-removal tasks.

ADR numbering was checked after fresh `git fetch --no-tags origin main` (exit 0). At `origin/main` e70166d28f64d0ebb81069a57ef169edd182c8f5, the highest ADR was 0056; at the feature branch and this isolated HEAD, highest was 0057. ADR 0058 was absent from all three tracked trees before addition. Fresh checks for this design extension: intent 321 words; `openspec validate --all --json` exited 0 with 274 items, 274 passed, 0 failed, all valid=true ([full current output](evidence/openspec-all.json)); explicit Prettier exited 0 with `All matched files use Prettier code style!`; local Markdown target existence checks passed; `git diff --check` exited 0 with no output. Normal commit hooks remain enabled. The supplied TLS fixture SHA256 was `a3e4c43cb5ade4046419967e118e1eb4b919dc1009a3e3608df74544930f8bfd`; copied restored-log SHA256 was `0f028803b2f2a4fd7aced73b8580ddda4c8eb29b9a9fa1fe49fea59b31375b03`. These are provenance, not execution or production acceptance. Full runtime test/lint/typecheck/build, actual units, Docker/k3s/provisioning, independent final Astra review and host gate are unverified; this docs-only extension performs no production code edits, h2 operations, activation, adoption, push or PR.

## Astra P2 lifetime and final-confirmation corrections after e307eed5

The private observer is now explicitly invocation-lifetime: installer completion does not consume its listener. Every installer/broker query opens a connection with a fresh observer nonce and bounded isolated state; query completion closes that connection and discards only query state. Shutdown/restart closes the old listener and removes invocation-owned paths. Ordered acceptance now requires installer → repeated/multiple/concurrent broker-client observations → restart cleanup; these production tests remain unchecked.

The baseline/policy race contract now ends at the final confirmation observation. An update observed through confirmation refuses stale admission; an update after confirmation while the authenticated supervisor remains alive does not instantly revoke that confirmed connection, which can start within the existing deadline/state. Later observations must use current authority and refuse a now-unapproved tuple. The design/spec/TDD tasks distinguish these two timings and preserve supervisor death/reconnect refusal; no serialized online revocation mechanism or stronger future-availability promise is added.

This is documentation only. No protocol, production guard, service, root provisioning, Docker/k3s test or h2 operation was performed. Generated-unit/broker/container/provisioning acceptance and parent Task 10.2 remain unchecked. Fresh OpenSpec all exited 0 with 274 items, 274 passed, 0 failed and every valid=true ([recorded output](evidence/openspec-all.json)). Intent is 338 words. All packet-local Markdown targets exist. Explicit changed-file Prettier and git diff --check pass; normal hooks remain enabled.

## Delivery-scope reconciliation after Astra approval of 899db844

Astra approved the bounded design and decided that the broker is a separate proposed followup, not the cross-project-dependencies critical path. This change moves the complete intent/design/tasks/verify/evidence packet and its identity requirements from the parent into `solver-supervisor-identity-broker`, preserving history and unchecked production/root/unit/Docker/k3s gates. Prior source SHAs and command outputs remain historical evidence; source command paths above are updated for reproduction after the move, while raw prior logs preserve their original paths. Observer lifetime, final-confirmation freshness boundary and no instant online revocation remain unchanged. No feasibility runtime was rerun for this docs reconciliation.

The parent retains its supervisor installation/shared-edge admission requirements. It instead names actual solver stop/drain/request closure, effective restart/installer/launch fencing, continuous complete participant exclusion through pre-exposure recheck, and independently pinned compatible restoration. New ordered parent S1–S4 production acceptance tasks remain unchecked. ADR 0064 monotone activation and attended recovery remain binding; ADR 0062 is proposed only for this followup, and new ADR 0063 records the delivery-scope decision without weakening exclusion. No production controller, fence, provisioning or restoration is claimed implemented.

After fresh origin/main fetch, ADR 0059 was absent in origin/main, feature branch and isolated HEAD. Proposed followup slug was created successfully by OpenSpec, and its new capability is `solver-supervisor-identity`. Fresh `openspec validate --all --json` exited 0: 275 items, 275 passed, 0 failed and all valid=true ([scope reconciliation output](evidence/reconciliation-openspec-all.json)). Followup intent is 349 words. Followup and ADR local Markdown targets and the relocated namespace fixture import resolve. Explicit changed-file formatting, scoped fixture lint and packet diff checks pass; normal hooks remain enabled. Production test/lint/typecheck/build, actual stop/drain/fences/restoration, full host gate, provisioning and rollout remain unverified. No production edits, h2 operations, push or PR occurred.
