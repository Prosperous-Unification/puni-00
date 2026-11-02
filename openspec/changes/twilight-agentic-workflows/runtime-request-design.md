# Portable runtime request identity

## Intent

A durable sender must retain the exact payload identified by a receiver receipt. Today the fixed canonical codec is private to the Plan commands application module. Publish that existing codec through WBS contracts and make its application callers use the same implementation. Preserve version 1 bytes, strict validation, input detachment and admission ordering. Keep the existing command limit at 200 through one contracts value.

This packet does not authenticate receipts, retain sender intent, authorize execution or spending, change endpoint behavior, migrate stores, implement the coordinator, or establish effect or recovery evidence. It consumes the reviewed integration baseline and leaves the other session's credentials implementation unchanged.

## Context

At base `ebda8a216c73a38050579bdc46f5da927223b3eb`, application `runtime-request.ts` owns seven pure parser/codec exports and imports `MOST_COMMANDS_IN_A_BATCH` from its application service. The HTTP write/receipt shapes separately use literal 200. The application runner uses that same service constant. Existing canonical fixtures and real queued-admission tests establish the current protocol.

The current integration has approved bounded code review. Its exact host gate and CI remain pending on the unchanged integration branch. This packet is isolated from that candidate.

## Goals / Non-Goals

**Goals:** one reusable canonical identity implementation in contracts; compatible application imports; one unchanged batch bound; independent known-byte fixtures; real receiver digest correspondence; current production-boundary failure evidence.

**Non-Goals:** receipt authentication or full correspondence validation, sender/outbox persistence, manifest governance, live providers, credential policy, CTT/coordinator behavior, migration changes, production activation and S0/S7a completion.

## Decisions

Move the complete existing codec into `libs/wbs/domain/contracts/src/runtime-request.ts`, using relative wire-value imports. Export its seven existing functions from the contracts index. Keep the application file as an explicit compatibility re-export. Moving only the encoder while copying its strict operation shapes would leave two protocol definitions. Do not change the moved parser predicates or snapshot behavior.

Move `MOST_COMMANDS_IN_A_BATCH = 200` to contracts `plan-command-values.ts`; re-export it from the application service and contracts index. The runtime HTTP command/applied bounds consume this same value. Existing ordinary application callers retain their import and behavior.

Hashing remains the receiver's injected Digest capability. A sender can hash the published canonical UTF-8 string, but matching bytes do not establish server authority or current permission. No hash implementation or provider factory is added to contracts.

Keep schema version, fixed property order, ordered commands/references/steps, explicit null and existing handling of optional reference names. Public mutating parsers still detach caller input before asynchronous admission. New JSDoc states these boundaries; the README remains a navigation index.

## Risks / Trade-offs

The public contracts barrel gains seven existing parsers. Keep every import below the application layer and preserve existing application imports through the facade. A public subpath would need additional resolver configuration; this packet follows the existing contracts index without adding aliases. Future entry-point separation remains reversible within this repository.

Expected bytes must be literal independent fixtures, not output copied from the current encoder. The moved guards retain their historical evidence; the changed batch-limit dependency needs a fresh watched fault at each relevant production consumer. Do not label loader errors, a masked fault or an already-red baseline as semantic proof.

## Migration Plan

No schema or stored-byte change. Existing canonical records decode identically, and existing application imports remain compatible. Migration SQL and the integration's unique runtime migration identity remain untouched.

## Open Questions

None blocks this bounded extraction. Durable sender retention, authenticated acceptance validation and host ordering remain later work.
