# Website funnel analytics implementation plan

Read [intent](proposal.md), [behavior](specs/funnel-analytics/spec.md), [design](design.md) and [ADR 0058](../../../docs/adr/0058-consented-traffic-analytics-stays-separate-from-request-content.md). Use executing-plans in an isolated worktree. Public code can be implemented with a fake sink before property access or private source is available. Proposed configuration is reviewed before activation, not assumed live.

## 1. Shared event and consent boundary

- [x] 1.1 Create `libs/website/domain/contracts/src/analytics.ts` and its test, exporting typed event names, bounded parameters and page/campaign metadata validation through `index.ts`. The exact event table lives in design.md. Test: accept every documented event; reject unknown keys, arbitrary IDs, free text and unsafe URLs. Negative: permit an extra field containing a sentinel email and watch the leakage assertion fail.
- [x] 1.2 Create the app consent/dispatch adapter in `apps/website/fe-01/src/analytics.ts` and tests with a fake loader/sink. Implement disabled/denied/loading/ready/unavailable states, versioned shared preference, six-month proposed expiry, consent-before-loader, no pre-consent queue, withdrawal, configured-cookie cleanup and operational independence. Test no script/request before acceptance, same choice across hosts, expired/malformed preference as denied, no replay after late consent, withdrawal on a loaded page, and blocked loader with successful submission. Negative: move tag loading before consent or retain the pre-consent queue; the corresponding production adapter test must fail. Optional transport failure returns unavailable; programming errors remain errors.

## 2. App milestones and confirmed conversion

- [x] 2.1 Wire the adapter into `build-page.tsx`, `conversation-harness.tsx` and the manual submission component in `main.tsx`, using only validated metadata. Add React tests for actual admission versus optimistic click, committed question view, accepted response, brief/email display and bounded failure category. Negative: emit an answer before a 409/429 response or derive metadata from visitor text and observe the accepted-event/payload test fail.
- [x] 2.2 Emit `generate_lead` only after successful server confirmation, with local receipt-based dedupe and no receipt transmitted. Test both manual and chat routes, failed email, double click, rerender, lost-response recovery and replay. Negative: fire on submit click or remove the dedupe marker; the mounted component/browser test must report an extra lead. Denied consent still produces the same server submission and zero analytics events.
- [x] 2.3 Add `apps/website/fe-01/browser/analytics.mjs` using the existing loopback fixture conventions. Intercept all Google script/measurement traffic; inject distinct sentinels into description, chat, email, references, page query/hash and errors. Verify safe initialization metadata, disabled automatic form/search/outbound tracking, no operator-page measurement, and default-disabled development. Negative: reenable automatic page location or unknown event properties and watch the browser test expose the sentinel. Validate all payloads, not just adapter unit outputs.

- [x] 2.4 Recognize exactly one trailing slash on registered non-root site/app pages in the shared `resolvePage`, preserving fixed emitted locations and all unknown/operator/host boundaries. Tests: actual resolver/controller inputs cover every registered canonical/directory alias, `/` versus `//`, repeated/encoded separators and unsupported routes. Negative: broaden alias recognition to collapse repeated slashes, observe the unsupported-route assertion fail through the real resolver, restore and retain full output with an adjacent Proof. This integration gap was observed against private Astro directory routes; do not alter its output format or patch copied canonical source.

## 3. Private site and acquisition continuity

- [ ] 3.1 In the private checkout identified by conversion-scoping slice 4.1, record actual site tag/consent integration files before editing. Reuse the shared event contract, preference behavior and safe loader. Wire hero, services, About, published articles and CTA events; add the Privacy choices control. Test acceptance/rejection/withdrawal on keyboard and mobile and prove all functional CTAs work when Google is blocked.
- [ ] 3.2 Configure a development-only test property and distinct cookie prefix when property access exists. Test a registered campaign URL through the real intake POST/API redirect/app route to confirmed submission. Use the same stream and compatible cookies for each intended environment, check original attribution/no self-referral, and keep functional claims host-only. Negative: use mismatched cookie/tag configuration and watch session-continuity assertions fail. Never add raw descriptions, claims, emails or internal IDs to a linker or redirect.

## 4. Reports, notice and release

- [ ] 4.1 Record the owned production property/stream, access owner, two-month proposed event retention, disabled advertising settings, configured campaign catalogue and `generate_lead` key event. Create acquisition, branched funnel and content/service reports from design.md. Verify representative consented events in DebugView/Realtime and, after processing, in the saved reports. Record collection success separately from report availability. No invented enquiry monetary value or assumed qualified-lead count.
- [ ] 4.2 Update the privacy notice through conversion-scoping slice 4.2 with the verified Google settings and optional preference controls. Update `docs/website/build-runtime.md`, the website glossary's funnel-count distinction and the active superseded spec clauses to link this new policy at implementation time. Test the published notice links and the matrix of no-consent, accepted, revoked and unavailable measurement. Compare two server submissions with only one consented GA journey; document that difference as expected, not lost conversion.
- [ ] 4.3 Run scoped contracts/frontend test, lint, typecheck and build, then the analytics browser regression and the exact-SHA required gate. Private site checks use its own Bun/Nx targets. Enable production only with approved IDs, complete consent/leakage/navigation evidence and a reviewed notice; rehearse disabling tags without affecting the funnel. Record all red/green proofs in verify.md and leave unverified account settings explicitly open.

## Commands

```sh
bunx nx run-many -t test lint typecheck build -p website-contracts website-fe-01
./node_modules/.bin/openspec validate website-funnel-analytics --strict
```

Run the new browser script only after the existing loopback fixture stack is healthy. On h2puni, the final host gate is `bin/h2puni-gate.sh <sha>` from a clean isolated tree. All new safety checks need an observed failure with the check removed and an adjacent `Proof:` comment; passing fixtures without those faults do not finish the slice.
