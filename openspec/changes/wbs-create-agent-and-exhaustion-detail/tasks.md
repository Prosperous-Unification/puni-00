<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. createPerson creates an agent (F1)

- [x] 1.1 `createPerson` gains `'personKind?': 'string'` in its definition, its normalizer
      and its binding; `DirectoryService.addPersonWithin` takes it as a `string` and refuses
      a value outside `PERSON_KINDS` `invalid_kind` before anything is read.
      Tests in `agent-person-limit.controller.db.test.ts`: an agent created directly, a
      person by default, a kind outside the set; `plan-command-shapes.test.ts` covers the
      wire arm and a malformed `personKind`.
      Negative: the `invalid_kind` check removed; the outside-the-set case answered 500
      from the person table's CHECK constraint.
- [x] 1.2 A new agent passes `refuseAgentPersons` (the organization gauge) inside the
      batch's turn, as `patchPerson` does; a held name keeps its kind and adds no agent.
      Tests: the fifth agent created directly under a cap of 4, a batch creating two agents
      where one is free, a held name keeping its kind, the legacy case, and the race case
      in `agent-person-limit-race.db.test.ts`.
      Negatives: the gauge check bypassed (2 cases fail); the gauge answering its first
      count for every later batch (race case fails).
- [x] 1.3 The `createPerson` MCP/OpenAPI description names `personKind`, `invalid_kind` and
      `agent_person_limit`.

## 2. resources_exhausted names every short resource (F7)

- [x] 2.1 `refuseOccupancy` collects every short resource into `resources`, the first
      repeated in the top-level fields. Test in `claim-occupancy.test.ts`: every resource a
      claim is short of. Negative: keeping only the first.
- [x] 2.2 The claim service names the holders of each entry; the batch binding, the
      feature's detail type, the contract's `CommandRefusalDetail` and the 409 arm carry
      `resources`. Tests: both short resources named in `resource-occupancy.db.test.ts`
      (both stores); the 409 arm in `work-item-shapes.test.ts`.
      Negatives: the binding cut to the first entry; the arm without `resources`.
- [x] 2.3 The `claimWorkItem` description says `resources` lists every short resource.
