# Task 10.2 effective supervisor identity: planning and ambient feasibility

2026-10-23. Base `b2a9f1bb1`; isolated worktree `/tmp/puni-supervisor-ambient-packet`. This verifies only the disposable ambient startup slice and planning packet. The production identity protocol and actual unit policy are unimplemented. Parent Task 10.2 remains open; this is not an archive/activation/adoption acceptance.

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
bun openspec/changes/cross-project-dependencies/effective-supervisor-identity/evidence/ambient-spike.mjs
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

No production runtime code, unit, installer or service was changed or run. No service install/start/restart, Docker operation, deployment, activation, adoption, full Nx gate, h2 gate, push or PR was performed. Full project tests, lint/typecheck/build and full CI are skipped for this docs/disposable experiment packet; normal scoped hooks and explicit formatting are separate limited checks. No independent Astra review or integrated exact-SHA host acceptance is claimed. Remaining tasks block archive and Task 10.2 completion.

## Astra namespace correction after 08a5cedb

The review identified that a Docker backend's private PID namespace cannot compare the host listener's kernel peer PID to the host systemd MainPID. The corrected design preserves both host installer MainPID/UID checks, and adds unchecked Task 1.3 before production implementation: demonstrate and review namespace-compatible public-client authentication and trusted expectation refresh. Legitimate authenticated request, foreign same-UID listener, replay, restart, stale/unavailable/raced refresh and refusal-before-work cases are required. PID 0 or UID alone is insufficient; sharing host PIDs or giving the backend systemd/host authority is prohibited. No replacement authentication protocol is chosen or claimed proven. Actual generated-unit policy gate 1.2 also remains open.

A disposable pinned-runtime probe uses the actual `readSupervisorPeerCredentials` helper with a host listener, then a client launched through `/usr/bin/unshare --user --map-current-user --pid --fork`. Both client connections use actual Bun.connect and raw kernel getsockopt; no payload PID establishes the raw credentials. The host control sees the independently observed listener process PID. The private-namespace client observes raw PID 0 with UID 1000, and asserts that the existing production helper rejects that invisible PID rather than weakening it.

```sh
bun openspec/changes/cross-project-dependencies/effective-supervisor-identity/evidence/namespace-spike.mjs
```

Exit 0; [exact output](evidence/namespace.log):

```text
READY 2781123
{"name":"host","exit":0,"clientPid":2781163,"serverPid":2781123,"serverUid":1000}
{"name":"private-pid-namespace","exit":0,"stdout":"{\"clientPid\":1,\"serverPid\":0,\"serverUid\":1000}","stderr":""}
PASS host SO_PEERCRED equals host listener PID; private PID namespace observes 0 and production credential helper refuses
```

The initial sandbox run denied disposable Unix listen with EPERM; narrowly scoped execution approval permitted only this fixture outside that socket restriction. The probe owns a private mkdtemp directory, bounds its server to fifteen seconds and each client to five seconds, and terminates the listener/removes its directory in finally. No Docker daemon or production service was used. This establishes the PID-visibility mismatch using a private user/PID namespace; it is not the actual Docker runtime-directory mount or a completed request/authentication/refresh proof, so Task 1.3 stays unchecked. No production safety check is added or changed; there is no new production R5 claim. Scoped fixture ESLint passes. Fresh explicit packet-file formatting and git diff --check pass; fresh structural validation reports 274 items, 274 passed, 0 failed. Normal commit hooks remain enabled for the correction commit.
