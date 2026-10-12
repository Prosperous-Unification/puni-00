import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import {
  MONDAY_START,
  planOf,
  pointedAtRow,
  rowAt,
  sliceAt,
} from '@/components/wbs/gantt-fixtures';
import { AXIS_RUNGS, type DayPx, GanttPanel, GanttRenderer } from '@/components/wbs/gantt-panel';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';

/** Isolated measurement entry: the shipped panel, with no API or remembered runtime. */
function SubdayPanelFixture({
  leaves,
  milestone,
  renderer,
  attempts,
}: {
  leaves: number;
  milestone: boolean;
  renderer: boolean;
  attempts: boolean;
}) {
  const [dayPx, setDayPx] = useState<DayPx>(896);
  const [rungNotice, setRungNotice] = useState<string | null>(null);
  const pickDayPx = useCallback((px: DayPx, notice?: string) => {
    setDayPx(px);
    setRungNotice(notice ?? null);
  }, []);
  const [pointed] = useState(() => pointedAtRow(null));
  const [plan] = useState(() => {
    const steps = Array.from({ length: milestone ? 1 : leaves === 1 ? 2 : 5 }, (_, index) => ({
      id: `step-${String(index)}`,
      name: `Step ${String(index)}`,
    }));
    const plan = planOf({
      startDate: MONDAY_START,
      timezone: 'UTC',
      rows: Array.from({ length: leaves }, (_, index) =>
        rowAt(
          `row-${String(index)}`,
          0,
          5,
          attempts
            ? {
                attemptNodes: [
                  {
                    id: `node-${String(index)}`,
                    stepId: 'step-0',
                    reference: null,
                    attempts: [
                      {
                        attemptNumber: 1,
                        startedAt: Date.UTC(2026, 7, 10, 9),
                        endedAt: Date.UTC(2026, 7, 10, 10),
                        outcome: 'succeeded',
                        executorPersonId: null,
                        reference: null,
                        note: null,
                      },
                    ],
                  },
                ],
              }
            : {},
        ),
      ),
      steps,
      slices: Array.from({ length: leaves }, (_, row) =>
        steps.map((step, index) => {
          const start = leaves === 1 ? (index * 6) / 896 : index;
          const span = milestone ? 0 : leaves === 1 ? 2 / 480 : 1;
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
    return plan;
  });
  const shared = {
    plan,
    now: Date.UTC(2026, 7, 10, 12),
    startDate: MONDAY_START,
    generation: 0,
    heightPx: 400,
    dayPx,
    rungNotice,
    onPickDayPx: pickDayPx,
    onPickRow: () => undefined,
    onPointRow: () => undefined,
    pointed,
  };
  if (renderer)
    return (
      <GanttRenderer
        {...shared}
        labelsShown={true}
        onPickLabelsShown={() => undefined}
        registerSvgDownload={() => undefined}
        markers={[]}
        onRenameMarker={() => undefined}
        onRecolorMarker={() => undefined}
        onDeleteMarker={() => undefined}
        onCreateMarker={() => undefined}
        newMarkerId={() => {
          throw new Error('Benchmark cannot create calendar markers');
        }}
        scaleTitle={`One day is ${String(dayPx)}px wide`}
        scaleOptions={AXIS_RUNGS.map((rung) => ({ ...rung, unavailable: false, refusal: '' }))}
      />
    );
  return <GanttPanel {...shared} scheduleError={null} />;
}

declare const __SUBDAY_SOURCE_SHA__: string;
const artifact = {
  sha: __SUBDAY_SOURCE_SHA__,
  mode: import.meta.env.MODE,
  production: import.meta.env.PROD,
};
const root = createRoot(document.body);

/** Fresh panel mount followed by the experiment's two-frame completion wait. */
async function mountPanel(
  leaves: number,
  milestone = false,
  renderer = false,
  attempts = false,
): Promise<number> {
  flushSync(() => {
    root.render(null);
  });
  const started = performance.now();
  flushSync(() => {
    root.render(
      <ApplicationServicesProvider>
        <SubdayPanelFixture
          leaves={leaves}
          milestone={milestone}
          renderer={renderer}
          attempts={attempts}
        />
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
    subdayBenchmark: { mountPanel: typeof mountPanel; artifact: typeof artifact };
  }
}
window.subdayBenchmark = { mountPanel, artifact };
void mountPanel(1);
