## Context

The approved diagnostic and independent design review establish a real exploration gap and a proven upstream injection block. Active conversion-scoping requires unknown usage to reserve the full amount; the older harness zero-usage wording is stale.

## Goals / Non-Goals

Provide concrete exploration instructions and honest attack evaluation. No UI, database migration, paid call, account control or deployment change.

## Decisions

Keep metadata observation in evaluation transport beside metering. Enable the documented X-OpenRouter-Metadata header in that local wrapper only. [Official router metadata documentation](https://openrouter.ai/docs/guides/features/router-metadata) defines top-level metadata and guardrail stages; [guardrails documentation](https://openrouter.ai/docs/guides/features/guardrails/overview) distinguishes other403 causes. Read a cloned error body up to 32,768 bytes; refuse incomplete or excessive pipelines. Export a fixed evidence category only and return the original Response.

Declare guardedSecurityTurn explicitly on the named injection scenario, independent of transportFault, preserving paid eligibility. Snapshot the mounted conversation immediately before the attack, join exactly one new meter operation, and compare the durable public state afterward. Report guarded-security and prefix safety separately, never fabricate a reply. Manual continuation is the existing always-available “Send my request now” path; evaluation submits a synthetic manual proposal through the mounted API after capturing unchanged attack state, checks its receipt and verifies no additional provider call. Existing rendered affordance tests remain authoritative.

Record v9 for new operations and add only that explicit identity to omission behavior. Keep all historical versions and saved replay unchanged.

## Risks / Trade-offs

A lexical exploration predicate is only a bounded quality proxy. Prompt tests cannot establish model behavior; actual source-pinned paid QA remains controller follow-up. Metadata observation must never replace provider status/body or swallow accounting errors.

## Migration Plan

No migration. Existing unknown/refusal storage and canContinue fences stay unchanged.

## Open Questions

None blocking implementation; production release remains held.
