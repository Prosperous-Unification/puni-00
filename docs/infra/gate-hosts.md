# Gate hosts

A gate host runs `bin/h2puni-gate.sh <sha>` exactly as h2puni does, under its own host-wide heavy
lock, so gates on different hosts run in parallel. h2puni is the original gate host. h4claw is the
second, configured by `infra/ansible/playbooks/gate-host.yml` (WBS 070.05) and live since
2026-10-21: the apply converged twice and a full gate exited 0 there, recorded in
[the gate-host-role verification](../../openspec/changes/gate-host-role/verify.md). Since 2026-11-08
h4claw is enrolled in its Dash host pool in observe mode, so gate on it as `puni1` from
`~/puni-00-gate-launcher` ([Launch a gate on h4claw](#launch-a-gate-on-h4claw)). The figure of
about 100 minutes for a full gate is from before enrollment; the first observe-mode gate was
throttled by the estimated `gate` envelope (the known issue in that section).

## What the role sets up

`infra/ansible/roles/gate_host` makes the host match h2puni's gate environment:

- **Account.** It creates the `puni1` system account in the `docker` group, with no sudo; a pre-existing
  grant is tolerated only where the inventory sets `puni_gate_account_may_sudo` (step 0). The name
  is fixed because `resolve_heavy_lock_path` in `bin/heavy-lock-lib.sh` hard-codes
  `/home/puni1/.cache/wbs-heavy-work.lock` on Linux and takes no override. Each host's lock is
  local to that host. A lane queued on h4claw waits only for h4claw's gates.
- **Bun.** It installs the Bun pinned by `.bun-version` at `~/.bun-<version>/bin/bun`, with
  `bunx` beside it. The bytes come from the `binaries.solverBun` lock in
  `infra/versions/toolchain.json`.
- **Node.** It installs the Node pinned by `binaries.gateNode` in `toolchain.json` at
  `~/.node-<version>/bin/node`, the interpreter only. Nx's bin is `#!/usr/bin/env node`, so every
  `bun run` of an Nx script needs it; h2puni has the same version through Volta.
- **gh.** It installs the GitHub CLI release `.deb` pinned by `binaries.gateGh` at `/usr/bin/gh`.
  twilight-dash's activation tests hash that file and run it as the offline attestation
  verifier; h2puni has gh from GitHub's apt repository, which keeps only the newest release.
- **Solver Python.** It builds `~/.venv-solver` from the solver lock, installed with
  `--require-hashes` as CI does.
- **Shell.** `~/.bashrc` puts the Bun, Node and solver environment first on `PATH`, and sets
  `TMPDIR=/var/tmp` and `NX_DAEMON=false`. These lines sit above the interactivity guard, which
  is what a non-interactive `ssh … CMD` needs.
- **Gate checkouts.** `~/puni-00-gate-tbf` and `~/puni-00-gate-tbf2` (the pool's two `gate_tree`
  units, J15) and `~/puni-00-gate-launcher` (launcher-only: gates, test runs, `watch` and the audit run
  Dash from it, because an enrolled payload refuses its own launcher's checkout and a process in a unit
  holds it) are full clones of the GitHub repository, never `--filter=blob:none`, each with one
  frozen install. Ansible never moves a head. Before cloning, the role refuses when the home
  filesystem has less free space than 5 GiB per missing checkout plus 10 GiB for a gate, and prints
  `df`'s figures; a host whose checkouts all exist is never refused.
- **Linger.** `loginctl enable-linger puni1`, so the account's user manager runs with nobody
  logged in: `ops job run` measures every job in a `systemd-run --user` scope and refuses 70
  without one.
- **Host pool paths.** The fixed root `~/.local/share/dash/host-pool` (0700, left empty because
  `ops pool init` refuses a non-empty root), `~/.config/dash` (0700), and two token units,
  `~/.local/share/dash/units/dagger_engine` and `~/.local/share/dash/units/docker_build`: each a
  Git tree with one empty commit, never changed, since a pool unit must be a Git work tree
  (S6-A7). `docker_build` stands for the host daemon's BuildKit cache, which puni-pr-00's
  `website-dev-build` declares.
- **Host pool configuration.** Only where `puni_gate_host_pool_enroll` is true, because the file
  existing is what enrolls a host: `~/.config/dash/host-pool.json`, 0600, rewritten only when it
  differs. Budgets are the host's `nproc` and MemTotal in whole GiB, headroom `puni_gate_pool_headroom`
  (role default 1 core and 2 GiB; h4claw's ledger pins 1 core and 5 GiB, see step 7),
  `exclusiveUnits` the two gate trees and the two token units, `enrollmentId`
  `<inventory name>-host-pool`, `launcherCheckouts` the launcher checkout (on h2puni also
  `~/wbs-dev/src`, from the inventory), `concurrencyEligible` empty. The ledger pins all but
  the last two, so changing a pinned field later makes every pool open refuse.
- **Dash user units.** `dash-resources-watch.service` (`resources watch`, `Restart=always` so a
  SIGTERM cancellation, which exits 0, comes back too while `systemctl --user stop` still keeps it
  down, `KillMode=process` so the concurrent-mode guard holder outlives a restart, skipped until the
  ledger exists), and the weekly `dash-job-audit.timer` with its service, the files
  `ops job render-audit-units` renders. Beside them, the hourly `gate-launcher-refresh.timer`
  and its oneshot service, which runs `bin/gate-launcher-refresh.sh` on the launcher checkout
  (task 6.9). All five go to `~/.config/systemd/user`. On an enrolled host the role enables the
  watch and both timers. It never starts any of them, and it never runs `ops pool init`.
- **Packages.** It installs `git`, `jq`, `perl`, `python3-packaging`, `python3-venv`,
  `shellcheck`, `unzip`, `bubblewrap` and `busybox` from Ubuntu apt. The sandbox tools are
  required by existing gate tests; installing them does not grant namespace capability. A
  nested heavy job bounds its admission query with `timeout`, from `coreutils`, which Ubuntu
  marks Essential, so the role installs nothing for it. Docker must already be running. The role does not change Docker,
  k3s, the firewall or the network.

The last tasks are read-only probes run as `puni1` through its `~/.bashrc`:

- `bun` and `bunx` resolve to the pinned Bun;
- `node` resolves to the pinned Node and reports its version;
- `gh` is `/usr/bin/gh` and reports the pinned version;
- `bwrap` resolves to the system binary and runs its version command; BusyBox executes at
  both system paths used by callers (`/bin/busybox` and `/usr/bin/busybox`);
- each of the three checkouts is a full, clean clone of the canonical URL with its install;
- linger is on, each token unit is a clean tree with a commit, and the pool root and the three
  user units exist;
- on an enrolled host, the configuration is 0600, owned by `puni1`, and has exactly the
  documented fields with the fixed root and units (`jq`), and the watch and timer are enabled;
  on any other host, neither the configuration nor a ledger exists;
- once a ledger exists, `ops pool inspect` and `ops job audit` pass (an envelope drift fails the
  play); before that, a skip line names the missing ledger.
- `docker ps` works;
- `python3` is the venv's and imports the locked OR-Tools;
- the production lock resolver names `~/.cache/wbs-heavy-work.lock` in a writable directory.

These binary checks establish tool availability only. The unchanged canonical gate owns the
namespace probe; the role does not change AppArmor, sysctls or user-namespace permissions.

To rerun only the probes, pass `--tags validate`.

## Add a gate host

1. Add the host to `gate_hosts` in its inventory. Keep its other group membership.
2. Put the gate's SSH public keys in an operator-only file, `$OPS/gate.json`, with the host not
   yet enrolled: `{"puni_gate_authorized_keys": ["ssh-ed25519 …"], "puni_gate_host_pool_enroll": false}`.
   The role refuses to run without `puni_gate_host_pool_enroll`. The role replaces
   `~/.ssh/authorized_keys` with exactly this list, so on a host where `puni1` already exists,
   stage the list from that host's live file, read just before the apply (not an earlier
   snapshot), and compare the two byte for byte. A trailing space on one key once differed
   between a snapshot and the staged list (H2-B1, 2026-11-04):

   ```sh
   ssh root@<host> cat /home/puni1/.ssh/authorized_keys > "$OPS/authorized_keys.live"
   jq -Rn '{puni_gate_authorized_keys: [inputs], puni_gate_host_pool_enroll: false}' \
     "$OPS/authorized_keys.live" > "$OPS/gate.json"
   jq -r '.puni_gate_authorized_keys[]' "$OPS/gate.json" | cmp - "$OPS/authorized_keys.live"
   test "$(grep -vc '^\s*\(#\|$\)' "$OPS/authorized_keys.live")" -eq \
     "$(jq '.puni_gate_authorized_keys | length' "$OPS/gate.json")"
   ```

   `cmp` exiting 0 proves the list is a lossless copy of the live file, final newline included:
   `jq -R` and `jq -r` keep every byte of every line, so a live file without a final newline is
   the only one it refuses. A comment or blank line is copied as an entry too, and the last
   command refuses it here (the role's key count would refuse it at staging); remove such lines
   on the host and stage again.

3. Take a backup of what the role touches (accounts, `~/.ssh/authorized_keys` and package
   selections). Then run the playbook twice through the fleet controller. The second run must
   print `changed=0`. After the first run, log in as `puni1` from a second session with each
   caller's key before closing the session the apply came through. The role renders the keys to
   `~/.ssh/authorized_keys.staged`, and "Require one authorized key per listed key" refuses it
   when its `ssh-keygen -lf` fingerprint count differs from the list's length, before it replaces
   the live file; validate runs the same check on the live file. A bad render therefore stops the
   play with the old keys still in place: the lock-out window of H2-A7 (2026-11-04), when a role
   bug wrote h2puni's five keys as one line and locked out every caller but the first until the
   backup was restored, is closed by construction. The count is not a login test (sshd may refuse
   a key that parses), which is why the second-session login stays.

For h4claw, the controller is the one the 2026-09-27 enrollment used. It runs on the operator
laptop and reaches `10.1.0.4` as root through a jump via h2puni. Its inputs are in
`~/.puni/fleet/2026-enroll` (see [enroll h4claw and h3mon](enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni)).
On h2puni that directory has only the admin key: no `vars.json` and no `known_hosts`.

```sh
OPS=~/.puni/fleet/2026-enroll
fleet_ansible --limit h4claw --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml
fleet_ansible --limit h4claw --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml  # changed=0
```

## Enroll a host in the host pool

Enrollment is an operator step (`dash-host-jobs` tasks 6.7, 6.4 and 6.5), in this order:

0. **Onboard h2puni to the role (h2puni only, once).** h2puni has never been role-managed. It is
   now listed in `gate_hosts` (`ansible_host: 10.1.0.3`) and in no k3s group. The k3s plays that
   target `all` stop at their input asserts on it (read from the plays, not run; `discover.yml`
   only reads `/etc/machine-id`), and `tool-fleet:check` renders the k3s sysctl only for k3s
   hosts. The role has not been applied to it. Its first apply is a larger change than
   enrollment, and it is owed by task 6.3's operator half, which Dany sees before it runs:
   - `puni1` on h2puni escalates: it is in the `sudo` group and `sudo -n true` exits 0, because
     the dev poller and the monitoring scripts run `sudo docker` and `sudo openssl` as `puni1`.
     h2puni passes the input asserts, but without an exception validate's "Require the gate
     account without sudo" would fail every apply after it had changed the host. Its inventory
     entry therefore sets `puni_gate_account_may_sudo: true` (default false), and validate then
     requires the state the strict check would refuse (the `sudo` group or `sudo -n` succeeding). On h2puni a gate payload can become root,
     so the gate-host isolation property does not hold. This is debt: once those callers leave
     `puni1` and its sudo is removed, the next apply fails as stale until the flag is deleted.
   - Pass `--extra-vars '{"puni_gate_host_pool_enroll": false}'`, as h4claw's apply did; that flag
     is never in the inventory. `$OPS/known_hosts` needs h2puni's key for `10.1.0.3`.
   - Take the base backup the role's touched state needs (accounts, `~/.ssh/authorized_keys`,
     package selections, and `puni1`'s current `~/.bashrc`), as in
     [Add a gate host](#add-a-gate-host).
   - h2puni passes the role's input asserts: Ubuntu 26.04 on x86_64, account `puni1`, home
     `/home/puni1`.
   - Expect the first apply to change these, read from the role and the 2026-11-04 preflight, not
     yet observed as an apply on h2puni:
     - `~/.ssh/authorized_keys` becomes exactly `puni_gate_authorized_keys`. On h2puni `puni1`
       is also the operator and dev account, so `gate.json` must list every key it authorizes
       today, or the apply locks those callers out. Stage it from the live file and compare
       byte for byte as in [Add a gate host](#add-a-gate-host) step 2, and after apply 1 log in
       from a second session before closing the first. Apply 1 on 2026-11-04 wrote the five
       keys as one line (H2-A7, fixed by the role's `authorized_keys.j2` template); the key
       count on the staged file now refuses such a render before the live file is replaced.
     - `~/.cache` stays 0700, h2puni's mode. Before the H2-A7 fix the role set it to 0755, which
       apply 1 did (observed 2026-11-04); the next apply narrows it back. h4claw's `~/.cache`
       was created 0755 by the earlier role, and its next apply narrows it to 0700 too. Every
       heavy run on these hosts is `puni1`, so no other account needs to enter it.
     - `~/.bashrc` becomes the role's template. Its PATH puts `~/.venv-solver`, `~/.bun-1.4.4`
       and `~/.node-24.18.1` first, and everything below the interactivity guard is dropped,
       including Volta's setup, so Volta's Node leaves interactive shells.
     - The pinned Node goes to `~/.node-24.18.1`, beside Volta. Bun 1.4.4 already sits at
       `~/.bun-1.4.4`; its directory mode becomes 0755, as on h4claw (H4-A4).
     - The pinned gh `.deb` replaces the apt gh if they differ. On h2puni `/usr/bin/gh` is 2.97.0
       from GitHub's apt repository and the pin is 2.102.1, so it changes; a later `apt upgrade`
       moves it off the pin again, and validate fails until the role is reapplied. Whether the
       `.deb` install downgrades a newer installed gh is not observed.
     - The apt list installs `busybox`, which removes `busybox-static`. h2puni has
       `busybox-static` and no `busybox`, so the swap happens there as on h4claw (H4-A3), and it
       recurs whenever something reinstalls `busybox-static`.
     - `~/.venv-solver` is created or brought to the lock, and the template puts it first, so
       every non-interactive `ssh puni1@h2puni CMD`, gate or not, gets the venv's `python3`
       instead of `/usr/bin/python3`. Linger turns on for `puni1`.
     - Unchanged: login shells still get Volta. `~/.profile` prepends `~/.local/bin` and Volta
       after it sources `~/.bashrc`, so Volta's Node shadows the pin there. Gates are unaffected, because
       `ssh host CMD` is not a login shell.
     - The role creates `~/.config/systemd/user`, the Dash directories and the token units, and
       installs the Dash units but does not enable them. It clones `~/puni-00-gate-tbf2` and
       `~/puni-00-gate-launcher`, which is why step 1's disk comes first.
   - h2puni's `puni_gate_pool_launcher_checkouts` host var in
     `infra/ansible/inventory/production-existing-hosts.yml` adds `~/wbs-dev/src`, from which the
     dev poller launches `solver-image-publish`; `ops pool switch-mode concurrent` verifies both
     checkouts. h4claw keeps the role default.
   - Before applying, check that the live shared `~/puni-00-gate-tbf` reports
     `git remote get-url origin` = `https://github.com/Prosperous-Unification/puni-00.git`, is not
     shallow or blobless, and has an empty `git status --porcelain`. `validate` refuses anything
     else, and a refusal mid-apply leaves the host half-configured.
   - Apply only after step 1's disk and the backup bullet above: the role's free-space refusal
     runs after it has replaced `~/.ssh/authorized_keys`, rendered `~/.bashrc` and installed the
     pins, so applying with too little disk half-configures the host. The order is: disk
     (step 1); the backup; the key list staged from the live file and checked with `cmp` and the
     key count ([Add a gate host](#add-a-gate-host) step 2); `bin/with-heavy-lock.sh status`
     reading `holder none` and the dev poller idle (a `pgrep -f` probe over ssh matches its own
     remote shell, H2-A11, so filter it with `pgrep -af … | grep -v pgrep` or a bracket pattern); apply 1; a
     `puni1` login from a second session before closing the first; apply 2, with `changed=0`;
     then `--tags validate`.
1. **Disk.** On h2puni, free space before step 0's apply: the recorded cleanup order is the "h2puni DISK, FOR DANY"
   entry of 2026-11-02 in the private `puni-plan` `RESUME.md`, and Dany approves it. The role
   refuses to clone below 5 GiB per missing checkout plus 10 GiB. On h2puni, which lacks two
   checkouts, that means at least **20 GiB free** before the apply; a fresh host lacking all three
   needs **25 GiB**. The `/var/tmp` and dangling-image cleanup alone (about 13 GB) is not enough
   from today's 8 GB: the clean, pushed clone deletions in that entry are needed too.
2. **Inputs.** WBS is deployed before Dash (`resources.md`, deploy order). An organization admin
   binds the host's machine credential to its provider, authority and epoch. Add to the host's
   `$OPS/gate.json`, mode 0600:
   `"puni_gate_host_pool_enroll": true, "puni_gate_host_pool": {"authorityId": …, "epoch": …,
"providerId": …, "mcpResource": "https://…/mcp", "credential": "wbs_mk_…", "diskBudgetUnits": …}`.
   Units are GiB. The budget must leave `headroomBytes` (10 GiB) free beyond it whenever a
   calibration runs. Headroom is a separate role input, `puni_gate_pool_headroom`; once the pool
   is initialized it is pinned, so reapplies must carry the enrolling vars (step 7).
3. **Drain.** Stop intake, including unattended intake: on h2puni the dev poller's
   `solver-image-publish` launches heavy jobs by itself, so stop the poller first. Then let the
   host's heavy queue drain (`bin/with-heavy-lock.sh status` reads `holder none`). Enrolling while
   a gate is queued is operator error (S6-A14).
4. **Apply.** Run the playbook twice as in [Add a gate host](#add-a-gate-host). The second run
   must print `changed=0`. The configuration now exists, so the host is enrolled; until step 5 a
   launcher refuses, because the ledger is missing.
5. **Initialize, then start the watch (6.4, 6.7).** Prerequisite: the `dash-host-jobs` plan is
   on `main`, so the launcher checkout's HEAD (it clones `origin/HEAD`, which is `main`) carries
   `infra/jobs/catalogue.json` and `run_heavy_job`. Ansible never moves its head after the
   clone, so first bring it to current `main` while no job runs from it
   (`git fetch -q origin && git checkout -q --detach origin/main`): h4claw's was found detached at
   an older SHA (H4-A9). This first move stays manual: the refresh timer runs the script from the
   checkout itself, so a checkout older than the script cannot refresh itself. As `puni1`, in
   `~/puni-00-gate-launcher`, run as one line so the watch and the timers start only on a
   successful init and before any job:

   ```sh
   bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops pool init --config ~/.config/dash/host-pool.json && systemctl --user start dash-resources-watch.service dash-job-audit.timer gate-launcher-refresh.timer
   ```

   Prove the restart once with `kill -9` on the watch's `MainPID`. Since 2026-11-12 the unit
   has `Restart=always`: a plain `kill` (SIGTERM, the watch's modelled cancellation, which
   `resources/command.ts` answers by returning 0), a refusal thrown out of `runResources`
   (nonzero through `entrypoint.ts`) and a SIGKILL all restart it after `RestartSec`. Only
   `systemctl --user stop` keeps it down: `man systemd.service` exempts a service "stopped with
   systemctl stop or an equivalent operation" from every `Restart=` setting. A host converged
   before that change still runs `Restart=on-failure` until its next apply and a
   `systemctl --user daemon-reload`, which the role runs when the unit file changed. On h4claw
   (2026-11-08), `puni1` over ssh could not read its own journal: `journalctl --user` printed "No
   journal files were opened due to insufficient permissions". h2puni's journal access over ssh is
   not observed. Read the restart from
   `systemctl --user show -p NRestarts,MainPID,ActiveState,InactiveExitTimestamp,ActiveEnterTimestamp dash-resources-watch.service`
   instead, before and after the kill. `NRestarts` goes up by one per kill, and
   `ActiveEnterTimestamp` lands `RestartSec` (30 s) after `InactiveExitTimestamp`. The counter
   counts automatic restarts, not their cause, and `show` keeps only the latest timestamp pair, so
   record the kill itself. `ops pool inspect` must show the same `guard`, `guardHolder` and unit
   holders before and after. In observe mode `guardHolder` is always `null`, so there this proves
   only the restart. A guard holder surviving a restart can be shown only in concurrent
   mode (step 8, 6.5). Rerun `--tags validate`. It is a read-only probe, not step 4's converging
   second apply.

6. **Observe for a week (6.4).** On h4claw, first calibrate `gate` through step 7 before
   launching further observe-mode gates: the first run is throttled at the 6 GiB estimate
   ([known issue](#launch-a-gate-on-h4claw)). Every launcher goes through `run_heavy_job` in observe mode. Gates
   launch from `~/puni-00-gate-launcher`. From step 5 on, `gate-launcher-refresh.timer` keeps it
   fresh: hourly, with up to five minutes' random delay and catching up after downtime, it
   fetches `origin`. If `main` moved, and no process of `puni1` other than the watch's works in
   the checkout, it checks out `origin/main` detached and runs the frozen install when `bun.lock`
   changed. Then it restarts the watch, which runs from the same checkout, only if it was
   running. Otherwise it exits 75 and the next hour retries. A checkout with edited tracked
   files is refused 65, never moved over. A failed fetch, checkout, install or restart is 70.
   Read the most recent run's outcome with
   `systemctl --user show -p ExecMainStatus,ExecMainExitTimestamp gate-launcher-refresh.service`
   (on h4claw the journal is unreadable over ssh, as in step 5). It shows only the latest
   invocation, so a 70 followed by a 75 reads as 75. A running or waiting gate from the
   launcher works in the checkout, so 75 is the expected outcome while gates run.
7. **Calibrate and propose (6.4).** Run `ops job calibrate` cold and warm for each type, then
   `ops job propose`, and land the catalogue PRs. Budgets and headroom are pinned at step 5: once
   the pool is initialized, a changed `nproc`, MemTotal GiB, headroom, unit list, enrollment id or
   disk input stops the role before it rewrites the configuration ("pinned field differs from
   the ledger"). Choose headroom before init; changing it later needs re-enrollment, which with
   the fixed root means retiring the ledger first. h4claw's ledger pins headroom 1 core and 5 GiB,
   not the role default of 1 core and 2 GiB. The staged enrolling vars file
   `$OPS/gate.json.enroll-h4claw.2026-11-08` sets
   `puni_gate_pool_headroom {cpuCores 1, memoryGib 5}`, matching the rendered host configuration
   in a comparison on 2026-11-09 (verify.md). The vars actually passed to the lost applies and
   why 5 GiB was chosen are not recorded. Preserve the pinned headroom on every reapply;
   the other pinned fields in the staged file have not been checked against the ledger, so a
   successful reapply with that file stays owed. A reapply with the default 2 GiB stops at
   "pinned field differs from the ledger".
8. **Switch (6.5).** Run `ops pool switch-mode concurrent` after the five-launcher checklist, with
   the types allowed to overlap listed in `puni_gate_pool_concurrency_eligible`. Reapply the role
   to write them.

   **Setting `concurrencyEligible` on an enrolled host.** Set the host var
   `puni_gate_pool_concurrency_eligible` in `infra/ansible/inventory/production-existing-hosts.yml`
   (never the role default, which stays `[]`; an `--extra-vars` file setting it would win) and run
   a converging apply. The field is not pinned,
   so the pinned-field probe lets the role rewrite `host-pool.json` with the new list. Nothing
   re-runs `ops pool init`. The next `ops` open of the pool (`job run`, `job status`,
   `pool inspect` and the rest; `resources watch` and the read-only `job admission` do not
   check) refuses 64 an id that no
   listed launcher checkout's catalogue names at HEAD, and lists a checkout without a readable
   catalogue as `unverified` (`checkEligibleTypes`, lenient). In observe mode the list changes no
   admission. Admission reads it only in concurrent mode (`mayOverlap` in `runtime.ts`), and
   `switch-mode concurrent` checks it strictly. The candidates are `release-build`,
   `solver-image-publish` and `website-dev-build`; `gate` is excluded while its containers run
   unattributed (the J16 row in [heavy job launchers](heavy-job-launchers.md)). The first two are
   in puni-00's catalogue, which `~/puni-00-gate-launcher` carries (and on h2puni also
   `~/wbs-dev/src`). `website-dev-build` is only in puni-pr-00's `infra/jobs/catalogue.json`, so a
   puni-pr-00 checkout owned by `puni1` must be added to `puni_gate_pool_launcher_checkouts`.
   Without it, every open refuses 64. With it, `switch-mode concurrent` still refuses 70 for that
   checkout while puni-pr-00 carries no `bin/heavy-lock-lib.sh` defining `run_heavy_job` at HEAD:
   its launcher sources the gate tree's (absent at puni-pr-00 `origin/main`, read 2026-11-12). For now
   list only `release-build` and `solver-image-publish`, knowing that both declare the exclusive
   unit `dagger_engine`, so this list lets no two jobs overlap yet: the switch then installs the
   singleton guard and the fence, not parallel admission, until a type without that shared unit
   is eligible. `website-dev-build` waits for that
   library, and `gate` stays unlisted until the
   [conflict inventory](heavy-job-launchers.md#conflict-inventory-j3)'s unbounded containers are
   covered.

   ```sh
   fleet_ansible --limit <host> --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml   # from the controller, as in Add a gate host
   # then, as puni1 in ~/puni-00-gate-launcher:
   bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops pool inspect --config ~/.config/dash/host-pool.json
   bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops pool switch-mode concurrent --config ~/.config/dash/host-pool.json --operator <name>
   ```

## Launch a gate on h4claw

h4claw has been enrolled in observe mode since 2026-11-08, so launch from `~/puni-00-gate-launcher`:

```sh
ssh puni1@<h4claw public address> \
  'cd ~/puni-00-gate-launcher && git fetch -q origin && bin/h2puni-gate.sh <sha>' > gate-<sha8>.log 2>&1
```

Known issue, pending as of 2026-11-08 22:50Z. The first gate from this path, `gate:a5e9dbe9`, ran
under `MemoryHigh` at the `gate` type's estimated 6 GiB and was throttled: `memory.peak` reached
6.93 GiB, `memory.pressure` stayed above 90 %, two `bun test` runs timed out and three `eslint`
runs hit heap OOMs. At 3 h 05 min it was still in its first `nx run-many`, and its exit is not
recorded ([dash-host-jobs verification](../../openspec/changes/dash-host-jobs/verify.md), EV-A5).
The latest upstream report says it was still held at 23:57Z (4 h 12 min); that time is unverified
(EV-A8). The 22:50Z read remains the last coordinator observation.
A gate that fails under this throttling is an observed gate failure: its cause needs resolving,
and it is not a pass. Rerun that sha's canonical gate on h2puni for final qualification. An
h4claw rerun becomes a verdict only once `gate` is calibrated and this path has a recorded
passing terminal gate (6.4). Memory pressure alone cannot diagnose the payload, and a red run
never becomes a qualification pass. The `gate` type must be calibrated (step 7 of
[Enroll a host in the host pool](#enroll-a-host-in-the-host-pool)) before this path's run time
or failures can be judged. The canonical gate is unchanged: a gate passes only by exiting 0, as
on h2puni.

Before 2026-11-08 h4claw was gated from the shared gate tree. That form is for a host that is not
enrolled, and it is kept here only as the pre-enrollment record; do not use it on h4claw:

```sh
ssh puni1@<h4claw public address> \
  'cd ~/puni-00-gate-tbf && git fetch -q origin && bin/h2puni-gate.sh <sha>' > gate-<sha8>.log 2>&1
```

The sha must resolve in the launcher, because the admitted gate tree fetches it from there, so
fetch the branch that carries it. A fetch moves no head. After `ops pool init`, never check
out in the launcher: the refresh timer owns its head. Step 5's one-time bootstrap before init
is the manual exception. `run_heavy_job` then runs the payload as `ops job run --type gate`,
and the pool hands it a free gate tree. A launcher working in a unit holds it (J19, S6-A6), so
the pool would always hand out `tbf2`, and two gates would serialise without saying why. Read the running job and the waiters, oldest first, with
`bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job status --config ~/.config/dash/host-pool.json`
from the launcher.

The [Gate](../../AGENTS.md#gate) rules are the same as on h2puni:

- Pass the sha. Do not check it out first.
- Trust the printed `h2puni gate: running on <sha>`.
- Exit 65 means the tree is dirty, and exit 66 means it has unreadable tracked paths.
- `bin/with-heavy-lock.sh status` names the holder of the lock on that host. On an enrolled host
  in observe mode the holder is `dash-job-<job id>`, held through a file in the ledger's
  `legacy-holds/` until the job settles.
- Every launcher enters through `run_heavy_job`, which takes this lock on a host that is not
  enrolled in a Dash host pool, and admits the job through the pool on one that is. h4claw is
  enrolled in observe mode; h2puni is not yet. See [heavy job launchers](heavy-job-launchers.md).

## Capacity reports into WBS

Each gate host is meant to report its memory, `/tmp` disk and agent slots to WBS as an `ssh_host`
compute provider through Dash's
[`report-capacity`](../../apps/twilight-structure/twilight-dash/cli/README.md#report-capacity).
The operator steps (registering `h2puni` and `h4claw`, the agent person's API key, running the
reporter as `puni1`) are task 2.4 of
[compute-providers](../../openspec/changes/compute-providers/tasks.md) and land here with it.
