# Independent command review: two redo corrections required

**Request changes.** Astra reviewed frozen `db2d38ec9`, independently checking
all 113 source hashes and clean status before and after. The
[full review](task-4-command-review-proofs/puni-command-integration-review.md.txt)
and [corrected probes/logs](task-4-command-review-proofs/) are retained with hashes.

1. **P2, mounted local regression:** a batch creates a replacement predecessor
   then updates a typed dependency to its alias. Forward and undo succeed, but
   redo returns 409 stale_undo and discards the valid history entry. The ordered
   restoration scanner considers typed adds but omits typed updates.
2. **P2, admitted external semantic regression:** a batch creates a local
   successor and links an existing readable remote prerequisite. Forward and
   undo succeed, but redo returns not_found with no table changes. A whole-entry
   external-metadata condition suppresses the legitimate local restoration rule.

For the selected replay direction, traverse nested commands in application
order. Defer a missing owner-local endpoint only when an earlier valid local
restore supplies that exact project/work-item address before a typed add or
update uses it. Remote endpoints, later restores, forbidden/unknown-step outcomes
and unrelated ordinary references receive no exception. Current authority,
application-time step/shape checks, equality, exact remote revision coverage and
final connected graph validation remain required. Original Sol resumed these
corrections and nested/order-negative tests; source remains unintegrated.

Fresh review tests passed core 530, HTTP 252, connected/parser 77, classification
17, and an overlapping focused set of 211. Counts must not be summed. Six actual
type programs, named lint and formatting passed. The two independent probes
failed their expected redo assertions after valid setup. The earlier probe with
missing placement fields is excluded from behavioral evidence.

The reviewer audited all 51 recorded mutation logs without reapplying source
faults. The full report classifies each observed consequence: concealment,
diagnostic order, invariant/lifetime failures, required consumer propagation,
metadata correctness and actual acceptance. Some later guards still refuse;
not every failing test demonstrates an unsafe accepted write. Five observations
use memory/core and 46 use SQLite boundaries. Structural delivery faults prove
caller propagation, with a separate genuine reverse-cycle test providing graph
semantics. No benchmark or full host/build/MCP/deploy gate was rerun.

These corrections do not close the remaining MCP equivalence, external incident
lifecycle, connected runtime/readiness, fan-out, activation or delivery work.
