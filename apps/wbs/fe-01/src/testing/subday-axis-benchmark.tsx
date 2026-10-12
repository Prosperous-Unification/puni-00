import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import {
  MONDAY_START,
  planOf,
  pointedAtRow,
  rowAt,
  sliceAt,
} from '@/components/wbs/gantt-fixtures';
import { type DayPx, GanttPanel } from '@/components/wbs/gantt-panel';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';

/** Isolated measurement entry: the shipped panel, with no API or remembered runtime. */
function SubdayPanelFixture({ leaves }: { leaves: number }) {
  const [dayPx, pickDayPx] = useState<DayPx>(896);
  const steps = Array.from({ length: leaves === 1 ? 2 : 5 }, (_, index) => ({
    id: `step-${String(index)}`,
    name: `Step ${String(index)}`,
  }));
  const plan = planOf({
    rows: Array.from({ length: leaves }, (_, index) => rowAt(`row-${String(index)}`, 0, 5)),
    steps,
    slices: Array.from({ length: leaves }, (_, row) =>
      steps.map((step, index) => {
        const start = leaves === 1 ? (index * 6) / 896 : index;
        const span = leaves === 1 ? 2 / 480 : 1;
        return sliceAt(
          `mark-${String(row)}-${String(index)}`,
          `row-${String(row)}`,
          start,
          start + span,
          { stepId: step.id },
        );
      }),
    ).flat(),
  });
  return (
    <GanttPanel
      plan={plan}
      startDate={MONDAY_START}
      scheduleError={null}
      generation={0}
      heightPx={400}
      dayPx={dayPx}
      onPickDayPx={pickDayPx}
      onPickRow={() => undefined}
      onPointRow={() => undefined}
      pointed={pointedAtRow(null)}
    />
  );
}

const root = createRoot(document.body);

/** Fresh panel mount followed by the experiment's two-frame completion wait. */
async function mountPanel(leaves: number): Promise<number> {
  flushSync(() => {
    root.render(null);
  });
  const started = performance.now();
  flushSync(() => {
    root.render(
      <ApplicationServicesProvider>
        <SubdayPanelFixture leaves={leaves} />
      </ApplicationServicesProvider>,
    );
  });
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
  return performance.now() - started;
}

declare global {
  interface Window {
    subdayBenchmark: { mountPanel: typeof mountPanel };
  }
}
window.subdayBenchmark = { mountPanel };
void mountPanel(1);
