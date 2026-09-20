## 1. Failure log records

- [ ] 1.1 Replace the `err` serializer with one built over `@shared/failures`, declare the record in `log-schema.ts` and export both — test: `NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache`, `wbs-observability:typecheck`, `wbs-observability:lint`; negatives: drop the explicitly logged absent failure, substitute a report for a present one, trust an unregistered reporting-shaped value, remove the never-throw guard while the shared wrapper is broken, write the public report instead of the diagnostic one, drop the caller's secrets from the policy, relax the schema's diagnostic version, relax the schema's loss reason, restore the pre-change `err` member and, under the broken shared wrapper, replace the fallback handle counter with a constant

## References

This task implements the observability half of slice 3 of the
package adoption plan at `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
which the open `adopt-failure-reporting` change lists as its unowned task 2.1.
