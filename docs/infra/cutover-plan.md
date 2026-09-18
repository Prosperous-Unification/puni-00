# WBS production cutover: Compose on h2puni to k3s

**Status: prepared, not authorized.** Nothing in this plan has been applied to production or
staging. Running it needs a separate, explicit human authorization for this exact plan, its
inputs filled in and its prerequisites checked. Until then every production mutation below is
a command to review, not a command to run.

Operator commands and what has been tested: [infrastructure operator guide](README.md).

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
| Rollback boundary          | The DNS switch (step 10). See below                                                                                                                                               |
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

Every step names its check. A failed check before step 10 means **abort** (below). Commands run
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

6. **Suspend Flux and stage the export** `[operator]`. Copy `cutover-$STAMP/` from h2puni to
   the operator host and compare its SHA-256 with `export-report.json` before anything touches
   the cluster: `scp -r h2puni:/home/puni1/wbs/cutover-$STAMP . && sha256sum cutover-$STAMP/wbs-export.sqlite`.
   Then keep Flux from applying WBS objects while the restore runs (review M5):

   ```sh
   flux --context "$CTX" suspend kustomization wbs -n flux-system
   kubectl --context "$CTX" -n flux-system get kustomization wbs -o jsonpath='{.spec.suspend}'   # true
   ```

   **Seed the certificate** (review M4). Only HTTP-01 issuers exist, and HTTP-01 for
   `wbs.bulletpoints.club` cannot succeed while DNS still points at h2puni, so the Ingress would
   serve no valid certificate at the switch. Copy Caddy's live certificate into the Secret the
   Ingress names, so cert-manager only renews it after the switch:

   ```sh
   ssh h2puni 'docker exec wbs-caddy-1 sh -c "cat /data/caddy/certificates/*/wbs.bulletpoints.club/wbs.bulletpoints.club.crt"' > tls.crt
   ssh h2puni 'docker exec wbs-caddy-1 sh -c "cat /data/caddy/certificates/*/wbs.bulletpoints.club/wbs.bulletpoints.club.key"' > tls.key
   openssl x509 -in tls.crt -noout -subject -enddate   # CN wbs.bulletpoints.club, > 14 days left
   kubectl --context "$CTX" -n wbs create secret tls wbs-tls --cert=tls.crt --key=tls.key
   shred -u tls.key
   ```

   (DNS-01 through a GoDaddy solver would avoid the copy; it needs a GoDaddy API credential in
   the cluster, which the platform does not have. Recorded as the alternative, not taken.)

7. **Restore into the PVC** (`restore-into-pvc`) `[operator]`. Render the prod overlay with the
   descriptor's digests, set `wbs-backend` replicas to 0, apply it, then restore:

   ```sh
   bun tools/tool-deploy/src/k8s/cutover-cli.ts release-manifests --descriptor descriptor.json \
     --environment prod --kubectl "$KUBECTL" > release.yaml
   # edit release.yaml: Deployment wbs-backend spec.replicas 0; then
   kubectl --context "$CTX" apply -f release.yaml
   kubectl --context "$CTX" -n wbs-solver patch configmap puni-trusted-workload --type=merge \
     -p "{\"data\":{\"solverImages\":\"$NEW_BE_IMAGE\"}}"
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

8. **Start the new tiers** (`start-tiers`) `[operator]`, then record the release and hand the
   manifests to Flux, in this order:

   ```sh
   kubectl --context "$CTX" -n wbs-solver scale deployment wbs-backend --replicas=1
   for d in wbs-solver/wbs-backend wbs/wbs-gateway wbs/wbs-frontend wbs/wbs-mcp; do
     kubectl --context "$CTX" -n "${d%/*}" rollout status "deployment/${d#*/}" --timeout=600s
   done
   bun tools/tool-deploy/src/k8s/cutover-cli.ts release-record --descriptor descriptor.json \
     | kubectl --context "$CTX" apply -f -
   # deploy repository clone: the same manifests, replicas as rendered (1)
   bun tools/tool-deploy/src/k8s/cutover-cli.ts release-manifests --descriptor descriptor.json \
     --environment prod --kubectl "$KUBECTL" > "$DEPLOY_REPO/clusters/prod/wbs/release.yaml"
   git -C "$DEPLOY_REPO" add clusters/prod/wbs/release.yaml
   git -C "$DEPLOY_REPO" commit -m "wbs: cutover release $(jq -r .sourceSha descriptor.json)"
   git -C "$DEPLOY_REPO" push origin HEAD:main
   flux --context "$CTX" reconcile source git wbs-deploy -n flux-system
   # resume only once the source serves the pushed commit, or Flux re-applies an older one
   kubectl --context "$CTX" -n flux-system get gitrepository wbs-deploy -o jsonpath='{.status.artifact.revision}'
   flux --context "$CTX" resume kustomization wbs -n flux-system
   kubectl --context "$CTX" -n flux-system get kustomization wbs -o jsonpath='{.status.lastAppliedRevision}'
   ```

   Check: the last applied revision is the pushed commit and every Deployment still runs the
   descriptor's digests (Flux applied the same manifests).

9. **Smoke with a host override** (`smoke-host-override`) `[operator]`:
   `curl --resolve wbs.bulletpoints.club:443:$NEW_IP https://wbs.bulletpoints.club/` (200) and
   `/api/projects` (401 anonymous under OIDC), then an OIDC login in a browser
   with the host override, one edit, a WebSocket reconnect/replay, `/mcp`, and one solve.
   Check also that the certificate is served and ready:
   `kubectl --context "$CTX" -n wbs get secret wbs-tls -o jsonpath='{.type}'` is
   `kubernetes.io/tls`, `curl -v --resolve wbs.bulletpoints.club:443:$NEW_IP https://wbs.bulletpoints.club/ 2>&1 | grep 'subject:'`
   names `wbs.bulletpoints.club` with no verification error, and after step 10
   `kubectl --context "$CTX" -n wbs get certificate wbs-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`
   is `True` once cert-manager has taken the Secret over.

10. **Switch traffic** (`switch-traffic`) `[operator]`: prepare the DNS change as a reviewed plan,
    then apply it at GoDaddy by hand:
    `bun tools/tool-fleet/src/platform-dns.ts plan bulletpoints.club current.json desired.json`.
    Check: `dig +short wbs.bulletpoints.club @1.1.1.1` returns `$NEW_IP`; production health,
    auth, edits, WebSocket reconnect/replay, MCP and a solve pass on k3s.
11. **Retarget backups** and verify one backup/restore cycle (docs/infra/recovery.md). Keep the
    old Compose stack stopped, not removed, until then; propose its retirement through F5.

The rehearsal (`bunx nx run tool-deploy:rehearse:cutover`) runs steps 6-8 against a real
`Kustomization wbs` over a lab Git source, with the `flux` CLI's suspend/resume done as the
equivalent `kubectl patch … spec.suspend`. Without the suspend in step 6 it observed Flux
re-apply `replicas: 1` over the hand-set 0 and start a writer that created
`/data/wbs.sqlite`, and the restore Job then refused (`already exists`).

## Rollback boundary

Before step 10 no user write has reached k3s, so the old deployment is the system of record and
rollback is local to h2puni:

```sh
cp /home/puni1/wbs/caddy/site.caddy.pre-cutover-$STAMP /home/puni1/wbs/caddy/site.caddy
docker start be-01-$COLOR gw-01-$COLOR
docker exec wbs-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Then, on k3s, stop Flux from re-creating what the rollback removes (it may have been resumed
in step 8), scale the WBS Deployments to 0, and empty the PVC before any retry (the restore Job
refuses a non-empty target):

```sh
flux --context "$CTX" suspend kustomization wbs -n flux-system
kubectl --context "$CTX" -n wbs-solver scale deployment wbs-backend --replicas=0
kubectl --context "$CTX" -n wbs scale deployment wbs-gateway wbs-frontend wbs-mcp --replicas=0
kubectl --context "$CTX" -n wbs-solver delete configmap wbs-release
```

Revert the deploy-repository commit from step 8 before Flux is resumed again. The rehearsal performs exactly this rollback and then
writes through the old edge again.

After step 10, users write to k3s. Rolling back to Compose would drop those writes, so it is not
offered: failures are handled by the F8 transaction (`recovery-required`, a new request with
`recovers=`) and restores from the F7 backups. A DNS revert within the first minutes is only safe
while the k3s side has accepted no write; check `event_log` count against the export report
before considering it.
