# Findings

<!-- module-index {"schemaVersion":1,"moduleId":"module.docs.findings","memberships":[{"kind":"path","path":"2026-10-14-wbs-persistence-batch-integration.md"},{"kind":"path","path":"burokrat-test-selection/verify.md"},{"kind":"path","path":"checks-that-cannot-fail.md"},{"kind":"path","path":"checks-that-cannot-fail-puni-00.md"},{"kind":"path","path":"ci-gate-duration.md"},{"kind":"path","path":"delivery-waiting-baseline.md"},{"kind":"path","path":"current.md"},{"kind":"path","path":"current-document-check-exemptions.json"},{"kind":"path","path":"root-migration.v1.json"},{"kind":"path","path":"puni-assessment-2026-10-21/report.md"},{"kind":"path","path":"puni-assessment-2026-10-21/infrastructure.md"},{"kind":"path","path":"puni-assessment-2026-10-21/delivery.md"},{"kind":"path","path":"puni-assessment-2026-10-21/security-assistant.md"},{"kind":"path","path":"puni-assessment-2026-10-21/observability-cost.md"},{"kind":"path","path":"puni-assessment-2026-10-21/live-evidence.md"},{"kind":"path","path":"puni-assessment-2026-10-21/swarm-organization.md"},{"kind":"path","path":"puni-assessment-2026-10-21/swarm-criteria-research.md"},{"kind":"path","path":"merge-check-enforcement-2026-10-23.md"}],"relationshipSelectors":[],"applicableChecks":["check.wiki-cli.test"],"inapplicableSections":[{"section":"relationships","reason":"The root-migration map declares the source and destination relationships."},{"section":"invariants","reason":"This boundary records findings; operational invariants remain with their owning modules."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"AGENTS.md"},{"kind":"path","path":"LLM_README.md"}],"knowledgeLimit":"Only the two root routers consume this catalogue directly."}} -->

Current mutable warnings and the historical R5 incident catalogue live here; the root
files link here instead of duplicating them.

## Current findings

- [Delivery waiting baseline](delivery-waiting-baseline.md) — planning evidence for autonomous dev delivery observation

- [Main merge checks — 2026-10-23](merge-check-enforcement-2026-10-23.md) — policy, delivery path and recovery
- [PUNI client delivery readiness — 2026-10-21](puni-assessment-2026-10-21/report.md) —
  client journeys, fleet, CI/CD, security, observability and cost; source and live evidence;
  rerun 2026-10-22 added [agent swarm organization](puni-assessment-2026-10-21/swarm-organization.md)
- [Landmines and open findings](current.md#router-landmines-heading)
- [Checks that cannot fail](checks-that-cannot-fail.md#r5-catalogue-heading)
- [Checks that cannot fail — puni-00](checks-that-cannot-fail-puni-00.md)
- [Burokrat source test selection verification](burokrat-test-selection/verify.md)
- [CI gate duration](ci-gate-duration.md) — where the gate job's time went and why it is split
- [WBS persistence batch integration — 2026-10-14](2026-10-14-wbs-persistence-batch-integration.md)
- [Root migration map](root-migration.v1.json)
- [Current-document check exemptions](current-document-check-exemptions.json) — documents exempted
  from named current-document checks, with an expiry
