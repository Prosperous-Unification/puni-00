## Context

The public host gate runs the complete monorepo. Its website handoff additionally requires an ordinary full-gate receipt, before the existing website builder executes its own source checks. Both selected private roles contain the same11 Nx projects, including the six website projects, deployment tooling and workspace dependencies. Their five canonical public product trees match public4d3 exactly. The normal full private profile with checks enabled already covers this complete isolated workspace.

## Goals / Non-Goals

Remove the public full-gate prerequisite for product releases. Retain actual product validation and all deployment safety. Do not create a new runner, job type, bypass flag or fabricated ordinary-gate verdict. Do not mutate frozen publishers, source family, controller, private role revisions or the live site.

## Decisions

Define release preflight separately from completed release qualification. Use the existing private checks-enabled full-profile command as the conservative website closure, with explicit whole website migration lint. A new attended publisher consumes a closed, source-bound `website-release-preflight/1` assertion containing `validationCompleted:false`, the exact private project inventory and product tree identities. It emits the existing source-identity begin evidence; the historical wire field `gate` contains the public source SHA and does not itself assert a full gate pass. Calibration acceptance still requires actual completed job, source, telemetry, attribution and retirement evidence.

Keep old ordinary-gate qualifiers and publishers immutable. The new route checks all old and new attempt paths before its sole publication. Any uncertainty follows the original attempt. Cancel only the exact owned redundant r2 gate through the documented controlled end route and prove terminal outcome, process/scope settlement and admission release before build dispatch. Preserve the loaded historical r1 unit required by the existing idle observer.

## Risks / Trade-offs

Nx CLI exit zero can accompany zero tasks or a partial graph. Scope evidence therefore uses the strict API or verified complete private workspace rather than CLI status alone. Preflight cannot be used as completed qualification. A full private workspace is conservative and can include small tooling suites; it contains no WBS or Dash projects. Later artifact publication, schema sealing and live business acceptance remain mandatory.

## Migration Plan

Update guidance and source-bound procedure, review and test the replacement operator publishers, retire the owned redundant gate, then begin the existing private build series once. Preserve all historical receipts and the live static site.
