# Dev observer operation and retained-store rollback

This package adopts the already staged dev releases; it does not bootstrap arbitrary hosts.
Use the reviewed implementation commit from a clean checkout. Builds run locally with Bun
1.4.4, never on h1claw. Existing binary `/home/claw/.local/lib/puni-dev-observability/ab4f7cf6e/observer`
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
the retained observer binary/manifest/checkpoints, old tunnel hash/PID and linger. It also
requires the protected Slack secret marker and a measured, policy-verified notification release
from the actual Alertmanager config mount.
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
import base64,hashlib,json,os,pathlib,subprocess,sys
operation,receipt=sys.argv[1:]
assert operation in ['capture','apply','rollback']
assert receipt in ['grafana-integration.json','grafana-integration-restored.json']
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

## Slack recipient preservation

Infrastructure alerts are separately authorized for punispace #puni-alerts. The
normal renderer now selects slack-puni with firing and recovery notifications,
referencing /alertmanager/secrets/slack-webhook inside the retained Alertmanager
volume. The webhook value belongs only in that protected file. Rendering refuses
local-only fallback, arbitrary receivers, inline URLs, nested route overrides and
HTTP proxy overrides.

The deployed Alertmanager0.34.0 amtool accepts check-config even when api_url_file
is missing or unreadable. Its zero exit proves configuration syntax, not secret
readiness. The authenticated runtime snapshot now inspects the unique running
Alertmanager container and its owned persistent volume, then reads only the fixed
secret from that exact container ID. It requires canonical file identity,
UID:GID65534:65534, mode0600, one link, at most1024bytes and the exact authorized
workspace URL shape. It returns only slackSecret:verified; missing, unreadable,
linked, malformed or oversized material refuses before runtime preflight succeeds.
The read is capped at1025bytes with an eight-second command deadline. Re-run fresh
preflight immediately before an intended deployment; this observation expires with
the existing sixty-second runtime snapshot.

Historical read-only validation on 2026-10-29 succeeded without printing the webhook
or sending a message. That source-review evidence did not establish live adoption of
the versioned release. This source integration does not refresh deployment evidence. Retain
the old release manifests and Slack setup receipts rather than editing expected
hashes to hide a changed mounted file.

## Versioned Slack configuration transition

`renderNotificationRelease` in `tools/tool-observability-stack/src/dev/notification-release.ts` produces exactly
`alertmanager.yaml`, `compose.slack.json` and `manifest.json` for a full forty-hex
source commit under `/home/monitor/puni-dev-observability/releases/slack-<commit>`.
Its overlay inherits the retained Compose base and changes only Alertmanager's
read-only configuration mount, retaining `puni-dev-observability_alertmanager`.
Use the exact reviewed and host-gated commit when rendering and staging. A manifest's
source field records provenance; neither that field nor successful preflight proves
Git review, a host gate or authority to apply.

The runtime reader selects the same running, project/service/ID-validated container
and persistent volume used for secret readiness. It requires one read-only bind
mount at `/etc/puni/alertmanager.yaml`, with its source in the exact versioned path.
It reads only the three fixed files. Each must be regular, canonical, singly linked,
owned by the monitoring root's UID/GID, mode0644 and at most64KiB. Opens use
NOFOLLOW/NONBLOCK; descriptors close on success and failure, and a read is capped
at65537bytes to detect growth. Missing, unreadable, malformed or substituted files
raise. The TypeScript boundary checks the exact manifest schema, source-directory
relationship, and both measured and declared hashes against current trusted
rendering. Matching host-supplied hashes alone cannot authorize another policy.

The initial transition has a deliberately separate predecessor check: the new
preflight refuses an old unowned config mount, and the old manifests must still
be reconciled. Perform these steps in order, retaining receipts:

1. Review and gate the exact source commit. Render its three files, exclusively
   stage their new directory as the monitoring user, and verify hashes, permissions,
   actual Compose merge and the pinned Alertmanager binary's syntax validation.
   Existing destination collisions require inspection; never overwrite them.
2. Recheck the captured container identity, current config hash and Slack setup
   receipt; verify the saved original config matches the original release manifest.
   Refuse any unaccounted drift. Preserve both old manifests unchanged.
3. Recreate only `alertmanager`, using project `puni-dev-observability`, profile
   `dev`, retained `releases/a1ffe27e7/compose.json`, the new release's
   `compose.slack.json` as the second file, and `up --detach --no-deps alertmanager`.
   Verify its actual config mount, retained volume, protected secret and loaded
   receiver. A failed command or proof stops this transition and keeps its evidence.
4. After proving the old config is unmounted, restore only that old file from its
   hash-verified pre-Slack backup. Require its current hash to equal the captured
   predecessor before replacing it; preserve its monitoring ownership and mode0644.
   Verify both original manifests and their complete inventories again. Do not
   replace expected hashes with the manually changed file's hashes.
5. Run fresh full runtime preflight. Verify firing and resolved delivery, then
   repeat the Alertmanager-only recreation with the same overlay and retained store
   and verify delivery/persistence again. Capture effective limits, mounts, loaded
   policy, notification counters and preservation of other services.

Every later Alertmanager creation/recreation from the retained old base must include
this versioned overlay. `start` on an already-created container retains its mounted
configuration. Rolling back a failed transition restores the captured predecessor
mount/config through the same named service and retained volume; it does not remove
stores, reset old manifests or claim readiness without the corresponding checks.
The caller's new `notificationRelease` fixture is modeled evidence for the new
contract; it is not a historical live adoption receipt.
