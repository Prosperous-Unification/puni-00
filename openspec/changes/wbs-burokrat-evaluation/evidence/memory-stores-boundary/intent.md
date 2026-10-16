# Memory store boundary

The 1,035-line memory source combines table ownership and fixture binding with
coordination, capture, and independent history. Move the contiguous table/state/
binding declarations into adjacent `memory-stores.ts`, preserving all behavior.

This is an R4 mechanical extraction, based on `87a2b7edb`; its source blob
`0e54a8559a06300ae59af8c070b9eb8ec3ba512f` matches reviewed wave12
`72118c493671151131bbc80c0388c870ff32647e`. Keep `MemoryState` reexported from
`source.ts`, and leave `index.ts` unchanged. Export only `MemoryState`, `bindStores`,
and `replaceMap` internally. Preserve defaults, all eighteen table families,
proxy receiver semantics, coordinator ordering, history helper calls, identity,
rollback, detached reads, cascades, touched projects, and late-write hooks.

No new contract, feature, WBS certification, activation, or diagnostic policy is
introduced. WBS090 row `7ad9e8a6-0369-43f0-9711-8d9e687d92a6` stays
`blocked_by_proxy`.
