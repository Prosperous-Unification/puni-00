## Verification record

Nothing implemented yet. Drafted 2026-10-19; the design interview with Dany was held the same
day and D1 to D8 reflect it. Three items are marked assumed in design.md.

Measured for the design, read-only on the dev store (`/home/puni1/wbs-dev/data/wbs.db`,
`bun:sqlite` readonly over SSH to h2puni, 2026-10-19): project `PUNI platform plan`
(`558ec5c7-f561-4181-9d9b-055b06bc9796`): 211 work items; assignments 0; team labels 0;
external refs 2; readiness `ready` 6, `draft` 1; hold `blocked` 6; step progress `done` 495,
`in_progress` 42; `project_team_capacity` rows 0; steps `plan`, `impl`, `review`.

Read for D5 to D7 on 2026-10-19: mcp-01 registers public clients dynamically without a
client name, keeps no agent identity, and forwards the human's upstream token to be-01
(`apps/wbs/mcp-01/src/oauth.ts`, `caller-auth.ts`); `external_identity` already maps many
`(issuer, subject)` pairs to one account. OpenClaw subagent session keys read
`agent:<agentId>:subagent:<uuid>` (docs.openclaw.ai/tools/subagents); Claire's engine
requires that shape for `minion_run_id` (`bin/engine-fields.mjs`).

Task 0.2, verified 2026-10-19 on h2puni against the dev tenant with the dev web client's
credentials from `oidc-dev.env` (values never printed): `POST /oauth/token` with
`grant_type=client_credentials` and the WBS API audience answered
`403 unauthorized_client: Grant type 'client_credentials' not allowed for the client`. No
machine-to-machine application exists in the dev tenant. The deployed groups Action
(`docs/auth-integration.md` §post-login) maps `event.authorization.roles` in the post-login
flow, which Auth0 does not run for client-credentials tokens, so an M2M token would carry no
`wbs_groups` even once an M2M application is authorized for the API. Decision owed to Dany
before slice 2.5: either (a) an M2M application per fleet plus a credentials-exchange
(Machine to Machine flow) Action that sets `wbs_groups` from the application's metadata, or
(b) be-01 scopes a request from a linked credential by the linked account's memberships
when the token carries no groups claim, keeping the contract independent of the identity
provider. Recommended: (b), with (a)'s application still needed for the audience.

Task 0.3, read 2026-10-19 in `plan-document-shapes.ts`: plan document v9 (the laptop's main
checkout was stale at v6 when first read; the branch carries 9) carries `people`
with `teamIds`, `teams` with `serviceIds`, and per-item `assignees` keyed by step reference.
A Burokrat branch rule can therefore read a person's teams and a step's assignee from v6
without a new version. Claims are not in v9; showing them in the export needs a v10 field,
which is not in this change (the export SHALL NOT carry account ids either way).

Dev store activation, read 2026-10-20 (read-only): `organization`, `organization_membership`
and `external_identity` hold 0 rows on dev. Organizations are not activated there, so slice
2.4's CLI refuses to link (it refuses before activation, because pre-activation logins never
read `external_identity`) and task 2.5's dev proof is blocked until dev is activated. That is
an operator decision for Dany: activating organizations on dev changes sign-in for every dev
user.

`openspec validate --all --json` on this change: run before each push, result in the PR.
