## 1. Make the scheduling rule fail first

- [ ] 1.1 Flip the assumed-duration golden case to require zero schedule duration, unchanged successor start and project finish. Add unknown versus explicit-zero and assigned-capacity cases. Watch the current Fast behavior fail.
- [ ] 1.2 Change the shared duration seam and all Fast projections/resources that depend on it. Keep dependency nodes and real floors/deadlines. Run the golden and domain suites.
- [ ] 1.3 Inject the old assumed-duration arm; watch the golden test fail, restore and add an adjacent Proof: comment.

## 2. Carry zero through optimized scheduling

- [ ] 2.1 Change the solver-boundary scenario and tests first: null days yields zero durationUnits, while canonical hashing distinguishes null from explicit zero. Watch them fail.
- [ ] 2.2 Check CP-SAT zero-length nodes, absent intervals, precedence, deadlines and all-zero plans; adjust solver and independent output validation where needed. Add Fast/optimized agreement cases before production changes.
- [ ] 2.3 Bump the scheduler contract version, regenerate affected corpora and retire stale cache entries. Bump solver package or wire version only if their behavior or schema changes.
- [ ] 2.4 Inject an assumed positive duration into the request or interval; watch the optimized golden or revalidation test fail, restore and add an adjacent Proof: comment.

## 3. Keep the placeholder visible

- [ ] 3.1 Add failing geometry and tooltip tests: N-workday unknown bar, zero scheduled finish, distinct simultaneous bars, viewport reach and explicit-zero milestone.
- [ ] 3.2 Separate Gantt drawing width from schedule finish and update tooltip. Preserve existing uncertain styling and dependency/parent geometry.
- [ ] 3.3 Inject scheduled-finish-based bar width; watch the geometry test fail, restore and add an adjacent Proof: comment.

## 4. Verify

- [ ] 4.1 Run focused domain, solver, frontend and browser checks, format, lint, typecheck, build, OpenSpec validation and the applicable host gate. Record outcomes and all R5 observations in verify.md.
