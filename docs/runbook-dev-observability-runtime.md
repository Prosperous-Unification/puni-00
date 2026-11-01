# Dev observer operation and retained-store rollback

## Source contract for common-stack route operations

Task79 adds an observer-local one-shot route operation. Its source fixtures do
not establish full common-stack rehearsal, candidate acceptance or permission to
activate a live route. The full reviewed acceptance cohort is currently absent;
the canonical4.1/4.2 tasks remain open. Existing h1→h4 alias access does not prove
that Fleet's separately required pinned known-hosts and existing agent socket are
configured on h1. No kubeconfig, key, binding or credential is installed by this
command. Inventory that existing access before planning actual use.

Build the exact reviewed Fleet `observability-route-cli.ts` locally with pinned
Bun1.4.4, `--compile --target=bun-linux-x64` and
`--define 'PUNI_ROUTE_SOURCE_REVISION="<full-reviewed-source-sha>"'`. Hash the
compiled executable and independently review that source/bundle mapping. The
request's `adapterRevision` and `adapterBundleSHA256` must match the actual
operation executable. Its canary identifies that operation producer revision,
separately from the unchanged observer binary/manifest revision. Never build on
h1claw. Strict-arity smoke verifies packaging only, not a working live operation.

The compiled executable runs as the existing observer user on the observed
observer host. The reviewed private request pins the actual hostname/user/home,
observer source/binary/manifest/tunnel hashes, source container/application
revision, current/target routes, original history receipt/digest, preserved
Grafana journal and preflight inputs. The local unit fragment, loaded ExecStart,
drop-ins, reload state, process executable/argv, initialized checkpoint and actual
source are inspected rather than inferred from those pins. Frozen bootstrap
preflight and default unit rendering remain unchanged.

Candidate bindings must already exist, owner-private, under the owned
`.local/state/puni-dev-observability/bindings/` directory. The three files are
`otlp.json`, `elastic.json` and `prometheus.json`; ingest uses verified mTLS and
queries use verified TLS/basic identity. Retained legacy loopback routes are
explicitly supported only as the old/recovery path. Receipts bind credential-free
route/principal/trust identities; they never contain Secret bodies or
password/private-key hashes.

The independent full acceptance cohort has separate exact rehearsal and staged
target/source/controller/store/claim/route/artifact bindings. All required checks
also bind the immutable selected controller/resource and Git source pins, node
UID/machine identity and workload replica UIDs through `selection`. A recreated
instance needs newly reviewed evidence even when its fresh preflight is Ready.
Only the fetched GitRepository head is excluded from `selection`; its immutable
kind/name/namespace/UID remain bound and fresh preflight validates the independently
refreshed live-head pin. Applied resource/controller revisions stay bound. A fetched
unapplied main advance may reuse acceptance; an applied revision change requires
new review even when UIDs and candidate artifacts are unchanged. Current preflight
does not prove semantic equivalence of controller/chart/config changes.
The parent preflight join uses that same repository identity: restore can refresh
the fetched head while every other prior pin stays exact. A newly reviewed foreign
repository UID still cannot be adopted through restore.
Each cohort member must start within the reviewed `maxAgeMs`; captures and both
windows lie inside it, so a recent completion cannot freshen old checks. Neutral
controller-convergence/effective-workload-isolation categories require this
adapter's explicit Flux/effective-Pod `providerCheck` projections. The checks
link bounded private command captures, successful command outcomes, reviewed
projections and raw output digests. Both advancing windows link actual stored
log/metric/trace evidence and query artifacts. Missing, changed, stale, failed,
source-only or component-class captures cannot replace that cohort. This is
explicitly operator-reviewed evidence: hashes and private permissions protect
against drift, not an authorized operator inventing evidence. Full acceptance
collection in the existing rehearsal path remains pending.

After independently reviewing those exact inputs, the executable's operation
forms are `switch <private-request>`, `rollback <private-request>` and
`restore <private-request>`. Forward operations rerun full fresh cutover
preflight. Rollback instead checks the captured retained Docker/container/volume
identities and real old-route/source health, so candidate/Kubernetes failure does
not prevent recovery. Neither inventory mode nor a whitelist of readiness
blockers authorizes rollback.

The current observer checkpoint may never have existed in candidate or retained
stores. Each requested operation can therefore publish one bounded actual-source
canary through the existing probe/publisher to its destination OTLP route, then
await bounded stored-query convergence. It never initializes or overwrites an
existing checkpoint. The canary is distinct from the original frozen historical
witness and from post-restart observer progression. It cannot replace UI,
isolation, auth, alert, recovery or backup acceptance. Its metric names use
`puni_route_canary_*` and an exact `puni_observation_id` selector, preserving
producer scope/version and avoiding interference with continuous observer gauges
or another canary. It never clears another producer's revision series.

Application commits may advance inside the same owned dev container during these
operations. The observer binary and container pins remain fixed; each fresh source
read and completed stored observation records its actual revision. Reviewed cohort
revisions and historical witnesses retain their original values.
Retained-route rollback, compensation and explicit recovery observe two120-second
windows, allowing dormant revision gauges to expire under the existing2m exporter
policy. Actual stored health and strict uniqueness must still pass; elapsed time
does not certify recovery or clear another producer's series.
Forward switch/restore similarly waits at least120s per window even if the reviewed
cohort's minimum interval is shorter. Candidate gauges may retain the staged
revision while the application has already advanced; actual health must still pass.

Each operation reserves a new private `route-<uuid>` directory and a nonwaiting
observer ownership lock. Prepared evidence is synced before mutation, and a
separate mutation-started record precedes unit replacement. The owned
state-root directory entries for receipt/lock reservation are synced before
mutation, including compensation; recovery owner transfer syncs both directories.
The owned
observer unit is replaced/reloaded/restarted. Two advancing stored-health windows,
fresh retained identities and exact original historical queries precede a
durable completed receipt. Old services, stores, volumes, tunnel, Grafana objects
and previous receipts are preserved. A failed forward activation may compensate
only after its current ownership and healthy retained path are established;
that rollback has a distinct receipt and never turns the failed cutover into a
successful cutover.

Timeout, nonzero activation or lost outcome retains uncertainty and its lock.
The error and uncertainty receipt provide exact inspection argv and pinned
`recover` commands for the same executable. Inspect the actual unit and choose
only the command matching its recorded BEFORE or AFTER hash; independently
reconcile ownership before passing the explicit `--reconciled` operand. Recovery
pins the prepared receipt digest, current/prior unit hashes and original owner
PID. Active, denied, reused or unknown owner PIDs refuse. Only known captured
file/loaded-command combinations are recognized, including a lost reload and a
known failed start with MainPID0 and empty control group. Arbitrary third states,
drop-ins, foreign processes and changed source/binary pins refuse.

Recovery keeps `route.lock` continuously present and holds a separate exclusive
lease while reusing fresh retained-route inspection, canary and history checks.
Preparation failure retains original ownership and emits the original pinned
command for retry. After successor preparation and mutation-started evidence are
durable, it archives exact original owner bytes and atomically replaces the owner
record. This explicitly reconciled inactive-owner handoff is the sole owner-record
transition. Known inactive interrupted leases may be archived; active, denied,
foreign or changed leases refuse. Failed final sync/lease cleanup emits the
supported original or successor command without requiring lock edits.
It records a new rollback outcome; the original uncertainty
is not rewritten as completed. Never remove or steal an unknown lock, run an
unsupported inspection subcommand, or replace the unit by blindly copying bytes.

If outcome persistence fails after invocation, the CLI still emits `state:uncertain`,
exact inspection/recovery argv and fixed `persistenceFailures` codes. It reports
`uncertaintyRecorded:false` when that receipt could not be durably written. It
retains ownership and cached prepared authority; it neither dumps private causes
nor claims the failed recording was durable.

Explicit recovery also holds a real nonwaiting Linux `flock` through reclamation,
preparation, owner transfer, mutation and cleanup. It uses Bun's existing FFI to
`libc.so.6` on the stable owner-private `recovery.guard` inode in the state root.
The adapter never removes or replaces that inode; an empty file is not proof the
kernel lock is free. Process death releases physical exclusion. Logical active or
unknown ownership still refuses even when the kernel guard is available. Missing
native support, unsupported host or invalid guard ownership/path refuses before
claiming recovery; there is no fallback or stale-guard removal procedure.

After completed/compensated receipts are durable, a later required cleanup failure
exits nonzero as `state:cleanup-failed`. Its `outcome` names the settled phase and
exact receipts; `receiptInspection` and `inspection` are runnable read-only argv.
`ownershipPath` must be independently reconciled before another operation. No
recover command is emitted against retired ownership, and no owner record is
invented. Earlier pre-completion uncertainty retains its supported pinned retry.

Live status, 2026-10-31: the owned dev observer runs reviewed source
`047e08024b4b1bbba4cb7700400d6f37b0d0ed05`, with continuous resource history in
the existing Prometheus. The initial install/preflight sections below describe
the retained ab4f bootstrap contract. Use the resource-history status below for
the current release; do not apply the frozen bootstrap preflight to an upgrade.

This package adopts the already staged dev releases; it does not bootstrap arbitrary hosts.
Use the reviewed implementation commit from a clean checkout. Builds run locally with Bun
1.4.4, never on h1claw. Retained bootstrap binary `/home/claw/.local/lib/puni-dev-observability/ab4f7cf6e/observer`
has SHA256 `281c51a2542784f8b46df5ad8f7a22ab4f29b738a90b15a7bd1c9937a743374c`.
Its adjacent manifest records the full source revision and local build. Keep that immutable
release, both initialized checkpoints, h1 `baseline.json`, original h3 release `a1ffe27e7`,
candidate h3 release `c811f34bf`, their manifests/baselines, and `evidence/`.
Do not recreate missing checkpoints with the permanent launcher.

## Read-only preflight

The local candidate directory is ephemeral and does not ship with the repository. On a fresh
operator checkout, exclusively create it and copy only the retained immutable h3 release:

```sh
python3 -c 'import pathlib; pathlib.Path("/tmp/puni-dev-release-c811f34bf").mkdir(mode=0o700)' && scp -r -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h3mon:/home/monitor/puni-dev-observability/releases/c811f34bf/. /tmp/puni-dev-release-c811f34bf/
```

A local directory collision refuses. Inspect it rather than overwriting or deleting it; a
partial failed copy is not valid input. From the reviewed checkout, verify the copied files
against fresh authenticated manifest hashes with the read-only command:

```sh
bun tools/tool-observability-stack/src/dev/runtime-cli.ts preflight /tmp/puni-dev-release-c811f34bf
bun tools/tool-observability-stack/src/dev/runtime-cli.ts units
```

Preflight reads actual h3mon and h1claw over authenticated, strict-host-key SSH, and inspects
only `wbs-dev-src` through h1claw's existing h2puni identity. It checks both known hostnames,
current capacity, immutable release hashes and local candidate hashes, the seven preserved
containers/configuration baseline, six dev containers and their images/resources/actual
loopback mappings, six exact volume owner labels, query network identity and alias ownership,
the retained observer binary/manifest/checkpoints, old tunnel hash/PID and linger.
Snapshots must finish within 60 seconds; re-run immediately before each write. An unreadable,
missing, malformed or changed trusted file refuses. Shape validation's `pending` list remains
visible: this command does not prove current endpoint reachability, retention or autonomous
collection. It performs no remote writes and returns no apply authorization token.

Existing owned published ports and the alias on the verified owned Prometheus are allowed;
foreign collisions refuse. Host-listener inspection and Docker mappings are both checked.
The retained checkpoint may legitimately describe stale/incomplete/unavailable history;
that state must remain visible. Launch does not establish healthy collection.

## Install only the two new user units

The parent operator performs these writes after reviewing preflight and unit output. Render
once into a new local directory; do not reuse a staging directory from a different revision:

```sh
bun tools/tool-observability-stack/src/dev/runtime-cli.ts units | python3 -c '
import json,pathlib,sys
units=json.load(sys.stdin)
root=pathlib.Path("/tmp/puni-dev-runtime-units")
root.mkdir(mode=0o700)
for name,content in units.items():
 with (root/name).open("x") as stream: stream.write(content)
 (root/name).chmod(0o600)
'
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h1claw 'mkdir -m 700 /home/claw/.local/lib/puni-dev-observability/runtime-units'
scp /tmp/puni-dev-runtime-units/puni-dev-observability.service /tmp/puni-dev-runtime-units/puni-dev-observability-tunnel.service h1claw:/home/claw/.local/lib/puni-dev-observability/runtime-units/
```

A staging-directory collision requires inspecting its contents; do not delete or overwrite it
blindly. Before activation, on h1claw validate unit syntax and exclusively install named files.
The hard link publishes each complete file atomically and refuses a concurrent collision;
all destination collisions are checked before the first installation. Identical existing units
are accepted. A different existing unit requires separate backup/review, not overwrite:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h1claw 'systemd-analyze --user verify /home/claw/.local/lib/puni-dev-observability/runtime-units/puni-dev-observability.service /home/claw/.local/lib/puni-dev-observability/runtime-units/puni-dev-observability-tunnel.service'
bun tools/tool-observability-stack/src/dev/runtime-cli.ts preflight /tmp/puni-dev-release-c811f34bf
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h1claw python3 - <<'PYINSTALL'
import hashlib,json,os,pathlib
root=pathlib.Path('/home/claw/.local/lib/puni-dev-observability/runtime-units')
target=pathlib.Path('/home/claw/.config/systemd/user')
names=['puni-dev-observability-tunnel.service','puni-dev-observability.service']
old=target/'h3mon-tunnel.service'
assert hashlib.sha256(old.read_bytes()).hexdigest()=='1efb7824b3902a962a5f68b60cd9c384afa651c7ac99d1b8e9350a78a3ac67f4'
for name in names:
 source=root/name
 assert source.is_file() and source.stat().st_mode & 0o777 == 0o600
 if (target/name).exists(): assert (target/name).read_bytes()==source.read_bytes(),name
for name in names:
 if not (target/name).exists(): os.link(root/name,target/name)
PYINSTALL
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h1claw 'systemctl --user daemon-reload && systemctl --user enable --now puni-dev-observability-tunnel.service puni-dev-observability.service'
```

No existing tunnel is restarted. There are only three new forwards, all explicitly bound to
127.0.0.1:14318/19200/19090. `ExitOnForwardFailure` rejects collisions. Known-host verification,
connect timeout, one connection attempt and server-alive limits bound SSH. No credentials are
created, copied or embedded. The observer's source defaults to validated SSH, never rehearsal.

Each unit is limited to 256 MiB, 25% CPU and 32 tasks, with journal rate limiting. Three failed
starts within five minutes exhaust restart attempts; `RestartSec=10s` prevents a tight loop.
SIGTERM reaches the entire cgroup and allows 25 seconds for controlled shutdown. The worker
runs non-overlapping 30-second cycles with a 20-second deadline. `Wants`/`After` lets it publish
explicit unavailable states while its transport reconnects. Service failure and exhaustion
remain visible; they are not silently repaired or treated as a healthy endpoint.

Inspect effective cgroup controls, actual listeners, checkpoints and sustained cycles:

```sh
ssh h1claw 'systemctl --user show puni-dev-observability.service puni-dev-observability-tunnel.service --property=ActiveState,SubState,MainPID,NRestarts,MemoryMax,CPUQuotaPerSecUSec,TasksMax,TimeoutStopUSec,ControlGroup'
ssh h1claw 'ss -H -ltnp; journalctl --user -u puni-dev-observability.service -u puni-dev-observability-tunnel.service --since "5 minutes ago" --no-pager -n 100'
ssh h1claw 'cat /home/claw/.local/state/puni-dev-observability/probe.json /home/claw/.local/state/puni-dev-observability/health.json'
bun tools/tool-observability-stack/src/dev/runtime-cli.ts preflight /tmp/puni-dev-release-c811f34bf
```

Verify several distinct observation IDs and advancing timestamps across at least three cycles,
validated SSH source identity, real storage available/capacity/observed time, actual application
log states and all backend states. Query stores and the Grafana datasource; inspect the Kibana
trace root/child. Do not infer storage from an OTLP acknowledgment. Verify effective limits are
finite; missing user-manager cgroup delegation blocks the resource-bound claim. Capture h3's
Docker version (observed 29.7.2), actual mappings plus HTTP success on loopback and refusal on
the host interface. An internal-only Docker bridge is forbidden: it previously suppressed the
published bindings. Endpoint checks belong in the live evidence, not this preflight result.

After inspection of an exhausted failure, explicitly recover only the new pair:

```sh
ssh h1claw 'systemctl --user reset-failed puni-dev-observability-tunnel.service puni-dev-observability.service && systemctl --user restart puni-dev-observability-tunnel.service puni-dev-observability.service'
```

## Bounded outage and rollback

Capture app health, seven old containers' IDs/start times/restarts and four configuration hashes
before and after every drill, using retained h3 baseline and fresh snapshots. Save firing AND
resolved Alertmanager responses while available; it is not a durable event history store.
A 90-second outage affects only the new dev gateway:

```sh
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json stop gateway'
# Capture bounded observer failure/stale/incomplete/query-error and queue/drop evidence for 90s.
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json start gateway'
```

Keep an independent timed recovery command ready before stopping it; observer requests must
remain bounded. Record exporter queue size, send failures, dropped records, missing spans and
actual recovery. Do not claim the 90-second drill necessarily crosses every alert's `for`
interval; continue read-only observation until the configured alert fires/resolves or record
that proof as unverified.

Define this fixed host-local Grafana operation from the reviewed operator shell. It reads the
existing credential only into process memory, verifies the compiled helper and exact existing
Grafana container, and never prints environment values. No Bun installation on h3 is assumed:

```sh
operate_grafana() {
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h3mon python3 - "$1" "$2" <<'PYGRAFANA'
import base64,hashlib,json,os,pathlib,re,subprocess,sys
operation,receipt=sys.argv[1:]
assert operation in ['capture','apply','rollback']
# Proof: grafana-receipt.test.ts rejects traversal/absolute/unknown/oversized names; disabling this assertion admits them.
assert receipt in ['grafana-integration.json','grafana-integration-restored.json'] or re.fullmatch(r'grafana-operation-[a-z0-9][a-z0-9-]{0,63}\.json',receipt)
root=pathlib.Path('/home/monitor/puni-dev-observability/evidence')
binary=root/'grafana-cli-c811f34bf'
assert hashlib.sha256(binary.read_bytes()).hexdigest()=='25c895a70a933ff3003b1fd6fa835241798fab5a538de903fda4c8302425d470'
grafana=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','h3mon-observability-grafana-1'],timeout=10))[0]
assert grafana['Id']=='f7fce9ef017ea81eb8baa554fa236c92ced377895ae2944df95311b4233e4972'
variables=dict(entry.split('=',1) for entry in grafana['Config']['Env'])
authorization='Basic '+base64.b64encode((variables['GF_SECURITY_ADMIN_USER']+':'+variables['GF_SECURITY_ADMIN_PASSWORD']).encode()).decode()
environment=dict(os.environ,GRAFANA_URL='http://127.0.0.1:3000',GRAFANA_AUTHORIZATION=authorization)
subprocess.run([str(binary),operation,str(root/receipt)],env=environment,timeout=100,check=True)
print(json.dumps({'receipt':receipt,'phase':json.loads((root/receipt).read_text())['phase']}))
PYGRAFANA
}
```

Rollback first stops only the new h1 pair, then rolls back the Grafana API objects using the
SAME captured applied receipt as described in [Grafana operations](runbook-dev-observability-grafana.md).
Keep existing credentials in memory. Remove the query integration by restoring only Prometheus
from the original base before stopping the six owned dev services:

```sh
ssh h1claw 'systemctl --user disable --now puni-dev-observability.service puni-dev-observability-tunnel.service'
operate_grafana rollback grafana-integration.json
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json up --detach --no-deps prometheus'
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json stop alertmanager prometheus gateway collector kibana elasticsearch'
```

Never use `down`, volume removal or recursive deletion. Retain all six dev volumes, unit files,
checkpoints, manifests, Grafana receipts and evidence. Compare exact volume names/labels and old
service history/availability against captured baseline. A missing receipt, drift, failed command
or failed preservation proof stops the sequence and is reported; do not continue by default.

To restore retained stores, start Elasticsearch from the original base first, prove readiness,
verify existing retention/templates with its retained `health.mjs`/retention evidence, then start
the other original services. Do not initialize/chown existing queue volumes again. Restore
only Prometheus to candidate base plus its named overlay. The readiness read has a 60-second
budget and records attempt count and expected startup failures in its JSON output. Only HTTP
408/503 and connection refusal/reset/timeout are retried; unexpected errors raise immediately,
and exhaustion raises instead of advancing to the other services:

```sh
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json start elasticsearch'
ssh h3mon python3 - <<'PYES'
import json,time,urllib.request,urllib.error
started=time.monotonic();deadline=started+60;attempts=0;startup=[]
while True:
 attempts+=1
 remaining=deadline-time.monotonic()
 if remaining<=0: raise RuntimeError('Retained Elasticsearch did not become ready within 60s')
 try:
  with urllib.request.urlopen('http://127.0.0.1:19200/_cluster/health?wait_for_status=yellow&timeout=5s',timeout=min(remaining,7)) as response: health=json.load(response)
 except urllib.error.HTTPError as failure:
  if failure.code not in [408,503]: raise
  startup.append({"attempt":attempts,"httpStatus":failure.code})
 except urllib.error.URLError as failure:
  if not isinstance(failure.reason,(ConnectionRefusedError,ConnectionResetError,TimeoutError)): raise
  startup.append({"attempt":attempts,"transport":type(failure.reason).__name__})
 except (ConnectionResetError,TimeoutError) as failure:
  startup.append({"attempt":attempts,"transport":type(failure).__name__})
 else:
  assert health['cluster_name']=='puni-dev-observability'
  if health['status'] in ['green','yellow'] and health['timed_out'] is False: break
 time.sleep(min(2,max(0,deadline-time.monotonic())))
policies=[]
for signal,age in [('logs','7d'),('traces','7d'),('metrics','1d')]:
 name='puni-dev-'+signal
 with urllib.request.urlopen('http://127.0.0.1:19200/_ilm/policy/'+name,timeout=5) as response: policy=json.load(response)
 assert policy[name]['policy']['phases']['delete']['min_age']==age
 with urllib.request.urlopen('http://127.0.0.1:19200/_component_template/'+signal+'-otel@custom',timeout=5) as response: templates=json.load(response)['component_templates']
 assert len(templates)==1 and templates[0]['component_template']['template']['settings']['index']['lifecycle']['name']==name
 policies.append({'name':name,'deleteAge':age})
proof={'verifiedAt':int(time.time()*1000),'readinessSeconds':round(time.monotonic()-started,3),'attempts':attempts,'startup':startup,'health':health,'retainedPolicies':policies}
print(json.dumps(proof))
PYES
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json start kibana collector gateway alertmanager prometheus'
ssh h3mon 'sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/c811f34bf/compose.json --file /home/monitor/puni-dev-observability/releases/c811f34bf/compose.grafana-query.json up --detach --no-deps prometheus'
```

After the original Grafana receipt reaches `removed`, keep it unchanged. Prove both Puni UIDs
absent, then capture/apply a NEW uniquely named receipt for restoration, retaining both receipts.
The helper's capture refuses present UIDs; use this explicit new receipt only after rollback
proved their absence and the retained original receipt reads `removed`:

```sh
operate_grafana capture grafana-integration-restored.json
operate_grafana apply grafana-integration-restored.json
```

For every subsequent rollback, use the currently applied restoration receipt in the rollback
sequence above:

```sh
operate_grafana rollback grafana-integration-restored.json
```

The original `grafana-integration.json` at phase `removed` is immutable historical evidence;
never replay or reset it to roll back the restored objects.

Re-run fresh runtime preflight, then enable/start the new h1 pair as above, and prove advancing
stored observations and UI queries again. No checkpoint initialization on restore.

Actual rollout/drill evidence belongs in OpenSpec `verify.md`. This package alone proves no live
installation, cgroup enforcement, autonomous recovery, UI rendering, history preservation drill
or retention deletion. Retention deletion is asynchronous and cannot be proved by a short drill.

Each subsequent Grafana operation chooses a fresh basename matching
`grafana-operation-[a-z0-9][a-z0-9-]{0,63}.json`, for example
`grafana-operation-20261026-restore-2.json`. Capture, apply and rollback reuse that
operation's path beneath the fixed evidence root. Capture exclusively creates the
receipt; a removed receipt remains immutable historical evidence. Both
`grafana-integration.json` and `grafana-integration-restored.json` remain valid and
must be retained. No absolute path, directory separator or traversal is accepted.

The source adapter additionally checks the initial Victoria datasource type and URL.
The pinned compiled helper above remains unchanged; using that new source validation
on a host requires a separately reviewed compiled helper and hash update. This
runbook edit does not activate that source or modify either existing receipt.

## Resource-history observer update status

Task74 adds a bounded read-only host/workload resource reader to the source observer.
Its one-shot actual h3mon inspection, existing OTLP sender and 74 stored resource series
are verified in the [owning evidence](../openspec/changes/observability-environment-parity/verify.md).
That component proof alone did not activate collection. Task75 subsequently activated
the locally compiled, reviewed immutable release `047e08024` on the existing h1claw
observer. Its binary SHA256 is
`e1d93c75b3a1b1e492c9c83183cd021d24b8b189bf3fd631a59b12f5634a2e5e`;
the adjacent manifest binds the full source revision, Bun 1.4.4 and bun-linux-x64.
The running `/proc` executable and unit hash were verified. Both tunnel definitions,
effective limits of 256 MiB, 25% CPU and 32 tasks, and the restart policy remain unchanged.

Continuous collection is now **active for the existing dev stack**: all 74 latest stored
resource values matched the actual checkpoint. After a bounded owned-Alertmanager
drill, ten distinct readings spanned 270.408 seconds, with a maximum gap of 30.643 seconds.
The observer and tunnel had zero automatic restarts. Stored log/metric/trace,
application and storage acceptance were complete. This does not establish common
Kubernetes/Flux parity, full rehearsal admission, production activation or migration.

During the drill, collection became explicitly unavailable; a historical evaluation
of actual stored samples before timed recovery showed the last observation was
125.963 seconds old. The live stale-query attempt occurred after recovery and is not
credited as an instantaneous stale observation. Existing measurements were not
replaced by zero. The independent bounded recovery started the same container;
Prometheus recorded one CPU reset and one start-timestamp change. All other twelve
container starts, all thirteen IDs, volumes and 28 configuration hashes were preserved.
The original retained log, two trace spans and eighteen metric samples still matched.

The exact prior owned unit remains at
`/home/claw/.local/lib/puni-dev-observability/047e08024/previous.service` with SHA256
`567f1478386132995920772ab592c266919c680654cd1369606539f59658bf88`.
The original ab4f executable remains immutable. To roll back, verify those hashes,
compare the current unit with the retained candidate, hardlink previous.service to
an exclusive sibling of the owned unit, atomically rename it over that unit, then
daemon-reload and restart only puni-dev-observability.service. Retain newer active
checkpoints; never initialize them or copy old checkpoint evidence over them.

Observer updates can briefly report incomplete stored-signal health while old and new
producer-scope metrics coexist. This rollout converged without another restart;
the raw historical matrix records the overlap. Do not treat that interval as
complete or weaken the unique-active-revision acceptance check to hide it.

Task75 supports rendering a candidate observer unit from a reviewed clean source checkout:

```sh
observer_revision="$(git rev-parse HEAD)"
bun tools/tool-observability-stack/src/dev/runtime-cli.ts units "$observer_revision"
```

The optional revision must be exactly 40 lowercase hexadecimal characters. Its first nine
characters select the immutable executable directory; the full revision becomes `--version`.
Omission still renders the original ab4f unit bytes. The tunnel, checkpoints, service bounds
and restart policy remain identical. Empty, abbreviated, uppercase, path, whitespace/control
inputs and extra CLI arguments refuse, including a revision with a trailing newline.

This command only renders text. The actual activation of `047e08024` is recorded above;
any later selected revision must separately be built and hashed, have its manifest verified, preserve
the exact prior owned unit/binary/checkpoints and rollback path, and validate candidate unit
syntax before reversible activation. A release-directory collision refuses rather than
replacing a retained binary. Do not initialize checkpoints or restart the tunnel. The read-only
preflight above is the pinned ab4f **bootstrap preflight**, not an upgrade preflight: it cannot
certify a selected later observer release. Fresh existing-account access, target and checkpoint
identity, effective service bounds and sustained stored cycles still require separate proof.

The new `puni_resource_collection_state` and checked/observed timestamps expose resource
collection independently of application health. Host memory total/available, per-role
current cgroup memory, configured memory limits and cumulative CPU use the existing
Prometheus store. Stable `target_host`, `workload_group` and `workload_role` labels identify
the measured target; source IDs stay in checkpoint provenance. CPU counters use `_total`
in Prometheus, with separate host/workload started timestamp gauges. Verify generation
changes and sufficient samples before interpreting a CPU rate; missing rate/history is
not zero usage. Treat unavailable collection or stale observation timestamps as missing
capacity evidence. Do not sum independent lifetime maxima or turn configured limits into
measured concurrent demand.

## Retain one observation before route work

From a reviewed source checkout, the existing runtime CLI can capture a fresh, complete
stored observation and later verify those exact historical witnesses. These commands
only read the existing backends. They do not switch routes, update the observer, admit
a migration or replace the separate candidate/preflight/ownership checks.

Create a private request file (`chmod 600`) with the existing observation checkpoint
path and explicit read routes. Legacy loopback routes use this shape:

```json
{
  "version": 1,
  "checkpointPath": "/absolute/path/to/existing-observation-checkpoint.json",
  "elastic": { "kind": "loopback", "url": "http://127.0.0.1:19200" },
  "prometheus": { "kind": "loopback", "url": "http://127.0.0.1:19090" }
}
```

For an authenticated route, replace its descriptor with
`{"kind":"binding-file","path":"/absolute/private/transport-binding.json"}`.
That file uses the existing verified transport format. Request files contain paths,
never resolved credentials. The actual authenticated Elasticsearch query principal
must retain exactly the existing read-only scopes. Route commitments bind endpoint,
service, CA and principal identity; password/private-key bytes or hashes are excluded.
Credential rotation alone therefore does not make old history a different route.

```sh
bun tools/tool-observability-stack/src/dev/runtime-cli.ts history-capture request.json new-history.json
sha256sum new-history.json
bun tools/tool-observability-stack/src/dev/runtime-cli.ts history-verify request.json new-history.json EXPECTED_SHA256 new-verification.json
```

Use the independently retained complete SHA256 printed for the original receipt in
place of `EXPECTED_SHA256`. Both output paths must be new; publication uses exclusive
owner-private files and syncs the file and directory. Retain the original bytes and
digest. A later verify writes a distinct outcome linked to that digest. It does not
read a newer checkpoint or classify the old observation as fresh application health.

The history command parses the same descriptor-checked bytes it reads for each request,
receipt, checkpoint and transport binding. It does not reopen checkpoint or binding
pathnames after the private-file check; concurrent pathname replacement cannot substitute
an unchecked identity or credential binding. Nonblocking open lets descriptor validation
reject FIFOs without waiting for a writer. Capture's second metric read uses the accepted
scrape coordinate, preserving a legitimate scrape selected after query setup began.
Existing observer file loaders retain their
original behavior.

Inputs must be readable owner-private regular files; trusted request/receipt/outcome
bytes are capped at 262144. Missing, unreadable, malformed, occupied or changed-route
inputs refuse with fixed redacted diagnostic categories. Checkpoints retain their
existing 8192-byte bound and are never initialized here. Backend reads are capped at
1 MiB under one 10-second operation deadline, at most 16 Elasticsearch records per signal,
and at most 512 stored metric samples. Historical metric reads use original stored
scrape coordinates, not query-range evaluation times or current values. Receipts keep
bounded references and canonical fingerprints, excluding raw bodies and metric labels.
A noncomplete verification publishes an explicit unavailable outcome and exits nonzero;
malformed trusted state refuses before publication. Earlier history and Grafana receipts
are never overwritten. An interrupted partial output requires inspection and a new path.

Source and independent review are recorded in the owning OpenSpec evidence. The new
commands were also exercised once against the existing dev stores: capture retained one
log, two trace spans and three correlated stored metric samples. Historical verification
succeeded at 126.467 seconds of age with the local checkpoint copy absent and the original
receipt unchanged. Capture took 1.599 seconds and verification 1.467 seconds. Temporary
local query forwards were terminated and reaped; no backend, route, observer or Secret
changed. This proves the retained-reference reader, not migration or backup durability.
Main 4.1 still requires route cutover/rollback/restore and isolated rehearsal; 4.2 still
requires actual common-stack live acceptance.
