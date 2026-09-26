# verify — unestimated-steps-take-no-schedule-time

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 121 passed, 0 failed. This change was valid; the CLI emitted informational archive warnings because main wbs-domain and scheduler-optimization specs are absent. File-scoped bunx prettier --check exited 0 for every new file.

## Planned checks — pending implementation

- **Pending:** Fast golden corpus: an unknown predecessor and multiple unknown steps add zero time to successor, parent and project finish; assigned unknown steps reserve no person or pool. Explicit zero remains an estimated milestone.
- **Pending:** Solver request and CP-SAT tests: null days yields zero durationUnits; no interval or resource demand, but a precedence node remains. Compare Fast and optimized published dates, including all-zero and deadline cases.
- **Pending:** Canonical hash and cache-contract tests: null differs from explicit zero; changed scheduler contract invalidates older optimized rows; regenerated corpora carry the new version.
- **Pending:** Gantt geometry and browser checks: N-workday dotted/translucent question-mark bar, excluded-from-schedule tooltip, simultaneous unknown slices, chart viewport, zero-time dependency anchors and unchanged parent/project dates.
- **Pending R5 proof:** Inject the old assumed duration at the shared duration seam; the scheduling golden test must fail on moved successor or finish. Restore and add an adjacent Proof: comment.
- **Pending R5 proof:** Inject a positive durationUnits or interval for an unknown slice; a solver request or optimized publication test must fail. Restore and record the observed output.
- **Pending R5 proof:** Use scheduled finish for an unknown bar's width; the geometry test must fail while its zero-time dates remain. Restore and record the observed output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the host gate. No application or solver behavior has been verified for this packet at spec time.
