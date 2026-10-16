## 1. Failure log records

- [x] 1.1 Replace the `err` serializer with one built over `@shared/failures`, declare the record in `log-schema.ts` and export both — test: `NX_DAEMON=false bunx nx run wbs-observability:test --skip-nx-cache`, `wbs-observability:typecheck`, `wbs-observability:lint`; negatives: drop the explicitly logged absent failure, substitute a report for a present one, trust an unregistered reporting-shaped value, remove the never-throw guard while the shared wrapper is broken, write the public report instead of the diagnostic one, drop the caller's secrets from the policy, relax the schema's diagnostic version, relax the schema's loss reason, restore the pre-change `err` member and, under the broken shared wrapper, replace the fallback handle counter with a constant

## 2. Failure report search (WBS 080.23)

- [x] 2.1 Mapping test: `failure-fields.json` and `failure-mapping.test.ts` tie every lifted `log-schema.ts` path to the collector moves and the mapping — test: `wbs-observability:test`; negatives: delete the fingerprint mapping, map it as `text`, drop `mcp-01` from the collector's services, set the parser's `on_error: drop`
- [x] 2.2 Collector parse: `json_parser` and typed `move` operators with `on_error: send`, and `msg` redaction — k3d: one JSON failure line and one plain line arrive; negatives: `{` alone, a 40 KiB line, a malformed level, a failure without a fingerprint, foreign JSON, removal of each guard
- [x] 2.3 Kibana Job: `kibana/objects` imports the data view, two Lens panels and the 7-day dashboard — k3d: three occurrences of one fingerprint and one of another render as two rows, count 3; negatives: truncated NDJSON, an unknown object type with and without the verdict check, Kibana unavailable with a lowered bound and with none; `tool-fleet` negatives for a generated ConfigMap outside the locked graph and a generator that disables the content hash
- [x] 2.4 Docs: field table, Job, retention and privacy in `docs/infra/platform.md`
- [ ] 2.5 Real-pipeline acceptance on the production platform, gated on WBS 070.07 and 070.08
- [x] 2.7 Alert on log loss: `PuniLogRecordsDropped` over `send_failed`, `PuniLogQueueFull` over the queue's size and capacity, `block_on_overflow: true` stated, the `_total` suffix removed, a `tool-fleet` test binding rule metric names to the exposition captured from the pinned collector, and the "Log loss" runbook — test: `bun tools/tool-fleet/src/platform-alerts.ts` (promtool), `tool-fleet:test`; k3d: a 60 s black hole fires `PuniLogRecordsDropped` in Alertmanager, a 60 s refusal does not, a full queue fires `PuniLogQueueFull`; negatives: `increase` alone (promtool, and the replay of k3d run 1's stored series), `unless … offset 5m` against a scrape gap, one `__name__` selector over two counters (watched before `enqueue_failed` left the rule), the queue rule without its exporter filter and with `> 1`, `_total` restored, the image bumped and `block_on_overflow` removed
- [ ] 2.6 Make a 60 s Elasticsearch outage lossless when the exporter's connection hangs: the first k3d drill lost 49 of 900 lines to a timeout the exporter does not retry; the A30 dependency is settled: blocked on an upstream timeout-retry fix, then zero-loss live outage and collector-restart acceptance (see [the upstream audit](verify.md#upstream-audit-2026-10-16))

## References

This task implements the observability half of slice 3 of the
package adoption plan at `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
which the open `adopt-failure-reporting` change lists as its unowned task 2.1.
