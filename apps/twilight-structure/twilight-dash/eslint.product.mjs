/**
 * Dash's in-process edges: `cli.ts` reaches the fleet planner facade, and `cli.ts` plus the
 * runtime authority under `authority/`, the activation controller under `activation/`, the
 * activation check runner under `check-runs/` and the review invoker under `review/` reach
 * Burokrat's judges through the exact
 * `@twilight-burokrat/judge` alias. Every other cross-product, app-to-app and app-to-infrastructure
 * dependency retains the workspace fences. The two exact progress paths additionally reach
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
      ],
      // Proof: removing this allowance rejected the legitimate progress import. Widening its
      // alias, relative specifier or file scope independently broke the sibling, relative or
      // peer refusals in the effective-policy production test (2026-10-15).
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
    {
      files: [
        'apps/twilight-structure/twilight-dash/cli/src/runs/record-codecs.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/plan-admission.ts',
      ],
      // Proof: removing this allowance or independently widening its alias, relative
      // specifier or paths failed `Dash run storage reaches exactly the contracts alias
      // at its two scoped paths` against the effective ESLint policy.
      rules: boundary(['^@twilight-burokrat/contracts$']),
    },
  ];
};
