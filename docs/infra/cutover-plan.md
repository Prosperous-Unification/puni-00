# WBS production cutover: Compose on h2puni to k3s

**Status: prepared, not authorized.** Nothing in this plan has been applied to production or
staging. Running it needs a separate, explicit human authorization for this exact plan, its
inputs filled in and its prerequisites checked. Until then every production mutation below is
a command to review, not a command to run.

The move is a one-time transaction the F8 release coordinator cannot perform: the coordinator
needs a running k3s release to start from. The steps are `CUTOVER_PHASES` in
`tools/tool-deploy/src/k8s/cutover.ts`. `bunx nx run tool-deploy:rehearse:cutover` runs all of
them locally, from the production Compose templates to a k3d cluster. The rehearsal record is in
[verify.md](../../openspec/changes/k3s-wbs-delivery/verify.md).

## Inputs

`INPUT` marks a value that is unknown in the repository and must be recorded here before
authorization. Commands below reference inputs as shell variables.

| Item                       | Value                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old host                   | `h2puni` (`ssh h2puni`), Compose root `/home/puni1/wbs`, network `wbs-net`, edge container `wbs-caddy-1`                                                                          |
| Old live colour            | `INPUT` `$COLOR`: `ssh h2puni 'docker ps --format {{.Names}}' \| grep -E '^(be\|gw\|fe)-01-'`                                                                                     |
| Old database               | `/home/puni1/wbs/data/wbs.db` (`DB_PATH=/data/wbs.db`, written by `configure.sh`); confirm with `ssh h2puni 'grep DB_PATH /home/puni1/wbs/be-01.env'`                             |
| Old digests                | `INPUT`: `ssh h2puni 'for t in be gw fe; do docker inspect --format "{{.Config.Image}}" $t-01-$COLOR; done'`                                                                      |
| New digests                | The staging-proved descriptor `$DESCRIPTOR_SHA256` (deploy-k3s staging run `$STAGING_RUN`). Old and new must be the same be/gw/fe bytes; only MCP is new                          |
| New cluster                | `platform` (infra/fleet/desired.yaml); node `INPUT` (desired.yaml still lists `platform-pending`), context `INPUT` `$CTX`, kube-system UID `INPUT` `$UID`                         |
| New namespaces             | `wbs` (gateway, frontend, MCP), `wbs-solver` (backend, PVC `wbs-data` on `hcloud-volumes`, release record `wbs-release`, Lease `wbs-release`)                                     |
| New edge                   | Traefik Ingress `wbs/wbs-public` and `wbs-solver/wbs-api` (deploy/k8s/wbs/overlays/prod/ingress.yaml), certificate `wbs/wbs-tls` from ClusterIssuer `letsencrypt-production`      |
| Ingress address            | `INPUT` `$NEW_IP`: the platform node's public IPv4 (Traefik `websecure`)                                                                                                          |
| DNS                        | `wbs.bulletpoints.club` A record at GoDaddy (manual): current value `INPUT` `$OLD_IP` (h2puni), target `$NEW_IP`, TTL lowered to 60 s at least one old TTL before the window      |
| Backup identities          | Pre-cutover export `h2puni:/home/puni1/wbs/cutover-$STAMP/wbs-export.sqlite` plus its `export-report.json` (SHA-256), copied off-host to `INPUT` `$OFFSITE`; host copy of `data/` |
| Rollback boundary          | The DNS switch (step 9). See below                                                                                                                                                |
| Expected write downtime    | Rehearsed fence-to-served on k3s: see verify.md (about a minute locally). Production estimate 15-30 minutes, dominated by image pulls, PVC attach and the smoke                   |
| Expected read availability | Reads keep working through the fenced old edge until the switch; after it, DNS propagation (TTL 60 s)                                                                             |

## Prerequisites (all must be checked before authorization)

- [ ] Production platform cluster exists and passes `tool-fleet:check`, and the hcloud
      inventories carry `network:` (the check's `ansible-inventory` family fails today).
- [ ] A WBS Flux unit exists: `GitRepository flux-system/wbs-deploy` over the deploy repository
      and `Kustomization flux-system/wbs` over `clusters/prod/wbs/`, excluding
      `wbs-solver/puni-trusted-workload` `data.solverImages` from reconciliation.
- [ ] `ClusterIssuer letsencrypt-production` exists after staging issuance succeeded for both
      names (docs/infra/platform.md, "Certificates and DNS").
- [ ] Secret `wbs-solver/sqlite-backup-s3` exists for the release-shipped backup CronJob
      (docs/infra/recovery.md, "SQLite").
- [ ] A production MCP image built by Dagger (the lab Dockerfile is not a release path).
- [ ] Staging has promoted `$DESCRIPTOR_SHA256` through `deploy-k3s.yml` (so the staging proof
      exists on the deploy runner) and the P5 admission route is `installed-package`.
- [ ] A production dry run of the old deploy (`docs/runbook-prod-deploy.md`) is clean, so the old
      side is known restartable.
- [ ] The host-owned solver supervisor runs on the product node with `/run/puni/solver`.

## Procedure

Every step names its check. A failed check before step 9 means **abort** (below). Commands run
from a checkout of the authorized commit on h2puni (`/home/puni1/wbs-build`) unless marked
`[operator]`, which runs where the production kubeconfig is.

1. **Announce and freeze.** No `tool-deploy:deploy` or `deploy-k3s` runs during the window.
   `STAMP=$(date -u +%Y%m%dT%H%M%SZ)`.
2. **Fence old edge writes** (`fence-edge-writes`).

   ```sh
   cp /home/puni1/wbs/caddy/site.caddy /home/puni1/wbs/caddy/site.caddy.pre-cutover-$STAMP
   bun tools/tool-deploy/src/k8s/cutover-cli.ts fenced-site --site wbs.bulletpoints.club \
     --backend be-01-$COLOR:3100 --frontend fe-01-$COLOR:80 > /home/puni1/wbs/caddy/site.caddy
   docker exec wbs-caddy-1 caddy reload --config /etc/caddy/Caddyfile
   ```

   Check: `curl -s -o /dev/null -w '%{http_code}' -X POST https://wbs.bulletpoints.club/api/projects`
   is `503`, and an anonymous `GET /api/projects` still reaches be-01 (`401` under OIDC).

3. **Drain the gateway** (`drain-gateway`). The fence already answers new WebSockets with 503.
   Poll until `activeConnections` is 0 or 300 s pass (the swap's own bound), then stop it:
   `docker exec gw-01-$COLOR bun -e "console.log((await (await fetch('http://127.0.0.1:3200/metrics/snapshot')).json()).activeConnections)"`,
   then `docker stop --time 30 gw-01-$COLOR`.
4. **Stop the old writer** (`stop-writer`): `docker stop --time 30 be-01-$COLOR`. Check:
   `docker ps --format {{.Names}} | grep -c '^be-01-'` is `0`.
5. **Export** (`export-sqlite`, `verify-export`), with the stopped release's own image:

   ```sh
   bun tools/tool-deploy/src/k8s/cutover-cli.ts export --image "$OLD_BE_IMAGE" \
     --data /home/puni1/wbs/data --db wbs.db --out /home/puni1/wbs/cutover-$STAMP \
     --known '["<two project names read before step 2>"]'
   ```

   It refuses an existing output directory and exits non-zero unless `integrity_check` is `ok`,
   `foreign_key_check` is empty, migrations are recorded and the known rows exist. Check the
   report's newest migration equals `docker run --rm -v /home/puni1/wbs/data:/data -e DB_PATH=/data/wbs.db "$OLD_BE_IMAGE" bun run src/migrate-status-cli.ts`.
   Copy `cutover-$STAMP/` off-host to `$OFFSITE` and compare SHA-256 there.

6. **Restore into the PVC** (`restore-into-pvc`) `[operator]`. Render the prod overlay with the
   descriptor's digests (`renderOverlay`, as `deploy:k3s` does), set `wbs-backend` replicas to 0,
   apply it, then:

   ```sh
   bun tools/tool-deploy/src/k8s/cutover-cli.ts restore-job --image "$NEW_BE_IMAGE" \
     --export-report cutover-$STAMP/export-report.json | kubectl --context "$CTX" create -f -
   POD=$(kubectl --context "$CTX" -n wbs-solver get pod -l job-name=wbs-cutover-restore -o name)
   kubectl --context "$CTX" -n wbs-solver cp -c task cutover-$STAMP/wbs-export.sqlite "${POD#pod/}:/data/cutover-incoming.sqlite"
   kubectl --context "$CTX" -n wbs-solver exec "${POD#pod/}" -c task -- touch /data/cutover-incoming.done
   kubectl --context "$CTX" -n wbs-solver wait --for=condition=complete job/wbs-cutover-restore --timeout=600s
   kubectl --context "$CTX" -n wbs-solver logs job/wbs-cutover-restore > restore.log
   bun tools/tool-deploy/src/k8s/cutover-cli.ts verify-restore \
     --export-report cutover-$STAMP/export-report.json --logs restore.log
   ```

   The Job refuses a SHA-256 mismatch (deleting the bytes) and an existing `/data/wbs.sqlite`;
   `verify-restore` requires identical bytes, migrations and row counts and owner UID 10001.
   Write `solverImages` to the new backend digest before the Job (F6 contract).

7. **Start the new tiers** (`start-tiers`) `[operator]`: scale `wbs-backend` to 1, wait for
   `rollout status` of all four Deployments, and write the release record so later releases
   start from it (`kubectlEffects(...).persistRelease`, as the rehearsal does). Commit the same
   manifests to the deploy repository and resume Flux on that revision.
8. **Smoke with a host override** (`smoke-host-override`) `[operator]`:
   `curl --resolve wbs.bulletpoints.club:443:$NEW_IP https://wbs.bulletpoints.club/` (200) and
   `/api/projects` (401 anonymous under OIDC), then an OIDC login in a browser
   with the host override, one edit, a WebSocket reconnect/replay, `/mcp`, and one solve.
9. **Switch traffic** (`switch-traffic`) `[operator]`: prepare the DNS change as a reviewed plan,
   then apply it at GoDaddy by hand:
   `bun tools/tool-fleet/src/platform-dns.ts plan bulletpoints.club current.json desired.json`.
   Check: `dig +short wbs.bulletpoints.club @1.1.1.1` returns `$NEW_IP`; production health,
   auth, edits, WebSocket reconnect/replay, MCP and a solve pass on k3s.
10. **Retarget backups** and verify one backup/restore cycle (docs/infra/recovery.md). Keep the
    old Compose stack stopped, not removed, until then; propose its retirement through F5.

## Rollback boundary

Before step 9 no user write has reached k3s, so the old deployment is the system of record and
rollback is local to h2puni:

```sh
cp /home/puni1/wbs/caddy/site.caddy.pre-cutover-$STAMP /home/puni1/wbs/caddy/site.caddy
docker start be-01-$COLOR gw-01-$COLOR
docker exec wbs-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Then scale the k3s WBS Deployments to 0 and delete the PVC contents before any retry (the
restore Job refuses a non-empty target). The rehearsal performs exactly this rollback and then
writes through the old edge again.

After step 9, users write to k3s. Rolling back to Compose would drop those writes, so it is not
offered: failures are handled by the F8 transaction (`recovery-required`, a new request with
`recovers=`) and restores from the F7 backups. A DNS revert within the first minutes is only safe
while the k3s side has accepted no write; check `event_log` count against the export report
before considering it.
