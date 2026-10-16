## Why

Password-email verification already has durable pending/delivered/failed challenges and mounted compensation, but production always binds a refusing mail sink. Operators cannot supply a reviewed SMTP relay. The shared address/token port also cannot distinguish verification from invitation, whose acceptance has no durable delivery gate.

## What Changes

- Allow explicitly configured, authenticated or explicitly unauthenticated implicit-TLS email submission through a reviewed maintained client.
- Make absence a typed disabled mode; reject incomplete or malformed present configuration before serving.
- Carry a purpose-typed verification message to exactly one normalized recipient, with a fixed template, private token and explicit sender identity.
- Report success only after relay acceptance; bound submission and cleanup, and refuse uncertain outcomes without automatic resend.
- Exercise production boot verification through controlled local TLS fixtures; retain hard invitation/join delivery refusal and existing compensation even with SMTP enabled.
- Record the separate invitation eligibility prerequisite; do not enable SMTP invitations or join approvals in this slice.

## Non-Goals

Invitation/join SMTP delivery or schema changes, live activation, credentials/sender provisioning, inbox certification, bulk mail, queue/retries, STARTTLS, OAuth SMTP, attachments, HTML, internationalized mailboxes and DNS onboarding.

## Constraints

Bun/Nx, existing activation gates and HTTP refusals, blue/green compatibility, no token or credential logging, R5 production negatives, low-RAM serial local checks. Real relay authority, sender policy, CA trust and inbox evidence remain operator dependencies. No production code before independent exact design/client review.

## Capabilities

### New Capabilities

- `organization-email-delivery`: explicit safe relay submission and mounted onboarding delivery behavior.

### Modified Capabilities

None; existing authority, token consumption and compensation remain unchanged.

## Domain Terms

Email submission; relay acceptance.

## Decisions Recorded

None. The client boundary remains replaceable and no irreversible platform choice is proposed.

## Impact

be-01 configuration, boot and dev entrypoint; core email port and three route callers; test sinks; pinned SMTP client dependency; operator runbook. WBS010.5.4 remains incomplete: invitation eligibility/delivery, release and external evidence remain outstanding.
