import { createRoot } from 'react-dom/client';

import { planOf, pointedAtRow, rowAt, sliceAt } from '@/components/wbs/gantt-fixtures';
import { GanttPanel } from '@/components/wbs/gantt-panel';
import type { AttemptView } from '@/lib/wbs-api';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';

const startDate = '2026-08-03';
const startedAt = Date.parse('2026-08-03T04:00:00Z');
const outcomes: AttemptView['outcome'][] = ['failed', 'cancelled', 'succeeded', null];
const plan = planOf({
  startDate,
  timezone: 'Europe/Kyiv',
  rows: outcomes.map((outcome, index) =>
    rowAt(`row-${String(index)}`, 0, 0.5, {
      attemptNodes: [
        {
          id: `node-${String(index)}`,
          stepId: 'dev',
          reference: null,
          attempts: [
            {
              attemptNumber: index + 1,
              startedAt,
              endedAt: outcome === null ? null : startedAt + 120000,
              outcome,
              executorPersonId: null,
              reference: `run/${String(index + 1)}`,
              note: null,
            },
          ],
        },
      ],
    }),
  ),
  slices: outcomes.map((_, index) =>
    sliceAt(`slice-${String(index)}`, `row-${String(index)}`, 0, 0.5),
  ),
});

createRoot(document.body).render(
  <ApplicationServicesProvider>
    <GanttPanel
      plan={plan}
      startDate={startDate}
      scheduleError={null}
      generation={0}
      now={startedAt + 120000}
      heightPx={400}
      dayPx={896}
      onPickRow={() => undefined}
      onPointRow={() => undefined}
      pointed={pointedAtRow(null)}
    />
  </ApplicationServicesProvider>,
);
