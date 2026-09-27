## ADDED Requirements

### Requirement: Label agreement covers the frontend modules

The label-agreement check SHALL read every module directory under `apps/wbs/fe-01/src/modules`
with the `frontend` identifier segment, alongside the application and backend roots. Each frontend
module SHALL be indexed and registered in the wiki pilot under `module.frontend.<directory>` and
`boundary.frontend.<directory>`. A frontend module SHALL either carry a `module.ts` whose sealed
module's `moduleLabel` is `frontend.<directory>`, or be declared unsealed. A declared-unsealed
module SHALL have no `module.ts` and no non-test source importing `di-bag`, and each declaration
SHALL name an existing module directory.

#### Scenario: The frontend root is omitted

- **WHEN** the check's roots no longer include `apps/wbs/fe-01/src/modules`
- **THEN** discovery no longer finds `module.frontend.preferences` and the check fails

#### Scenario: A sealed frontend module carries the wrong label

- **WHEN** Preferences' label is `frontend.preference`
- **THEN** the check reports `moduleLabel frontend.preference, expected frontend.preferences`

#### Scenario: A frontend module is neither sealed nor declared unsealed

- **WHEN** Preferences has no `module.ts`
- **THEN** the check reports it has no `module.ts` and is not declared unsealed

#### Scenario: A declared-unsealed module builds a bag

- **WHEN** Project, declared unsealed, gains a `module.ts` or imports `di-bag` in its composition
- **THEN** the check reports the declaration as false

#### Scenario: A frontend index or registration disagrees

- **WHEN** Plan feed's README names `module.frontend.plan-feeds`, holds no index line, or its `modules.json` row indexes Project's README
- **THEN** the check reports that module
