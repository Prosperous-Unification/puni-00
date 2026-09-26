# Design — unestimated steps take no schedule time

## Duration seam

ASSUMED_SLICE_WORKDAYS in libs/wbs/domain/domain/src/assumed-duration.ts becomes the drawing span only. The shared durationOf function in schedule.ts near line 542 returns zero for days null and preserves effort divided by width for known days. Keep null in Slice.days; do not turn it into a stored zero estimate. The Fast dependency graph retains each zero-time slice, while person and pool reservations remain conditional on positive duration. Inspect its backward pass, latest dates, project finish and parent projection so no old positive-duration classification survives.

## Solver seam

The solver request builder uses durationUnits over the shared durationOf rule. Quantization must leave exact zero at zero and never round it to one unit. CP-SAT already permits zero durationUnits and skips interval creation for duration zero in model.py; preserve the start/end variables and precedence edges. Revalidate resource occupancy, deadlines, all-zero work-item handling, objective bounds and publication against the new semantics. Keep null distinct from explicit zero in the canonical input hash. Bump SCHEDULER_CONTRACT_VERSION and regenerate versioned Fast and solver corpora; bump the Python solver package or wire generation only if its own behavior or schema changes. Retire stale cached optimized results through the combined contract version.

## Gantt seam

Gantt geometry measures the placeholder from scheduled start plus ASSUMED_SLICE_WORKDAYS on the workday calendar. Its width may extend the chart viewport but cannot feed scheduled finish, parent brackets, row dates, critical-path calculations or dependency anchors. Keep the existing dotted/translucent question-mark treatment, add an explicit excluded-from-schedule tooltip, and ensure simultaneous unknown steps remain identifiable as separate bars. Explicit zero estimates remain zero-width milestones.

## Verification shape

First change a golden fixture to assert that unknown slices do not move a successor or finish. Watch it fail under the current assumed duration. Test the same plan through Fast, solver request, CP-SAT output and independent publication validation. A focused injected fault returning ASSUMED_SLICE_WORKDAYS from durationOf must redden the golden test. A second fault substituting scheduled finish for visual width must redden a Gantt geometry assertion. Record both observed failures and adjacent Proof: comments during implementation.
