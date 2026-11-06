# Proposed administrator audit-status inspection

**Prepared for review only; not authorized or executed.** The goal forbids bypassing denied access. The existing UID1000 status-only AUDIT_GET returned EPERM1; rsyslog spool metadata returned EACCES13. No retry through a different account or interface occurred. This proposal requests a legitimate operator route for one additional read, with no policy, service, Secret, storage or deployment change.

The source [audit-status-inspection.py](evidence/audit-status-inspection.py) is a diagnostic outside the six-role settlement runtime. It issues exactly one AUDIT_GET using the fixed installed libaudit, joins no multicast group, invokes no setter/rule/event-subscription API and returns status metadata or explicit unavailable. It cannot qualify or authorize settlement. Script bytes7377, SHA256 `ae7f11ccf537486196c44554ab2606d457e179d90c8dea9602a1d49e209cfa49`. The proposal has not been functionally tested or run as administrator. Installed ABI/version references and the earlier unprivileged denial are in [consumer facts](evidence/settlement-consumer-facts-20261106.md).

The exact command below verifies one bounded nonfollowing source buffer against that fixed hash and stable descriptor/path identity, closes it, and executes the captured bytes. It uses the synthetic `<audit-status-inspection>` compilation filename and `__file__`, so traceback linecache cannot reopen the mutable source path after verification. It never reopens a mutable script path or launches a child Python controller. Python-I-B-S suppresses caller Python environment, bytecode writes and automatic site hooks. The existing timeout limits the single Python child to5seconds; its native socket closes once on normal paths and the kernel reclaims it on termination. The script additionally bounds status replies to4frames/1second and output to65536bytes. Root-owned interpreter/library inputs remain the normal administrator trust boundary; their startup effects are not newly qualified by this command.

## Exact proposed command

Run only on the current rehearsal machine containing this worktree, and only after an authorized administrator has reviewed and approved the command. Do not infer authorization from this document or an elapsed approval timer.

```sh
sudo /usr/bin/timeout --foreground --signal=KILL 5s /usr/bin/python3 -I -B -S -c 'import hashlib,os,stat,sys
path="/home/df/.codex/worktrees/aa39/puni-00/openspec/changes/observability-environment-parity/evidence/audit-status-inspection.py"
expected="ae7f11ccf537486196c44554ab2606d457e179d90c8dea9602a1d49e209cfa49"
fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
    before=os.fstat(fd)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or not 0<before.st_size<=16384:
        raise RuntimeError("inspection source metadata refused")
    payload=os.read(fd,16385)
    after=os.fstat(fd)
    named=os.lstat(path)
    mark=lambda entry:(entry.st_dev,entry.st_ino,entry.st_uid,entry.st_mode,entry.st_nlink,entry.st_size,entry.st_mtime_ns,entry.st_ctime_ns)
    if len(payload)!=before.st_size or hashlib.sha256(payload).hexdigest()!=expected or mark(before)!=mark(after) or mark(before)!=mark(named):
        raise RuntimeError("inspection source identity or hash refused")
finally:
    os.close(fd)
sys.argv=["audit-status-inspection"]
exec(compile(payload,"<audit-status-inspection>","exec"),{"__name__":"__main__","__file__":"<audit-status-inspection>"})
'
```

An observed result would close only kernel status availability. Complete audit rule/event multiplicity, receiver/store/gross allocation, fsnotify callbacks, spool facts and first-access/quiescence still need proof. In particular, this command does not list audit rules or inspect the denied spool. It must not be presented as completing the160MiB equation, removing oldG/K, enabling a native request or requiring new hardware. The administrator may instead provide an existing approved read-only inspection route; no new permanent privilege or monitoring service is proposed.

## Review status

[Independent static review](evidence/audit-status-inspection-review.md) approved presentation to an authorized administrator after the synthetic traceback-name correction. It did not authorize or execute the command. A harmless ordinary-user traceback fixture confirmed why the correction was needed; no diagnostic/libaudit call ran in that fixture. The actual installed library's error-return and kernel-sender validation were checked by static disassembly. Functional source/parser/timeout/close negatives and successful kernel parsing remain untested. The65536-byte limit applies to serialized JSON; a hard bound on all native/interpreter output is not claimed. Outer5seconds bounds the owned child under normal schedulable execution, not sudo authentication or uninterruptible kernel sleep.
