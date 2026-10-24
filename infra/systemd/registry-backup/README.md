# Registry backup host units

These examples run `tools/tool-fleet/src/backup-registry.ts` on the registry's
single k3s server. Install only after operator provision of the encrypted,
initialized off-node restic repository and recovery credentials. The runner
never initializes a repository, removes restic locks, prunes or deletes snapshots.
All snapshots remain retained until an explicit retention policy is approved.

The runner checks the pinned executable bytes from the colocated
`backup-registry.lock.json`, an existing readable repository, expected Flux
sources/paths and registry ownership, and the bound PVC/PV identity. It resolves
the hostPath from the PV and compares the affinity-selected Kubernetes Node's
machineID with `/etc/machine-id`; an OS hostname can differ from the node name.
It refuses an unexpected replica count, mismatched node or unreadable source
before suspending reconciliation. The lock file is trusted operator configuration;
install it from the same reviewed commit as the runner.

Provision `/root/.puni/registry` with owner root and mode 0700. Keep the env file
and password as root-owned regular files mode 0600. The environment file needs
`RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` and `AWS_DEFAULT_REGION`. Do not put actual values in Git
or command output. `RESTIC_PASSWORD_FILE` names the separately escrowed secret
file. Use the exact initialized S3 prefix; no `restic init` belongs in this unit.

From a reviewed checkout on the host:

```sh
sudo install -d -o root -g root -m 0700 /root/.puni/registry
sudo install -o root -g root -m 0600 tools/tool-fleet/src/backup-registry.ts /root/.puni/registry/
sudo install -o root -g root -m 0600 tools/tool-fleet/src/backup-registry.lock.json /root/.puni/registry/
sudo install -o root -g root -m 0644 infra/systemd/registry-backup/puni-registry-backup.service /etc/systemd/system/
sudo install -o root -g root -m 0644 infra/systemd/registry-backup/puni-registry-backup.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/puni-registry-backup.service /etc/systemd/system/puni-registry-backup.timer
sudo systemctl daemon-reload
sudo systemctl start puni-registry-backup.service
sudo systemctl status puni-registry-backup.service --no-pager
sudo cat /root/.puni/registry/last-success.json
```

Confirm the pinned Bun path in `ExecStart` exists on this host. The runner imports
only Bun and Node builtins; no checkout or package install is required at runtime.
The installed restic executable path and checksums are in the lock. `k3s` and
util-linux `flock` must be available on the service PATH. The first manual run
must succeed and its snapshot must be recovered off-node before enabling the timer:

```sh
sudo systemctl enable --now puni-registry-backup.timer
sudo systemctl list-timers puni-registry-backup.timer
```

During capture the runner suspends `puni-cluster`, then `platform`, scales only
`puni-registry/registry` to zero and waits for its pods to disappear. It preserves
root patches and unrelated workloads. A normal run and every caught failure or
SIGTERM/SIGINT restore the captured replica and Flux flags. Per-command deadlines
bound recovery; systemd sends termination only to the parent first (`KillMode=mixed`),
allowing five minutes for cleanup before forced killing. Power loss or SIGKILL
cannot execute cleanup: recover manually and inspect the last receipt before
retrying. Do not kill the entire service control group during cleanup.

The receipt is atomically replaced only after a nonempty identified snapshot,
`restic check --read-data` across the repository, and successful registry recovery.
Failed uploads, corrupt packs and failed cleanup retain the prior receipt. The
registry and both Flux states are restored immediately after capture, before the
check reads all retained packs; repository growth increases verification time.
Failures appear as a failed systemd service and in its journal; this unit has no
external alert transport. Inspect with:

```sh
sudo systemctl --failed
sudo journalctl -u puni-registry-backup.service --no-pager
```

A failed cleanup prints a shell-quoted `MANUAL RECOVERY` command for each failed
state restoration. Run those exact commands, then verify the registry Deployment
is Ready and each Flux suspend flag matches its recorded original state. Never
blindly resume a Flux resource that was already suspended before the backup.
A receipt is evidence of this capture/check, not an off-node restore drill.

Focused local proofs (the second command additionally exercises the verified
restic 0.19.1 executable, a real local repository, byte recovery, pack corruption
and an unreadable source causing a partial backup):

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/backup-registry.test.ts
PUNI_TEST_RESTIC_BINARY=/path/to/verified/restic-0.19.1 bun test --timeout 30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/backup-registry.test.ts
```

Tests copy the runner and replace its colocated lock with a fixture consumer pin;
the real-restic tests separately require the production executable checksum.
`PUNI_REGISTRY_BACKUP_DIRECTORY` and `PUNI_REGISTRY_BACKUP_WAIT_MS` are fixture/operator
overrides; the service uses the fixed private directory and a 120-second pod bound.
