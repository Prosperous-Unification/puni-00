/**
 * Dash's in-process edges: `cli.ts` reaches the fleet planner facade, and `cli.ts` plus the
 * runtime authority under `authority/`, the activation controller under `activation/`, the
 * activation check runner under `check-runs/` and the review invoker under `review/` reach
 * Burokrat's judges through the exact
 * `@twilight-burokrat/judge` alias. Every other cross-product, app-to-app and app-to-infrastructure
 * dependency retains the workspace fences. The compute providers under `compute/` reach the
 * fleet's pinned SSH transport through the exact `@tools/fleet-ssh-transport` alias. The two exact progress paths additionally reach
 * `@twilight-burokrat/contracts` alone, as do the two exact run storage codec/planner paths.
 * Tests may additionally reach the shared scratch helper
 * and the shared clock-read detector.
 */
export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => {
  const boundary = (allow) => ({
    '@nx/enforce-module-boundaries': [
      'error',
      {
        enforceBuildableLibDependency: true,
        allow,
        ignoredCircularDependencies: [['wbs-core', 'wbs-store-memory']],
        depConstraints: [
          // Proof: omitting these three inherited ring constraints made the effective-policy
          // equality test fail while the narrower alias/peer/sibling routing tests stayed green.
          { sourceTag: 'ring:domain', onlyDependOnLibsWithTags: ['ring:domain'] },
          {
            sourceTag: 'ring:application',
            onlyDependOnLibsWithTags: ['ring:domain', 'ring:application'],
          },
          {
            sourceTag: 'ring:adapter',
            onlyDependOnLibsWithTags: ['ring:domain', 'ring:application', 'ring:adapter'],
          },
          browserAdapterConstraint,
          ...productRules,
          ...scopeConstraints,
          ...runtimeConstraints,
        ],
      },
    ],
  });
  return [
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/**/*.ts'],
      ignores: ['apps/twilight-structure/twilight-dash/cli/src/**/*.test.ts'],
      // Fixture helpers bootstrap on absence, which production must never do. A separate rule
      // from `no-restricted-imports`, so the root TypeBox fence stays in force.
      // Proof: removing this override let claims.ts import `./testing/open-or-bootstrap`; `keeps
      // Dash authority test helpers out of production modules` failed (2026-10-11).
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/testing/**', './testing/**'],
                message: 'Test helpers bootstrap on absence; only *.test.ts may import them.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/cli.ts'],
      // Proof: omitting this exact entry made the real Dash CLI lint fail on its fixed
      // fleet planner import; a sibling infra import still fails with this entry present.
      rules: boundary(['^@tools/fleet-plan$', '^@twilight-burokrat/judge$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/authority/**/*.ts'],
      // Proof: omitting this override made uncached `twilight-dash:lint` fail on every authority
      // module's `@twilight-burokrat/judge` import; widening it to `^@twilight-burokrat/` failed
      // `Dash authority reaches only the judge alias` at the exact allow-list assertion.
      rules: boundary(['^@twilight-burokrat/judge$']),
    },
    {
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/activation/**/*.ts',
        'apps/twilight-structure/twilight-dash/cli/src/check-runs/**/*.ts',
        'apps/twilight-structure/twilight-dash/cli/src/review/**/*.ts',
      ],
      // Proof: omitting this override made uncached `twilight-dash:lint` fail on the activation
      // and review modules' `@twilight-burokrat/judge` imports; widening it to
      // `^@twilight-burokrat/` failed `Dash activation reaches only the judge alias` at the exact
      // allow-list assertion.
      // Proof (2026-10-12): dropping only the `check-runs/**` entry made eslint fail
      // `run-activation-checks.ts` with `Imports of apps are forbidden` on its judge import.
      rules: boundary(['^@twilight-burokrat/judge$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/compute/**/*.ts'],
      // The compute providers reach the fleet's pinned SSH transport through its exact facade.
      // Proof: see `Dash compute reaches only the SSH transport facade` in
      // tools/tool-devsync/src/eslint-boundaries.test.ts.
      rules: boundary(['^@tools/fleet-ssh-transport$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/**/*.test.ts'],
      // Proof: omitting this override made uncached Dash lint fail on the alias-surface test's
      // `@tools/fleet-plan` import and the fixture's `@tools/test-scratch` import (2026-10-11).
      // Proof: omitting only `^@tools/test-clock-reads$` made uncached `twilight-dash:lint` fail
      // on `no-ambient-clock.test.ts`'s detector import (2026-10-12).
      rules: boundary([
        '^@tools/fleet-plan$',
        '^@tools/test-clock-reads$',
        '^@tools/test-scratch$',
        '^@twilight-burokrat/judge$',
      ]),
    },
    {
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.ts',
        'apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.test.ts',
        'apps/twilight-structure/twilight-dash/cli/src/ledger/account-outcomes.ts',
        'apps/twilight-structure/twilight-dash/cli/src/ledger/rate-card.ts',
      ],
      // Proof: removing this allowance rejected the legitimate progress import. Widening its
      // alias, relative specifier or file scope independently broke the sibling, relative or
      // peer refusals in the effective-policy production test (2026-10-15). The two ledger
      // paths reach the same alias for canonical JSON and digests (2026-10-22).
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      // Proof: F35/F36/F37 widened alias/relative/path scope and their effective-policy denials failed.
      // F38 removed this allowance; actual reader/shared-contract source lint refused both contracts imports.
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/runs/manifest-binding.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/manifest-binding-contract.ts',
      ],
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/runs/record-codecs.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/plan-admission.ts',
      ],
      // Proof (review fix 1): `Dash run storage reaches exactly the contracts alias at its
      // two scoped paths` observed valid mutations load, then allowance removal fail contracts
      // admission; alias/relative widening fail their named denials; and path widening fail
      // the plan-ownership.ts peer denial (1/2/3/13 assertions). Loader failures were excluded.
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      files: [
        // Proof: P01 removed this consumer; the Dash executor effective-policy admission failed.
        'apps/twilight-structure/twilight-dash/cli/src/agents/execution-records.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.test.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.test.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-turn.test.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.ts',
        'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.test.ts',
      ],
      // Proof: P02R/P03R valid judge/relative widening failed their exact denials; P04 admitting execution-codecs.ts failed its peer denial in the Dash executor effective-policy test.
      // Proof: the Dash executor effective-policy test loaded valid faults, then failed contracts
      // admission on removal, judge/relative denials on alias/relative widening, and the
      // unlisted no-ambient-clock.test.ts denial on path widening (2/4/8/50 assertions).
      // Proof (Task 2): removing the exact turn-test path failed its admission; agents/*.ts
      // widening failed the unlisted api-model-turn.ts denial after 59 assertions with valid config.
      // Proof (Task 3): removing the exact adapter/source-test paths failed their admissions after 57/68
      // assertions; new-path-only alias/relative widening failed judge/relative denials after 59/63,
      // and agents/*.ts widening admitted the unlisted turn driver after 81. Config remained valid.
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      files: [
        // Proof: F44 widened the allowed source paths to peers; 'Dash runtime history' failed and exact restoration passed.
        'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-records.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-codecs.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-receipt.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-history-contract.ts',
      ],
      // Proof: F35 removed exact public WBS admission; 'Dash runtime history' failed and exact restoration passed.
      // Proof: F36 widened the WBS alias exception; 'Dash runtime history' failed and exact restoration passed.
      // Proof: F43 allowed a relative WBS shortcut; 'Dash runtime history' failed and exact restoration passed.
      rules: boundary(['^@wbs/contracts$']),
    },
    {
      files: [
        // Proof: F178 removed this exact consumer; shape and independent effective admission assertions failed with fatalErrorCount zero; restored group passed.
        'apps/twilight-structure/twilight-dash/cli/src/runs/claim-records.ts',
        // Proof: F179 removed this exact consumer; shape and independent effective admission assertions failed with fatalErrorCount zero; restored group passed.
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/execution-contract.ts',
      ],
      rules: boundary(['^@wbs/contracts$']),
    },
    {
      // Proof: F186 widened the alias and failed both shape and independent judge denial; F187 widened the file list and failed the actual plan-claims peer denial. Both valid literal mutants restored to eleven passing cases.
      // Proof: F180/F185 separately removed these exact consumers; shape and independent effective admissions failed with fatalErrorCount zero; restored group passed.
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/runs/claim-history.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/execution-history.test.ts',
      ],
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      files: [
        // Proof: F181 removed this exact consumer; shape and independent effective admission assertions failed with fatalErrorCount zero; restored group passed.
        'apps/twilight-structure/twilight-dash/cli/src/runs/record-preparation.ts',
        // Proof: F182 removed this exact consumer; shape and independent effective admission assertions failed with fatalErrorCount zero; restored group passed.
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/fixtures.ts',
      ],
      rules: boundary(['^@twilight-burokrat/contracts$', '^@wbs/contracts$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/resources/**/*.ts'],
      // Proof: removing this exact override failed `Dash resources reach only the WBS
      // transport contract at their scoped paths`; sibling/relative imports remain denied.
      rules: boundary(['^@wbs/contracts$']),
    },
    {
      files: [
        // Proof: P1/P2 removed each exact consumer; Dash runtime client functional admissions failed with no fatal lint errors.
        'apps/twilight-structure/twilight-dash/cli/src/bridge/runtime-client.ts',
        'apps/twilight-structure/twilight-dash/cli/src/bridge/runtime-client.test.ts',
      ],
      // Proof: P3/P4 widened alias/relative imports and their real denials failed; P6 admitted prepare-activity.ts and its real peer denial failed.
      rules: boundary(['^@wbs/contracts$']),
    },
  ];
};
