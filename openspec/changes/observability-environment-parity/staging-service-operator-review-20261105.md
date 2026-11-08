# Task110 operator draft review

**Changes required before real preparation.** Static review only of the published
operator draft at supplied HEAD77a2c8ae4 and the actual shared request/inventory/
runtime helpers. No builder, request, helper preflight, inventory, native activity,
tests, source/index mutation or subagent was run. Only this report was written.
The separate source review's F1–F3 corrections remain prerequisites; they are not
re-reviewed here. UID/EUID1000 and both manager variables are root-supplied facts.

1. **P1 — Builder admission also loses the original lock/path join.**
   `staging-native-prepare-draft.py:478` retains the acquired state FD but never
   records/rechecks its identity against `STATE`. `ledger`181–189,
   `prepare`310–344 and `proper_host_preflight`290–291 subsequently reopen/walk
   the pathname. Replacing the private state root with another root containing
   the same ledger after acquisition can let preparation refresh its inventory
   onto an unlocked replacement while still holding the old lock. A later native
   source fix does not protect the earlier builder. Thread the original FD and
   identity through preparation/review preflight and rejoin before/after each
   ledger/inventory/capacity/retained-write boundary; never reacquire a replacement
   as recovery. The source review's F2 therefore applies to this draft too.

2. **P2 — Owned CLI cleanup starts after fallible setup.**
   At426–433, successful `Popen` precedes stream allocation, clock access and
   `DefaultSelector()` construction; these run outside the cleanup `try`. A
   selector-allocation/open failure can leave the original CLI running/unreaped,
   with its pipes open and no execution capture. Establish ownership cleanup
   immediately on successful spawn, before any subsequent fallible step, and
   nest pipe/selector closing so a failed kill/wait cannot skip them. The main
   alarm at473–474 also uses shared `hard_timeout`/`os._exit`, which bypasses this
   cleanup if the outer45s budget expires during launch. Route an outer timeout
   through the same original-owned cleanup/refusal path.

3. **P2 — Executed builder bytes are not the bytes whose SHA is recorded.**
   The recipe's wrapper reads/executes `/tmp/puni-staging110-prepare.py`; bootstrap
   then reopens that pathname at131 and records this second read's SHA. It neither
   compares the captured executable buffer with a reviewed expected builder SHA
   nor ties the second read to the bytes already executing. Replacement between
   those reads can attest different code. The later `read_prepared` check only
   repeats that pathname hash. Have the operator launcher stably capture one
   bounded private reviewed buffer, compare its expected SHA, execute that exact
   buffer via `-c`, and bind that same SHA in preparation/review/approval. Preserve
   the no-`__main__.__file__` runtime boundary.

4. **P2 — The outer wall bound begins after bootstrap.**
   `bootstrap`125–155 applies resource limits, but the alarm is installed only
   after bootstrap returns at472–474. Source/tool reads and their capture loops
   have no wall deadline; CPU5s does not bound blocked I/O. Git has3s subprocess
   timeouts and inherits128MiB AS, but pipe size is checked only after unbounded
   `subprocess.run` accumulation. Install the finite outer deadline before the
   first required read and consume Git pipes under a live byte bound, using
   original-child cleanup on timeout/overflow. This is an operator boundedness
   gap, not evidence that a current tool or filesystem has failed.

No static mismatch found in the v2 closed five-field fixture schema, exact8+7
role order, source SHA/Git-before-helper-buffer loading, C/-I/-B producer-used
import selection, or the sole canonical request timestamp exemption. The65536
pad is fully written/fsynced, finalized through the original FD without truncate,
and compared1:1 for inode/size/blocks before the unchanged inventory recheck.
Actual cold worker closure still depends on the separate F1 source correction.

Budget arithmetic is internally conservative but **not current admission**:
FUTURE totals258048bytes; early creation reserves90112more, hence pre-creation
packet metadata must be at most700416bytes for1MiB. At a hypothetical655KiB
baseline the early projection is1018880bytes (995KiB), leaving only29696bytes.
All other packet entries stay charged; only the12 exact old terminal-bound
fixture inodes are subtracted, and full original G is required once in the whole
ledger. The actual measured packet/source/thin size remains unknown. A thin
entry over32768bytes deliberately refuses; raising its reserve to65536 would
add32768 and make that hypothetical early projection exceed1MiB. Do not fill
placeholders or run preparation until all source fixes, these operator fixes,
fresh byte/physical-envelope review and final source commit are complete.
