# Heavy-job CI lock assertion

PR851 CI run42425376414, checks job128562524212, failed only case40b: the unenrolled job succeeded, but the test expected literal `waited 0s behind 0 tickets` and observed `waited 1s behind 0 tickets`. The production diagnostic uses Bash `SECONDS`; a valid short acquisition can cross that counter's tick. Production library and test were unchanged from current main before this correction.

Case40b now runs a separate Perl payload that opens the fixture lock as a new description and attempts `LOCK_EX | LOCK_NB`. Only actual `EWOULDBLOCK` permits its completion marker. Acquiring the lock, failing open, another flock error or a close failure rejects. The existing success-status, completion-marker and no-Dash assertions remain. The fixture precreates the lock inode so an omitted production delegation fails the physical acquisition oracle rather than an absent-file setup. No production implementation, timing budget or configured case is changed.

Observed production-path fault: temporarily replace the exact unenrolled `with_heavy_lock` delegation in the isolated production library with direct payload execution. The same owning jobs suite exits1 and both40b assertions fail; the payload reports `payload acquired the supposedly held legacy lock`. Restore the exact original library bytes before rerunning. Restored production SHA256: `5c01854731d0a906639fdae76891cf08077cf9d8daff62dc9bd0660c2596ea1a`; `git diff --exit-code -- bin/heavy-lock-lib.sh` exits0. No mutation ships.

Fresh verification on Linux as UID1000, GNU Bash5.2.21:

- `HEAVY_LOCK_TEST_SUITES=jobs bash bin/heavy-lock.test.sh`: exit0, 112 checks. The omitted-delegation run exits1 at the actual new exclusion oracle.
- `bash bin/heavy-lock.test.sh` after restoration: exit0, 218 checks, `all heavy-lock checks passed`. This includes the same owning jobs suite and all configured legacy cases.
- `shellcheck -s bash bin/heavy-lock.test.sh`: exit0. Scoped `git diff --check`: exit0.

Astra reviewed the exact independent-description probe and fault log: source GO conditional on the full restored suite, now satisfied. macOS Bash3.2 and optional newer macOS Bash are unavailable on this Linux worker; this is no macOS execution claim. Final aggregate required CI and the canonical actual-main host gate remain required and unclaimed here. Local raw logs are retained privately as `puni-heavy-lock-40b-positive-20261108.log`, `puni-heavy-lock-40b-omitted-lock-20261108.log` and `puni-heavy-lock-all-restored-20261108.log` under `/tmp`.
