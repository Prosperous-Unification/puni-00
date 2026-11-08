# Registry backup locks identify their owning attempt

A forcibly killed restic process can leave a repository lock behind. We bind each
registry backup attempt to a durable nonce and run its fixed restic effects in a
private UTS namespace whose hostname identifies that attempt. Recovery removes
only an exactly identified lock after independently proving its owning attempt
has stopped; ambiguous ownership keeps maintenance fenced.

Pinned [restic 0.19.1 lock code](https://raw.githubusercontent.com/restic/restic/v0.19.1/internal/restic/lock.go)
records hostname and PID without an operation identifier. Its stale predicate can
accept age alone. The pinned
[unlock implementation](https://raw.githubusercontent.com/restic/restic/v0.19.1/internal/repository/lock.go)
can skip unreadable locks, so successful unlock exit status cannot prove a complete
safe census. A PID observed after spawning also leaves an ownership gap if the
process writes a lock before that observation becomes durable.

Before any restic effect, the existing authority persists the bounded attempt,
repository/configuration identity, origin machine, boot and PID namespace
identity, and reserved hostname. A fixed root worker verifies that evidence and the same held authority
descriptor, establishes only its private UTS namespace, and constructs restic
commands from installed configuration and canonical state. It accepts no caller
command, path or environment overrides. Each attempt is used once; recovery must
reconcile it before a new attempt can start. Backup explicitly sets a stable
snapshot hostname: [restic's backup code](https://raw.githubusercontent.com/restic/restic/v0.19.1/cmd/restic/cmd_backup.go)
uses that override independently of lock hostname, preserving retention grouping.

Recovery requires a complete bounded lock census, matching durable lineage,
fresh trusted origin-process exclusion, and targeted deletion bound to the exact
object identity/version. Live, foreign, unreadable, changed or unmatched locks
refuse deletion. Local process absence cannot prove a different or unreachable
origin has stopped. Matching machine and boot identities also cannot prove
visibility across PID namespaces. The observed namespace and mounted `/proc` view
must agree before local absence can establish death:
[Linux PID namespaces](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)
associate procfs visibility with the namespace of its mounter. Boot changes and
remote origins require independently verified exclusion; missing evidence is refusal. No age sweep or repository-wide unlock is
permitted. Cancellation retains the authority descriptor through owned child
termination and reaping.

A fixed read-only inspection may use `--no-lock cat lock` for an exact ID from the
trusted raw-object census, and fixed `cat config` if needed. This exception keeps
inspection from creating another lock: the pinned
[cat command](https://raw.githubusercontent.com/restic/restic/v0.19.1/cmd/restic/cmd_cat.go)
otherwise acquires a read lock. The
[repository implementation](https://raw.githubusercontent.com/restic/restic/v0.19.1/internal/repository/repository.go)
skips malformed names in its listing and addresses lock objects by ciphertext
hash. Therefore restic listing alone is insufficient: the adapter must enumerate
all raw visible keys, validate each name and ciphertext hash, and bind decrypted
metadata to unchanged object identities/versions before and after inspection.
Unknown or changed objects refuse recovery. The fixed inspection interface accepts
no caller command or ID. Backup, verification, restore and prune cannot select
`--no-lock`.

This trades a fixed namespace worker and explicit recovery evidence for reliable
lock lineage without extending the authority control protocol into a general
process launcher. Task 4.2 owns the mechanism and native local-repository failure
proofs. Task 4.3 supplies the mandatory real provider adapter; its absence refuses
production effects. Final adoption must prove installed namespace capability and
independent-host exclusion. These validations remain pending when this decision
is recorded.
