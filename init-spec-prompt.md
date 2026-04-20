Help me build a project scaffolding. I want specific tech

- nx for monorepo management - separate BE (be-01), FE (fe-01) and shared-lib-01 that allows to share code for validation, utils, etc
- BE: bun, typescript, elysiajs, drizzle, caddyserver, arktype for validation
- FE: react, typescript, tanstack router, shadcn/ui, vite
- DB: sqlite, but must be DB agnostic
- other FE: tanstack table, d3
- deployent: to a hetzner instance, using ssh scp with minimal infra. I was thinking caddyserver, traefik in a self-hosted k8s (i though abt k3s)
- code organization: BE - controller -> service -> repositories (data access layer), FE - whatever the best org is now using tanstack router

What the project is about

- a project manageent tool that allows to effortlessly enter and manage a WBS for a project
- it must be local first - meaning that all state is saved in the browser
- it must allow optional integration with the server using tanstack db (two modes - local, server)
- the core of the WBS ui is a table that maintains nested lists - the catch is that it is both a table (tanstack table, spreadsheet like) and a nested list at the same time: being a table allows it to maintain same columns for each row
  and brings structure, being a nested list allows to aggregate into from sub-items into parent items
- columns:
- - item num - must follow the scheme 010, 020, 030 ... why the 0 prefix? to make 010 sort before 100 when sorting lexicographically, why the last 0? to be able to insert additional tasks like 011, 012 after the first draft is already taken
    into work
- - item nums are intended to represent the sequence of execution in some capacity. though 010 and 020 items might be executed in parallel, if item 010 depends on item 020 that is not ok, the nubering must change.
- - item nums: item nums must be automatically decided by the system, unless current numbering is frozen by the user - the tasks are already exported and taken in to work, so cannot change current naming.
- - item nums: for nested items the numbering system must work like this - 010.1, 010.2, 010.1.1, 010.1.2 - this is based on the hypothesis that no more than 10 sub items are needed ever. if user adds more than 10 subitems, the naming
    must change to 010.01
- - estimates: each row must contain three-point estimate columns - optimistic, realistic, pessimistic - estimates are in days. the idea is that optimistic is what it takes to implement it when there are no unknown unknowns, unknowns as of the moment are resolved in expected mannger and all the work you can imagine in general comes at a ateady expected rate, pessimistic - you encounter all unknowns unknowns that you're able to sense, all unknowns come with harder decisions etc, optimistic - not simply a middleground or avg, but a "best guess" - what do you beleive the work will actually take - intuition based.
- - estimates: if an item has nested items - estimates of sub-items must add up; if an item already has an estimate and I'm adding a sub-item, the estimate of parent item must go to it's first child
- - estimates: by default each item is to be assigned a two sets of estimates: Dev estimates & QA estimates; but this must be configurable. probably must allow to select a predefined config for a team + allow to specify roles involved for each work item.
- - dependencies: any item might be declared dependant on any other item. dependencies is a column as well. it must allow to select from other items in the WBS - type + dropdown type of element, search by full text of an item name + number + notes so that i can either select a number or search by text.
- - assignees config: is a pre-configured list of ppl workin in different teams in different roles
- - assignees: a column that allows to either assign a specific person or a team to the item, might have several person assignees if they have different roles
- - columns:

- gantt chart: using dependencies between items, assignees (Devs, QAs, other roles, must work with roles config) and final estimate (configured by a formula), default is using pessimistic - must build a gantt chart allowing to select a start date; use d3 for gantt chart
