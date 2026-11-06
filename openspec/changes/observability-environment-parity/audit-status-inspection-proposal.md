# Proposed administrator audit-status inspection

**Prepared for review only; not authorized or executed.** The goal forbids bypassing denied access. The existing UID1000 status-only AUDIT_GET returned EPERM1; rsyslog spool metadata returned EACCES13. No retry through a different account or interface occurred. This proposal requests a legitimate operator route for one additional read, with no policy, service, Secret, storage or deployment change.

The source [audit-status-inspection.py](evidence/audit-status-inspection.py) is a diagnostic outside the six-role settlement runtime. It issues exactly one AUDIT_GET using the fixed installed libaudit, joins no multicast group, invokes no setter/rule/event-subscription API and returns status metadata or explicit unavailable. It cannot qualify or authorize settlement. Script bytes9442, SHA256 `20ebfae763bdd9fcc2ffee03b64b72be5f00b17fb7e8b9a5a825ade73333ca16`. Task119 functionally tested the source and captured-buffer command with fake native boundaries and disposable files. The administrator command has not been authorized or executed. Installed ABI/version references and the earlier unprivileged denial are in [consumer facts](evidence/settlement-consumer-facts-20261106.md).

The exact command below verifies one bounded nonfollowing source buffer against that fixed hash and stable descriptor/path identity, closes it, and executes the captured bytes. It uses the synthetic `<audit-status-inspection>` compilation filename and `__file__`, so traceback linecache cannot reopen the mutable source path after verification. It never reopens a mutable script path or launches a child Python controller. Python-I-B-S suppresses caller Python environment, bytecode writes and automatic site hooks. The existing timeout limits the single Python child to5seconds; its native socket closes once on normal paths and the kernel reclaims it on termination. The script accepts at most four reply frames within one second after the status request and caps serialized JSON at65536bytes. Clock checks reject late selector readiness and late replies; they do not preempt a native call or guarantee one-second process completion. Root-owned interpreter/library inputs remain the normal administrator trust boundary; their startup effects are not newly qualified by this command.

## Exact proposed command

Run only on the current rehearsal machine containing this worktree, and only after an authorized administrator has reviewed and approved the command. Do not infer authorization from this document or an elapsed approval timer.

```sh
sudo /usr/bin/timeout --foreground --signal=KILL 5s /usr/bin/python3 -I -B -S -c 'import hashlib,os,stat,sys
path="/home/df/.codex/worktrees/aa39/puni-00/openspec/changes/observability-environment-parity/evidence/audit-status-inspection.py"
expected="20ebfae763bdd9fcc2ffee03b64b72be5f00b17fb7e8b9a5a825ade73333ca16"
# Proof: captured-buffer bootstrap nofollow/missing/unreadable refuses before execution.
fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
    before=os.fstat(fd)
    # Proof: bootstrap guard proof rejects omission of metadata for metadata-hardlink.
    if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or not 0<before.st_size<=16384:
        raise RuntimeError("inspection source metadata refused")
    payload=os.read(fd,16385)
    after=os.fstat(fd)
    named=os.lstat(path)
    mark=lambda entry:(entry.st_dev,entry.st_ino,entry.st_uid,entry.st_mode,entry.st_nlink,entry.st_size,entry.st_mtime_ns,entry.st_ctime_ns)
    # Proof: bootstrap hash/length/descriptor/path omissions fail their selected fault cases.
    if len(payload)!=before.st_size or hashlib.sha256(payload).hexdigest()!=expected or mark(before)!=mark(after) or mark(before)!=mark(named):
        raise RuntimeError("inspection source identity or hash refused")
finally:
    # Proof: bootstrap guard proof rejects omission of close for success.
    os.close(fd)
sys.argv=["audit-status-inspection"]
# Proof: bootstrap filename for success and reopen for no-reopen omissions fail.
exec(compile(payload,"<audit-status-inspection>","exec"),{"__name__":"__main__","__file__":"<audit-status-inspection>"})
'
```

An observed result would close only kernel status availability. Complete audit rule/event multiplicity, receiver/store/gross allocation, fsnotify callbacks, spool facts and first-access/quiescence still need proof. In particular, this command does not list audit rules or inspect the denied spool. It must not be presented as completing the160MiB equation, removing oldG/K, enabling a native request or requiring new hardware. The administrator may instead provide an existing approved read-only inspection route; no new permanent privilege or monitoring service is proposed.

## Review status

[Independent static review](evidence/audit-status-inspection-review.md) approved presentation to an authorized administrator after the synthetic traceback-name correction. It did not authorize or execute the command. A harmless ordinary-user traceback fixture confirmed why the correction was needed; no diagnostic/libaudit call ran in that fixture. The actual installed library's error-return and kernel-sender validation were checked by static disassembly. That static checkpoint preceded Task119 functional tests. Real installed-library and kernel parsing remain untested; the fake-native results below do not qualify them. The65536-byte limit applies to serialized JSON; a hard bound on all native/interpreter output is not claimed. Outer5seconds bounds the owned child under normal schedulable execution, not sudo authentication or uninterruptible kernel sleep.

## Current functional verification

The source above rejects late readiness and replies against the existing one-second post-request acceptance window, with adjacent Proof annotations. The prior static review describes the earlier source version. The frozen fake-native cohort passed96cases with262assertions in3.02seconds, including35 watched guard omissions. It exercises the actual source and extracted command body through fail-closed fake native APIs and real owned temporary files. [Independent scoped review](evidence/audit-status-inspection-functional-review-20261106.md) passed specification and approved quality, with one nonblocking Proof-comment wording nit recorded in the report. No administrator authorization or execution is implied. The exact source-buffer hash in this command is refreshed from the current9442-byte payload, without changing its16384-byte input cap, fixed read-only API, external five-second child timeout or65536-byte serialized-output cap.
