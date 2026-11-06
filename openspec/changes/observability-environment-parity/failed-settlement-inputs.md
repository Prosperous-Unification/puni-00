# Failed-settlement outside-input qualification

The approved fixed32MiB nine-record theorem remains conditional and unchanged. The current source/runtime/tool invocation is **not yet qualified** for total causal filesystem allocation. This is a missing proof, not an observation of unbounded actual allocation. No denied security control read is bypassed or interpreted as disabled.

The exact selected source is `pop-os/linux@49748809f7e18ca62f2e054523f1e2c0eb7a88ad`. A narrow cache review checked25 complete bodies,1059297bytes, against the existing SHA256/size/Git-blob manifests. It did not repeat the fixed-record theorem or perform a native experiment.

## Conditional result

Under the recorded no-FIX boot profile, read-only input descriptions do not take IMA's last-writer setter. Absence of `security.evm` on the same inode **before its first appraisal-capable payload open/exec/mmap**, with no concurrent metadata mutation, excludes migration of an existing mutable signature to HMAC without reading the denied EVM control value. This concerns those setters, not every allocation caused by startup or a tool.

The path [list-xattr implementation](https://github.com/pop-os/linux/blob/49748809f7e18ca62f2e054523f1e2c0eb7a88ad/fs/xattr.c#L938) performs lookup/list without a regular file post-open hook. Checking through a newly opened FD is too late to prove the pre-first-open condition. Missing names, unreadable/denied listing, changed inode and unsupported input remain distinct outcomes.

## Exact remaining gaps

- A post-load `sys.modules` and mapped-library snapshot does not enumerate every startup, transient or cleanup input. The exact installed bytecode, site/customization, `.pth`, ELF loader/configuration, locale and child-tool dependencies need a pre-load closure or a separately enforced exclusion. These are categories to resolve, not claims that a particular file was observed accessed.
- Ordinary atime dirtiness cannot universally be treated as allocation-free. [EXT4 inode expansion](https://github.com/pop-os/linux/blob/49748809f7e18ca62f2e054523f1e2c0eb7a88ad/fs/ext4/inode.c#L6295) can move existing xattrs into an [external block](https://github.com/pop-os/linux/blob/49748809f7e18ca62f2e054523f1e2c0eb7a88ad/fs/ext4/xattr.c#L2605). Input profile/admission must exclude or bound that path, including identity and mutation conditions.
- [EXT4 release](https://github.com/pop-os/linux/blob/49748809f7e18ca62f2e054523f1e2c0eb7a88ad/fs/ext4/file.c#L167) may flush inherited `DA_ALLOC_CLOSE` before its separate writable-description check. Read-only mode alone does not establish the relevant prior-I/O/quiescence state.
- IMA measurement allocations are kernel-memory demand, not input-file blocks. Operation-caused audit/logger persistence and transient inputs cannot disappear merely by calling their writers unrelated. Existing actor limits remain required but do not establish these missing physical terms.

A complete pre-load manifest, pre-open xattr observation, no-mutator/read-only contract and the known no-FIX boot profile close the stated IMA/EVM setter term. They do not, alone, close the atime, inherited delayed-allocation or complete execution-path terms. No160MiB policy allowance, post-hoc block total or `complete:true` field substitutes for those predicates.

## Implementation and execution limits

[Task113](failed-settlement-integration.md) implements the complete conditional source protocol while actual entry refuses before first publication when these prerequisites or durable one-attempt consumption are unqualified. Required future negatives must prove refusal before the actual first input access, distinguish unreadability from absence, reject extra lazy/cleanup inputs and exercise atime/delayed-allocation exclusions or their qualified finite allowances. No such runtime proof is claimed here.

The review used cached code and repository reads only: no profile/host probe, test, request, service, raw/ISO payload, drain or debt credit. The first two shell reads inherited login startup and emitted denied dconf writes; this is disclosed without claiming startup had no side effects. Subsequent calls used `login:false`. Full oldG141754548224 remains charged; runtime acceptance stays4/11 and Task97 remains open.
