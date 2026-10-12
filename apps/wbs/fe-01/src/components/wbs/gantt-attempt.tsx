import type { GanttAttemptMark } from './gantt-geometry';

/** Stable identity for a historical attempt independent of the forecast slice. */
export function identifyAttemptMark(mark: GanttAttemptMark): string {
  return `attempt:${mark.nodeId}:${String(mark.attempt.attemptNumber)}`;
}

/** Original stored instants in the project zone; clamping never changes these facts. */
export function AttemptCard({
  mark,
  timezone,
  personNames,
}: {
  mark: GanttAttemptMark;
  timezone: string;
  personNames: ReadonlyMap<string, string>;
}) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    // Proof: removing this option rendered Los Angeles clock dates and failed the overnight zoned card test (2026-10-12).
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const attempt = mark.attempt;
  const executor =
    attempt.executorPersonId === null
      ? 'unassigned'
      : (personNames.get(attempt.executorPersonId) ?? attempt.executorPersonId);
  return (
    <>
      <p>{`Attempt ${String(attempt.attemptNumber)} — ${attempt.outcome ?? 'running'}`}</p>
      <p>{`${formatter.format(attempt.startedAt)} — ${attempt.endedAt === null ? 'now' : formatter.format(attempt.endedAt)} (${timezone})`}</p>
      <p>{`Executor: ${executor}`}</p>
      {attempt.reference !== null && <p>{`Reference: ${attempt.reference}`}</p>}
      {mark.nodeReference !== null && <p>{`Node: ${mark.nodeReference}`}</p>}
      {attempt.note !== null && <p>{attempt.note}</p>}
    </>
  );
}

/** Patterns use pixel-sized tiles despite the chart's different horizontal and vertical units. */
export function AttemptPatterns({
  prefix,
  dayPx,
  rowPx,
}: {
  prefix: string;
  dayPx: number;
  rowPx: number;
}) {
  return (
    <defs>
      <pattern
        id={`${prefix}-failed`}
        patternUnits="userSpaceOnUse"
        width={6 / dayPx}
        height={6 / rowPx}
      >
        <path
          d={`M 0 ${String(6 / rowPx)} L ${String(6 / dayPx)} 0`}
          stroke="#991b1b"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </pattern>
      <pattern
        id={`${prefix}-cancelled`}
        patternUnits="userSpaceOnUse"
        width={6 / dayPx}
        height={6 / rowPx}
      >
        <ellipse cx={3 / dayPx} cy={3 / rowPx} rx={1 / dayPx} ry={1 / rowPx} fill="#92400e" />
      </pattern>
    </defs>
  );
}

/**
 * One start-day mark above its forecast. Tiny attempts paint a tick while keeping an
 * 18px centered hit surface; running outlines deliberately omit their right edge.
 */
export function AttemptMark({
  mark,
  prefix,
  dayPx,
  rowPx,
  onShow,
  registerHit,
  onDismiss,
}: {
  mark: GanttAttemptMark;
  prefix: string;
  dayPx: number;
  rowPx: number;
  onShow: (
    mark: GanttAttemptMark,
    target: SVGRectElement,
    point?: { x: number; y: number },
  ) => void;
  registerHit: (hit: SVGRectElement | null) => void;
  onDismiss: () => void;
}) {
  const outcome = mark.attempt.outcome ?? 'running';
  const y = mark.rowIndex + 0.22;
  const height = 0.28;
  const width = mark.tick ? 0 : mark.width;
  // Proof: swapping only hatch/dot URL mappings failed the actual-paint panel assertion with outcome attributes intact (2026-10-12).
  const fill =
    outcome === 'failed' || outcome === 'cancelled' ? `url(#${prefix}-${outcome})` : '#166534';
  const hitWidth = mark.hitWidthPx / dayPx;
  const right = mark.x + width;
  return (
    <g
      data-attempt={outcome}
      data-attempt-id={identifyAttemptMark(mark)}
      {...(mark.clamped ? { 'data-clamped': true } : {})}
      {...(mark.tick ? { 'data-attempt-tick': true } : {})}
    >
      <rect
        data-attempt-paint
        x={mark.x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke={mark.running ? 'none' : '#334155'}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {mark.tick && (
        <path
          d={`M ${String(mark.x)} ${String(y)} V ${String(y + height)}`}
          stroke="#334155"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {mark.running && (
        <path
          data-attempt-open-edge
          d={`M ${String(right)} ${String(y)} H ${String(mark.x)} V ${String(y + height)} H ${String(right)}`}
          fill="none"
          stroke="#166534"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      <rect
        ref={registerHit}
        data-attempt-hit
        data-gantt-mark={identifyAttemptMark(mark)}
        // Proof: omitting translated mark.x failed the translated header/forecast/hit panel case (2026-10-12).
        x={mark.x + width / 2 - hitWidth / 2}
        y={y + height / 2 - 9 / rowPx}
        width={hitWidth}
        // Proof: the original 0.28-row hit height failed the two-minute panel surface case at 7.84px (2026-10-12).
        height={18 / rowPx}
        fill="transparent"
        // Proof: omitting fill-only targeting fails the two-minute pointer surface contract assertion (2026-10-12); the axis browser proof observes oversized stroke hit footprints.
        pointerEvents="fill"
        role="button"
        tabIndex={0}
        aria-label={`Attempt ${String(mark.attempt.attemptNumber)} — ${outcome}`}
        onFocus={(focus) => {
          onShow(mark, focus.currentTarget);
        }}
        onClick={(click) => {
          onShow(mark, click.currentTarget);
        }}
        onPointerOver={(pointer) => {
          if (pointer.pointerType === 'mouse')
            onShow(mark, pointer.currentTarget, { x: pointer.clientX, y: pointer.clientY });
        }}
        onPointerMove={(pointer) => {
          if (pointer.pointerType === 'mouse')
            onShow(mark, pointer.currentTarget, { x: pointer.clientX, y: pointer.clientY });
        }}
        onPointerOut={onDismiss}
        onKeyDown={(key) => {
          if (key.key === 'Enter' || key.key === ' ') {
            key.preventDefault();
            onShow(mark, key.currentTarget);
          }
        }}
      />
    </g>
  );
}
