#!/usr/bin/env bash
# The four dev tiers, optionally capturing what they print to a file.
#
# **Capture is opt-in, and the default path `exec`s.** This script is not only a
# developer's `bun run dev`: it is the dev container's CMD
# (`deploy/dev-src/Dockerfile`, `deploy/dev-src/compose.yml`). With
# `WBS_DEV_LOG` unset, nx REPLACES this shell, so the deployed container keeps
# the process tree and signal handling it had before this file existed — no
# extra PID between the container's init and nx, and SIGTERM still reaching the
# watchers rather than a wrapper that would have to forward it. The Dockerfile
# already records one incident of this tree dying for a smaller reason.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# `--local-solver` swaps only WHICH entrypoint be-01 starts: `serve-local-solver`
# runs `src/dev/main.ts`, which builds the local solver spawner, while the other
# three tiers carry an identically-named alias of their ordinary `serve` so this
# stays ONE `run-many` and one foreground nx process. Job control here would put
# failure collection, signal forwarding and child cleanup into a script whose
# default path deliberately has none — and that default path is the dev
# container's CMD.
#
# The argument is not a solver-mode switch. Production's `main.ts` builds the
# supervisor spawner unconditionally and never imports `src/dev/`; no value of
# this flag reaches it.
#
# Proof: assigning `target=serve` in the `--local-solver` branch failed
# `bin/dev.test.sh`'s `local solver target · expected: serve-local-solver ·
# actual: serve`; deleting the usage branch failed `unknown argument exits 2 ·
# expected: 2 · actual: 0` beside `unknown argument never reaches nx · actual:
# no`. The fake `bunx` proves the shell wiring only — that nx can resolve all
# four tasks was checked separately with `--graph=stdout`, which listed
# wbs-be-01/wbs-fe-01/wbs-gw-01/wbs-mcp-01 `:serve-local-solver`, and listed
# **three** with wbs-mcp-01's alias deleted.
target=serve
if (( $# > 0 )); then
  if (( $# != 1 )) || [[ $1 != --local-solver ]]; then
    printf 'usage: bin/dev.sh [--local-solver]\n' >&2
    exit 2
  fi
  target=serve-local-solver
fi

# Refuse before nx, while there is still one place to say why.
#
# A tier whose port is already served does not announce itself as such from the
# nx summary: vite exits in 710ms under `strictPort` and is listed as a task
# that completed beside three Continuous ones. The preflight names the port, the
# tier and the process holding it. Its own reasoning is in bin/dev-ports.sh.
#
# Proof: with this line removed and a listener bound to the port under test,
# `bin/dev.test.sh`'s `a served dev port exits 1 · expected: 1 · actual: 0`
# failed beside `a served dev port never reaches nx · expected: yes · actual:
# no` — nx started the whole stack over a port that was already taken.
"$repo_root/bin/dev-ports.sh"

# Proof: restoring the four pre-move selectors made bin/dev.test.sh report the
# namespaced tiers missing from the real supervisor command.
args=(run-many -t "$target" "--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01")

if [[ -z "${WBS_DEV_LOG:-}" ]]; then
  exec bunx nx "${args[@]}"
fi

mkdir -p "$(dirname "$WBS_DEV_LOG")"

# Colour reaches the terminal and never reaches the file: `tee` writes the
# untouched stream to stdout, and awk writes a stripped copy through a FIFO.
# Only CSI sequences are stripped, which is what nx, vite and pino emit
# here; an OSC title sequence would survive, and no tier writes one.
#
# `awk` rather than `sed`, because line-buffering is `-u` on GNU sed and `-l` on
# the BSD sed macOS ships, while `fflush()` is spelled the same in both awks.
# Without it the file lags a full block behind the screen, which makes a log
# read during a live run describe a moment that has already passed.
#
# Proof: replacing the process substitution with a plain `tee "$WBS_DEV_LOG"`
# failed `bin/dev.test.sh`'s `captured file has no escape bytes · expected: yes
# · actual: no`, with `terminal stream keeps colour` still green beside it.
strip_csi='{ gsub(/\033\[[0-9;?]*[a-zA-Z]/, ""); print; fflush() }'

# `pipefail` is what makes a dead nx a failed run: without it this pipeline
# reports `tee`'s status, which is 0 whenever the file could be written, and a
# container whose servers died would exit 0 and never be restarted.
#
# Proof: `set -eu` in place of `set -euo pipefail` failed `bin/dev.test.sh`'s
# `a failing nx exits non-zero · expected: 3 · actual: 0` — the run reporting
# success because `tee` had written the file it was asked for.
# An ordinary background child can be waited for on macOS Bash 3.2; waiting
# for a process substitution requires Bash 4.4. The private FIFO connects tee
# to that child without reopening or redirecting the caller's stdout. Retain
# nx/tee's failure until the writer drains, including when nx exits non-zero.
#
# Proof: restoring the unwaited process substitution failed
# `captured file has the output` with a PATH-injected one-second delay before
# the real awk, and `a failed capture writer exits non-zero` expected 7 but
# got 0 with a PATH-injected awk that exits 7, in bin/dev.test.sh.
# Proof: the preceding process-substitution wait made the Bash 3.2 suite fail
# `a successful captured run exits zero` with actual 127, and the delayed
# writer's output was absent when the script returned.
capture_dir=$(mktemp -d)
trap 'rm -rf "$capture_dir"' EXIT
mkfifo "$capture_dir/stream"
awk "$strip_csi" <"$capture_dir/stream" >"$WBS_DEV_LOG" &
capture_pid=$!
pipeline_status=(0 0)
bunx nx "${args[@]}" 2>&1 | tee "$capture_dir/stream" || pipeline_status=("${PIPESTATUS[@]}")
# A tee that never opens the FIFO leaves the reader blocked in open(), so
# cancel that child before waiting. If it already exited, wait preserves its
# failure; otherwise cancellation exits 143, or 1 when Bash 3.2's blocked
# open reports EINTR. In those cases tee's failure wins.
# The FIFO read-open precedes awk's execution, so a failed writer cannot leave
# tee waiting for a reader that exited before tee opened its write end.
#
# Proof: without this branch, PATH-injected tee exit 7 and absent tee both
# timed out (124) in bin/dev.test.sh under Bash 3.2 instead of exiting 7/127.
# A writer exiting 7 with a delayed real tee still exits 7 without hanging.
if ((pipeline_status[1] != 0)); then
  # This direct child may finish between the pipeline and cancellation.
  if ! kill -TERM "$capture_pid" 2>/dev/null; then
    wait "$capture_pid"
  fi
  capture_status=0
  wait "$capture_pid" || capture_status=$?
  if ((capture_status != 0 && capture_status != 1 && capture_status != 143)); then
    exit "$capture_status"
  fi
  exit "${pipeline_status[1]}"
fi
wait "$capture_pid"
exit "${pipeline_status[0]}"
