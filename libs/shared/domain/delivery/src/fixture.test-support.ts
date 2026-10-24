import type { DeliveryObservation } from './observation';

export function source(id: string) {
  return {
    provider: 'forge-β',
    id,
    url: 'https://forge.example/change/task-alpha',
    nativeState: 'vendor:finished',
    observedAt: '2026-10-23T10:00:00Z',
  };
}

export function observation(): DeliveryObservation {
  return {
    version: 1,
    observedAt: '2026-10-23T10:00:00Z',
    change: {
      source: source('change:α'),
      title: 'Ship change',
      revision: 'revision:next@β',
      state: 'open',
      mergedRevision: null,
    },
    checks: [
      {
        source: source('check:lint'),
        name: 'Lint',
        revision: 'revision:next@β',
        state: 'passed',
        startedAt: '2026-10-23T09:00:00Z',
        completedAt: '2026-10-23T09:00:10Z',
      },
    ],
    runs: [
      {
        source: source('run:ci'),
        name: 'Build',
        revision: 'revision:next@β',
        attemptsComplete: true,
        attempts: [
          {
            source: source('attempt:first'),
            startedAt: '2026-10-23T09:00:00Z',
            completedAt: '2026-10-23T09:00:20Z',
            executionsComplete: true,
            executions: [
              {
                source: source('job:α'),
                executionId: 'exec:α',
                name: 'Build α',
                kind: 'performed',
                resource: 'pool:violet',
                state: 'passed',
                startedAt: '2026-10-23T09:00:02Z',
                completedAt: '2026-10-23T09:00:12Z',
              },
              {
                source: source('job:β'),
                executionId: 'exec:β',
                name: 'Build β',
                kind: 'performed',
                resource: 'pool:violet',
                state: 'failed',
                startedAt: '2026-10-23T09:00:05Z',
                completedAt: '2026-10-23T09:00:20Z',
              },
            ],
          },
        ],
      },
    ],
    coverage: {
      checks: 'complete',
      runs: 'complete',
      notes: ['Checks exclude merge-policy and legacy-status coverage.'],
    },
  };
}
