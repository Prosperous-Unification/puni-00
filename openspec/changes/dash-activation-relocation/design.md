## Context

The admission authority moved first (`dash-authority-relocation`, ADR 0050). It set the pattern
this change follows:

1. Split judge from runtime inside Burokrat.
2. Move the runtime whole behind the exact `@twilight-burokrat/judge` alias.
3. Make the clock a required dependency.
4. Make store creation explicit and pin the schema with a golden dump.
5. Prove rollback against a vendored archive of the pre-relocation code.

The activation controller imports only Burokrat's content manifest, records, inventory, review
protocol and audit. Only `cli.ts` imports the review invoker, for `readInvocationJournal` and
`validateReviewProvenance`.

## Decisions

- **Split, then move (S0, S1).** `review/invocation-journal.ts` takes the journal records, the
  reconcilers, `readInvocationJournal` and `validateReviewProvenance`, and stays in Burokrat. The
  runtime half of `review/invoker.ts` imports from it. In S0 every module that will move already
  reaches Burokrat through `judge-facade.ts`, so S1 only moves files and rewrites the alias.
- **Facade scan.** Exhaustive coverage reaches the relationship extractor, whose
  `relationships/declarations.ts` parses with an in-memory SQLite database. The facade scan now
  allows `bun:sqlite` only in named in-memory modules, and only while every `new Database(` there
  opens `':memory:'`.
- **Cross-product test reads.** The moved tests read Burokrat's classification-policy fixture by
  path and run Burokrat's `validate-review-provenance` as a process, the way any consumer would.
  That is a file read and a process call, not an import, so the alias fence stays exact.
  `twilight-dash:test` declares the Burokrat project directory and `trusted-wiki.yml` as inputs.
- **Test timeout.** Dash's test target timeout rises from 30 s to 60 s, the bound the moved suites
  were calibrated against in Burokrat.
- **Clocks (S2).** `src/clock.ts` provides `wallClock()` and `monotonicClock()`, and is the only
  production module that reads either. `entrypoint.ts` and `activation/observation-service-cli.ts`
  are the only composers. The AST detector becomes `tools/test/clock-reads`.
- **Store (S3).** Store creation and migration are explicit commands that parse their whole
  grammar before touching state. Typed refusals: `absent`, `unreadable`, `exists`, `current`,
  `unsupported-version`.
- **Launcher (S4).** `twilight-dash:build` bundles the observation service launcher as a second
  composition root, and prints its SHA-256.
- **Rollback (S5).** An exact `git archive` of the controller closure at `PRE_RELOCATION_SHA` is
  vendored. It is declared by path in the three wiki policies, as `pre-relocation-burokrat.tar`
  is.

## Risks

- **Launcher identity.** The observation launcher's SHA-256 is the layout's `launcherIdentity`.
  `build.ts` therefore emits a bundle with no checkout path and no source-path comments, and a
  two-root test pins that it is reproducible.
