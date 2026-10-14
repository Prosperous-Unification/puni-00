## 1. Freshness conformance

- [x] 1.1 Add promtool missing/foreign/healthy/recovered worker and snapshot cases; watch absent rules fail.
- [x] 1.2 Add production SLM script cases for fresh, stale, future, missing, malformed and request failure; watch rejected faults fail when the guard is removed.

## 2. Production resources

- [x] 2.1 Add scoped alerts, namespace provenance, cluster relabeling and production substitutions.
- [x] 2.2 Ship the periodic SLM validator using the locked Elasticsearch image.

## 3. Verification

- [x] 3.1 Run real locked promtool and scoped Bun/Nx checks, record mutation proofs and unavailable rollout evidence.

## 4. Review correction: snapshot deadline

- [x] 4.1 Assert no alert at 34m and firing at 35m/39m for stopped and never-successful checks; watch the shipped 35m-plus-5m rule fail, then start its pending period at 30m and update the production substitution.
