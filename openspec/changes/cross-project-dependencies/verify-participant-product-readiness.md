# Private product readiness composition

This slice composes the canonical reviewed product observer with exact selected
network/listener/address joins, actual direct HTTP, semantic backend health and
capability, repeated full process observations, fresh store/artifact/evidence
checks, maintenance ingress and original consumed-context validation. It never
starts a participant, constructs a context, grants activation, restores a policy
or claims full participant restoration. The private controller and source
four-role validator remain separate unfinished work.

Every HTTP response is immediately followed by the real observer's private
no-rebind observation and verified helper cleanup. Product BE health requires
explicit commit:null, with image/source provenance independently retained by the
canonical observer. GW listener health does not substitute for its independently
pinned role/configuration/backend binding. Capability and health bodies persist
only as hashes. Fixed errors discard private causes.

## Test attribution and isolation

The isolated cases reuse the approved observer model child. They supply modeled
Docker/proc bytes at existing raw IO boundaries, use actual scratch SQLite and
original prepare/consume/owner scope, and serve actual HTTP on fixed role ports
3100/3200. Canonical process/namespace/listener validation runs unchanged. No model
observation becomes a native image/process/readiness acceptance claim.

A separate fixed healthy byte peer routes every readiness observation through
actual `runDockerExec`: real NUL stream, ACK, input EOF, REAPED, native child PID,
exit and both pipe readers. The peer spawns no descendants, caps receipt input at
32MiB and ACK input at 129 bytes, requires EOF, and has an independent five-second
SIGALRM lifetime. Each 310-second model parent gives its child at most 300 seconds
and reserves at least ten seconds from its original deadline for cleanup. It does
not reuse the existing 16-case parent's 1440-second budget.

The original 16 cases stay selected by their `modeled ` prefix and retain their
exact ordered case-list/footer checks, with exactly three readiness registrations
filtered. Each readiness child requires its one exact selected case and exactly
18 filtered registrations (16 observer cases and the other two readiness cases).
Ordinary collection's actual proc-reader sentinels remain intact. Root's separate
approved reporter normalization is deliberately not mixed into this source slice.

## Fresh evidence

Bun 1.4.4, branch base `2ae61653a296c771d4f835a23f149275083d580b`
(reviewed integration base `376e78c7f3b607d97f9203c9b1172f61d7b2db40`).

- Initial q1 root replay: 0 pass / 3 fail, 198.63s; all failed the new local-return
  settlement assertion. The legacy successful model directly fed tokens and had
  no native child-return observation. That failure was preserved; settlement
  assertions were not removed. `/tmp/puni-readiness-root-replay-q1.log` and its
  explicit terminal record document that scope. An earlier restricted run failed
  EPERM on owned loopback bind before preparation.
- Corrected healthy peer plus model runner controls: 16 pass / 51 assertions,
  5.28s, `/tmp/puni-readiness-q2-controls.log`. The missing-EOF case observed actual
  SIGALRM at about five seconds before a separate seven-second fallback watchdog;
  wrong ACK produced exit77 without REAPED. Missing, misresolved, changed-content,
  replaced-inode and wrong-mode peers refused before dispatch. Initial restricted
  pipe-write EPERM is retained in `/tmp/puni-readiness-peer-green.log`; identical
  narrowly authorized local-only replay passed `/tmp/puni-readiness-peer-local.log`.
- Configured uncached actual Nx graph lint/type/build: 8 tasks pass, 22.4s,
  `/tmp/puni-readiness-q2-static-final.log`.
- Root q2 frozen replay: **3 outer cases / 27 assertions, 0 fail, 178.33386s**.
  The three isolated named children passed **187 + 145 + 153 = 485 assertions**,
  each exactly one selected case and 18 filtered registrations. All six frozen
  hashes stayed unchanged. `/tmp/puni-readiness-root-replay-q2.log` and
  `/tmp/puni-readiness-root-replay-q2-exit.json`.
- Independent actual production-call omissions: removing the immediate observer
  after health caused forbidden capability HTTP (Expected0 / Received1); removing
  the observer after capability let changed process identity return readiness
  (Missing expected rejection). Root watched both RED and restored the original
  file exactly in 129.357s. `/tmp/puni-readiness-watch-after-health.log`,
  `/tmp/puni-readiness-watch-after-capability.log`, and
  `/tmp/puni-readiness-root-bracket-watches-exit.json`.

## Remaining limits

No full P2b3 wrapper, controller/phase acceptance, native Docker/image process
profile, source four-role startup/output profile, StageB execution, policy handoff
or ordinary controller adoption is claimed. Source remains unsupported/unmeasured.
No Docker daemon, SSH, privileged namespace, host deployment, CI dispatch or remote
gate was run by this actor. Root owns final integration and remote gates.

## Restored and final checks

- Root restored both drift negatives after the independent omissions: **2 outer
  cases / 18 assertions**, **2 inner cases / 298 assertions**, 122.843s, all six
  source hashes unchanged; `/tmp/puni-readiness-root-brackets-restored.log` and
  its explicit terminal JSON.
- Root actual-host boundary case: **1 test / 131 assertions, 80.235s**. It used
  genuine preparation and actual host proc/NSpid, rejected before HTTP or root
  exec, and rejected copied context with no extra IO;
  `/tmp/puni-readiness-root-actual-host-refusal.log` and its terminal JSON. This
  does not establish successful native product process or image admission.
- Additional fixed peer omission proofs: bypass ACK comparison and omit EOF each
  emitted ordinary successful REAPED and failed the expected nonzero oracle;
  omit its five-second alarm and the independent seven-second watchdog killed
  it with SIGKILL instead of SIGALRM; omit private-mode checking and mode0755 was
  dispatched with exit0. `/tmp/puni-readiness-peer-watch-{ack,eof,timer,mode}.log`,
  summary `/tmp/puni-readiness-peer-watches.log`. The script restored the exact
  fixture source in `finally`. None invoked a Docker daemon or another peer child.

Adjacent Proof comments were added only after these observed outcomes. They change
no executed protocol/observer behavior. Independent untracked opener/controller
drafts were set aside for the final configured checks and commit; they are not
part of this packet.

Final packet-only configured replay after proof comments/restoration: **8 uncached
Nx tasks pass, 19.3s**, `/tmp/puni-readiness-packet-static-final.log`. Root's six
runtime/test files plus this receipt were the only pending packet paths; the four
independent opener/controller drafts were outside the project for this check.
The actual readiness entry bundled **243 modules** and imported without actions,
`/tmp/puni-readiness-bundle.log`. OpenSpec validated **285 items, 0 failed**,
`/tmp/puni-readiness-openspec.log`. Restored peer/model controls passed again:
**16 tests / 51 assertions**, `/tmp/puni-readiness-packet-controls-final.log`.

Commands (Bun 1.4.4 on PATH):

```sh
bun test tools/tool-remote-scripts/src/lib/dependency-product-process-model.test.ts -t 'isolated readiness actual HTTP'
bun test tools/tool-remote-scripts/src/lib/dependency-product-readiness.test.ts
python3 /tmp/puni-watch-readiness-brackets.py
python3 /tmp/puni-watch-readiness-peer.py
NX_DAEMON=false bun x nx run-many -t lint,typecheck,build -p tool-remote-scripts --skip-nx-cache --output-style=static
bun build tools/tool-remote-scripts/src/lib/dependency-participant-readiness.ts --target=bun --outfile /tmp/puni-product-readiness-bundle.js
bun x openspec validate --all --json
```
