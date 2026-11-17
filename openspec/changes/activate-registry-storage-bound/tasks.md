## Delivery boundary

Read [the design](design.md) and [requirements](specs/registry-storage-bound/spec.md)
first. Sections 1 and 2 are agent code and review. Sections 3 and 4 are attended:
each step names who runs it. Agents never ssh to a production host and never run an
attended step. No step deletes registry content. Never fill the live root filesystem;
saturation runs only on disposable loop fixtures.

## 1. Agent code slices (TDD)

Each slice: write the named tests first, watch them fail, implement, inject the named
fault, watch the named test fail, restore, add the adjacent `Proof:` comment.

- [ ] 1.1 Bound-only guard and patch, static contract. Add
      `infra/platform/registry/production/bound-startup.sh` and
      `bound-storage-patch.yaml` (design decisions 1 and 2). Add
      `infra/ansible/tests/registry-bound-guard.test.ts`. Tests:
      `verify_mount matches the lifecycle guard byte for byte`,
      `bound patch differs from the lifecycle patch only in the guard command`,
      `rendered Deployment uses registry-bounded with DELETE disabled` (pinned
      `kubectl patch --local --type=strategic` over `base/registry.yaml`, as the
      existing admission test does). Faults: change one byte of the copied
      `verify_mount`; drop the DELETE env entry from the bound patch. Do not edit
      `startup.sh`, `storage-patch.yaml` or `registry-storage.test.ts`.
- [ ] 1.2 Physical guard rehearsal on a root-capable fixture host. Add
      `infra/ansible/tests/registry-bound-rehearsal.sh`, `registry-bound.test.ts` and a
      non-cached Nx target `tool-fleet:test:registry-bound` with the same
      `REGISTRY_STORAGE_SSH` / `REGISTRY_STORAGE_HOST` inputs as
      `test:registry-storage`. Reuse `storage.sh` to build 64 MiB registry and 32 MiB
      journal fixtures. Run pinned Distribution 2.8.3 by digest as UID/GID 59001,
      all capabilities dropped, with a read-only container root. Fill to 90% by
      writing directly into the fixture as root, never through the host root. Tests:
      `wrong mount refuses start`, `push below fence is accepted`,
      `push at fence gets 405 and pull is served`,
      `inode fence refuses push despite free bytes`,
      `fence stays latched across restart`,
      `unreadable measurement runs read-only`, `delete returns 405`,
      `saturation leaves root reserve intact`, `cleanup`. Faults, one per run:
      remove the latch check (restart test sees 202); remove the inode comparison
      (inode test sees 202); make a failed measurement count as writable (sees 202);
      remove the `verify_mount registry` call (wrong mount starts); remove the DELETE
      env (DELETE is accepted). This slice also settles open question 5.
- [ ] 1.3 k3s dependency choice in the `registry_storage` role. Add
      `files/k3s-storage-wants.conf` (`Wants=` and `After=`), a variable
      `puni_registry_storage_k3s_dependency` (default `requires`) and an assert
      before any host write. Extend `infra/ansible/tests/registry-hosts.test.ts`
      with new cases only: `wants dependency orders k3s without requiring storage`
      (rendered drop-in passes real `systemd-analyze verify`, has no `Requires=`),
      `unknown k3s dependency refuses before host writes`, and
      `requires stays the default`. Fault: remove the assert, observe the unknown
      value write a drop-in. Existing assertions and `Proof:` lines stay unchanged.
- [ ] 1.4 Bounded backup runner. Add `tools/tool-fleet/src/backup-bounded-registry.ts`
      from `git show 6e37b3fc7:tools/tool-fleet/src/backup-registry.ts`, changing only
      the identity predicate (design decision 6). Port
      `git show 6e37b3fc7:tools/tool-fleet/src/backup-registry.test.ts` to
      `backup-bounded-registry.test.ts` with the bounded fixture. New tests:
      `backs up the bounded local path`, `refuses claim registry before any mutation`,
      `refuses a hostPath PV before any mutation`,
      `refuses a different local path before any mutation`,
      `refuses an unmounted bounded path before any mutation`. Faults: remove each
      predicate in turn; its negative must reach Flux suspension or scaling in the
      fixture. Run the external-binary cases with `PUNI_TEST_RESTIC_BINARY` set to the
      locked restic, and record that they ran. Main's `backup-registry.ts` stays the
      lifecycle wrapper.
- [ ] 1.5 Private fleet equality. Add `infra/ansible/tests/registry-bound-fleet.test.ts`:
      the fleet copies of `bound-startup.sh` and `bound-storage-patch.yaml` equal the
      public files byte for byte; the new root JSON patch's child patch equals
      `bound-storage-patch.yaml`; applying it with pinned `kubectl patch --local`
      keeps the existing Flux holds and source reference. Fault: change one byte in
      an isolated fleet copy. Requires the private companion checkout, like the
      existing equality test.
- [ ] 1.6 Runbook and JSDoc. Add a "Bound-only operation" section to
      `docs/infra/registry.md`: what the latch is, the 70% stop rule, how to read usage,
      why reopening needs a bound raise or the lifecycle, boot-failure recovery
      (design decision 4), and which runner file is installed. JSDoc on the runner's
      identity check names the bounded PV contract. Run the Burokrat `check-indexes`
      CLI and the tool-devsync doc tests.
- [ ] 1.7 Checks before review. Focused tests above with real output, changed-file
      lint and typecheck for tool-fleet, ShellCheck on the new script, format check,
      `openspec validate --all --json`, then the canonical host gate per the AGENTS.md
      Gate section. Independent review before merge.

## 2. Fleet pull request (agent prepares, owner merges)

- [ ] 2.1 In the private fleet repository: add `bound-startup.sh` and
      `bound-storage-patch.yaml` byte-identical to public main; list both scripts in
      the `registry-storage-guard` ConfigMap generator; add the bound-only root JSON
      patch; add the registry storage Kustomization to the cluster kustomization;
      resync the lifecycle staging copies so the existing public equality test passes.
      Proof: `fleet-check`, test 1.5 and the existing `registry-storage.test.ts`
      equality case against the PR head. Do not merge before 3.3 has passed: the PV's
      local path must exist first. Rollback: revert the PR; the PV and PVC carry
      `prune: disabled`, so remove them by hand if needed.

## 3. Attended host steps (operator with root on h4claw)

Each step: run the command, record the receipt in verify.md, stop on the stated
condition, and know the rollback before starting.

- [ ] 3.1 Read-only preflight.
      Commands: `df -B1 /`; `sha256sum /root/.puni/registry/backup-registry.ts`;
      `systemctl cat puni-registry-backup.service`; the catalogue and each tag's
      manifest digest through the authenticated API; `kubectl get pv <registry PV> -o
jsonpath='{.spec.hostPath.path}'`.
      Receipt: free bytes, runner hash, unit text, catalogue and digest list, old path.
      Stop: free space below 71 GiB; runner hash differs from
      `ee41d36b1f52f65152bcdf6c061a1c4d02a2ef86b91c53c345bcd5aa806bc9bb`; catalogue
      larger than expected (re-plan migration time). Rollback: none needed.
- [ ] 3.2 Backup the old store with the installed unit.
      Commands: `systemctl start puni-registry-backup.service`; read the success
      receipt; `restic check --read-data` with the operator's restic environment.
      Receipt: snapshot ID, processed bytes, check result.
      Stop: non-zero exit or zero processed bytes. Rollback: the runner restores Flux
      and replicas itself; confirm the registry is Ready.
- [ ] 3.3 Provision bounded storage.
      Command: `ansible-playbook infra/ansible/playbooks/registry.yml --tags
registry_storage -e puni_registry_storage_enrolled=true -e
puni_registry_storage_k3s_dependency=wants` from main at the merged SHA; then
      `/usr/local/libexec/puni-registry-storage/storage.sh verify
/etc/puni/registry-storage.json`; `df -B1 /`; `systemctl cat k3s.service`; repeat
      the playbook.
      Receipt: role output, verify output, both receipts under
      `/var/lib/puni-registry/journal/identities/`, root free after, k3s drop-in text,
      second run `changed=0`. **Receipt A: bounded filesystem.**
      Stop: any failure, root free below 20 GiB after, or a second run that changes
      anything. Rollback: `systemctl disable --now puni-registry-storage.service`;
      remove `/etc/systemd/system/k3s.service.d/registry-storage.conf`;
      `systemctl daemon-reload`. Removing the backing files is a separate owner
      decision.
- [ ] 3.4 Merge the fleet PR (owner). Wait for Flux.
      Receipt: PV `registry-bounded` and PVC Bound; ConfigMap keys `startup.sh` and
      `bound-startup.sh` hash equal to public main; registry still on claim
      `registry`. Stop: any difference. Rollback: revert the PR.
- [ ] 3.5 Wrong-mount refusal at the installed guard. Agent prepares a disposable Pod
      manifest in `puni-registry`: same image digest, UID 59001, installed
      ConfigMap, `registry-journal` read-only, and an `emptyDir` as the registry
      path. Operator applies it with `kubectl apply -f`, then reads status and logs.
      Receipt: container exit code non-zero, no Distribution start line, empty
      `emptyDir`. **Receipt B: start-up refusal on a wrong mount.**
      Stop: the container serves on port 5000. Rollback: `kubectl delete pod`.
- [ ] 3.6 Migration window (design decision 5).
      Commands, in order: set `spec.suspend: true` on Kustomizations `puni-cluster`
      and `platform` (`kubectl -n flux-system patch kustomization <name> --type=merge
-p '{"spec":{"suspend":true}}'`); `kubectl -n puni-registry scale deployment
registry --replicas=0`; wait for no registry Pod, then confirm replicas stay 0
      for two minutes (an in-flight reconcile could restore them);
      `cp -a <old path>/. /var/lib/puni-registry/registry/contents/`;
      `chown -R 59001:59001 /var/lib/puni-registry/registry/contents`; on both trees
      `find . -type f -print0 | sort -z | xargs -0 sha256sum` into two files and
      `diff` them; check each `blobs/sha256/*/*/data` hashes to its directory name;
      apply the bound-only root patch to `puni-cluster` (method: open question 1);
      set `spec.suspend: false` on `platform`, then on `puni-cluster`.
      Receipt: both hash lists equal, blob check output, Pod Ready,
      `/proc/self/mountinfo` from the Pod, catalogue and every tag digest equal to
      3.1, an uncached pull of `activation/proof` by digest on a node.
      Stop: any hash or digest difference, Pod not Ready in 5 minutes. Rollback:
      remove the root patch, resume both Kustomizations, confirm claim `registry`
      and the 3.1 digests. The old store was never written.
- [ ] 3.7 DELETE and push at the installed registry.
      Commands: push a one-layer probe image to `activation/delete-probe` with the
      operator's client, recording each upload status; authenticated DELETE of that
      probe's manifest digest; a pull of the probe and of `activation/proof` by digest.
      Receipt: upload POST status 202 and push success; DELETE status 405; both
      manifests still pullable. **Receipt D: DELETE returns 405.** The probe's few
      bytes stay in the store for good; nothing can delete them in this change.
      Stop: DELETE succeeds. Rollback: none for the probe; if DELETE succeeded, stop
      all pushes and re-run 1.2 and 3.4 before anything else.
- [ ] 3.8 Write fence at the installed guard bytes.
      Filling the production filesystem is forbidden. Run
      `tool-fleet:test:registry-bound` against h4claw as the fixture host, with the
      guard bytes read from the installed ConfigMap, and record their SHA256.
      Receipt: rehearsal PASS lines for the 90% fence, inode fence and latch, plus the
      ConfigMap hash equal to the rehearsed file. **Receipt C: the 90% write fence.**
      Stop: any failure or hash difference. Rollback: none; fixtures clean
      themselves up.
- [ ] 3.9 Switch nightly backups to the bounded runner.
      Commands: install `tools/tool-fleet/src/backup-bounded-registry.ts` from the
      merged SHA at `/root/.puni/registry/backup-registry.ts`, root:root 0600; record
      its SHA256; `systemctl start puni-registry-backup.service`;
      `restic check --read-data`; restore the snapshot on h3mon into an isolated
      directory and verify the `activation/proof` manifest and every blob by digest,
      as in the activation recovery drill.
      Receipt: installed hash, snapshot ID, processed bytes, check result, restore
      verification. Stop: any failure. Rollback: reinstall
      `git show 6e37b3fc7:tools/tool-fleet/src/backup-registry.ts` (hash
      `ee41d36b…`) only if the registry was also rolled back to claim `registry`.

## 4. Attended activation receipts

The change is active only when verify.md holds all four, each with its command, time
and the SHA it ran against:

- [ ] A. Bounded filesystem: `storage.sh verify` output, both identity receipts, root
      free after provisioning and the idempotent second run (3.3).
- [ ] B. Start-up refusal on a wrong mount at the installed guard (3.5).
- [ ] C. The 90% write fence: 405 at the fence, pulls served, latch held across
      restart, rehearsed on the installed guard bytes (3.8).
- [ ] D. DELETE returns 405 at the installed registry while uploads still get 202
      (3.7).
- [ ] 4.1 Update the "Storage protection" section of `docs/infra/registry.md` from
      proposed to active (bound-only), linking verify.md.
