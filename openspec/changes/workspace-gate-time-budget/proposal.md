## Problem

Cold workspace runs have exhausted historical60/90-minute allowances and left
required checks unfinished. Increasing a cap does not repair independent test
failures or establish a completed gate verdict. The retained observations and
local proofs live in [verification](verify.md).

## Outcome

Retain the implemented whole-project partition: dedicated backend, remote and
frontend ownership plus residual workspace coverage, with the fixed remote
execution layout governed by ci-remote-capacity. Preserve exact validated
selection, runtime phases, provision, commands, annotations, logs and reduction.
Carry main's finite120-minute allowance for gate_workspace; dedicated runtime
jobs retain their existing90-minute ceilings and phase limits. Required non-Nx
checks retain their30-minute job, and Twilight remains75 minutes.

## Non-goals

No check removal, target/dependency/assertion/cache/retry change, new partition,
command-scope change, unrelated timeout change, Tool Wiki activation or product
architecture/deployment adoption. The fixed remote exception keeps one logical
owner and complete canonical coverage; its own bounded contract governs physical
leaves. A configured allowance is not measured hosted capacity.

## Constraints

Keep immutable base/head and target-specific selection. Full mode covers every
non-Twilight project, including future residual projects. Each runner preserves
original failure, annotations and always-on logs. The stable reducer rejects any
required failure, cancellation, timeout, absence or unexplained skip. Preserve
all historical60/90-minute evidence without relabeling it. Require exact-head
cold hosted CI and the canonical host gate before release acceptance. The raised
workspace ceiling can cost up to30 additional hosted runner minutes per job.
