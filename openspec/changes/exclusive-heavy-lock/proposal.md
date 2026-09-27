## Why

The heavy lock was `mkdir "<lock>.d"`, trusting `mkdir`'s exit status as the mutex. On h2puni
(Ubuntu 26.04) `/usr/bin/mkdir` is uutils coreutils 0.8.0, and two concurrent `mkdir d` there
both exit 0: 10 of 300 races on 2026-09-27 and 47 of 300 the day before, against 0 of 300 for
GNU `gnumkdir`. Two host gates could both hold the lock and run in the one shared gate tree. The
dead-holder reclaim (`rm -rf` then `mkdir`) was also open to two reclaimers on any coreutils.

## What Changes

**Mutex**

- From: `mkdir` of `<lock>.d` decides who holds the lock.
- To: `flock(2)` on the file `<lock>`, taken through `perl` on every platform, decides; the
  directory `<lock>.d` with `holder` and `label` stays as the record `status` reads and the
  code before this change respects.
- Impact: **new dependency on `perl`** (Essential on Ubuntu, `/usr/bin/perl` on macOS). A host
  without it, or whose perl lacks native `flock(2)`, is refused with exit 70 rather than run
  unlocked. The wrapped command runs with the lock's descriptor closed.

**Transition** — runs on the older code hold no flock. Under the flock a live or half-written
old-format record is refused 75 and left untouched; only a dead holder is reclaimed.

## Non-Goals

No change to the queue, budgets, labels, status format or exit codes. No cross-host lock.
Closing old-code-versus-old-code races: they end when every launcher on the host runs this code.

## Constraints

Bash 3.2. One mechanism on every platform (no `command -v flock` fallback). Every new check
ships a watched negative.

- assumed: Astra (gpt-6-astra, high) chose `perl` `flock(2)` over a noclobber token (whose
  dead-owner reclaim has no race-free compare-and-delete) and over `gnumkdir` (Ubuntu-only).
- assumed: dead old-format holders are reclaimed under the flock rather than refused 70, as
  Astra suggested; refusing would turn one killed gate into a wedged host, and would not stop an
  old-code reclaimer, which is the only party that can race it.
- assumed: file descriptor 9 of the shell running `with_heavy_lock` belongs to the library.
