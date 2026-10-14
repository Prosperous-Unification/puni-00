## 1. Freshness conformance

- [x] 1.1 Add promtool missing/foreign/healthy/recovered worker and snapshot cases; watch absent rules fail.
- [x] 1.2 Add production SLM script cases for fresh, stale, future, missing, malformed and request failure; watch rejected faults fail when the guard is removed.

## 2. Production resources

- [x] 2.1 Add scoped alerts, namespace provenance, cluster relabeling and production substitutions.
- [x] 2.2 Ship the periodic SLM validator using the locked Elasticsearch image.

## 3. Verification

- [x] 3.1 Run real locked promtool and scoped Bun/Nx checks, record mutation proofs and unavailable rollout evidence.
