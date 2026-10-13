/** Discrete calendar widths; each sub-day cell represents part of a 480-minute workday. */
export const AXIS_RUNGS = [
  { id: 'days', pxPerWorkday: 28, cellsPerWorkday: 1, label: 'Days' },
  { id: 'weeks', pxPerWorkday: 12, cellsPerWorkday: 1, label: 'Weeks' },
  { id: 'months', pxPerWorkday: 4, cellsPerWorkday: 1, label: 'Months' },
  { id: '4h', pxPerWorkday: 56, cellsPerWorkday: 2, label: '4 h' },
  // Proof: 8 changed to 24; the 224px clock-cell case failed on 24 labels instead of eight (2026-10-12).
  { id: '1h', pxPerWorkday: 224, cellsPerWorkday: 8, label: '1 h' },
  { id: '15m', pxPerWorkday: 896, cellsPerWorkday: 32, label: '15 min' },
] as const;

/** A rung's stable storage identity. */
export type AxisRungId = (typeof AXIS_RUNGS)[number]['id'];
/** A supported pixel width; retained for existing chart and export callers. */
export type DayPx = (typeof AXIS_RUNGS)[number]['pxPerWorkday'];
/** Rung geometry stays in workdays; the pixel scale is applied only when drawing. */
export interface AxisRung {
  readonly id: AxisRungId;
  readonly pxPerWorkday: number;
  readonly cellsPerWorkday: number;
  readonly label: string;
}

/** The provisional working-day anchor, in project-zone clock minutes; retired by `agent-calendar-instant-axis`. */
export const STAGE_ONE_DAY_START_MINUTE = 540;

/** Resolves a supported width without inventing a rung between the discrete choices. */
export function resolveAxisRung(px: DayPx): (typeof AXIS_RUNGS)[number] {
  switch (px) {
    case 28:
      return AXIS_RUNGS[0];
    case 12:
      return AXIS_RUNGS[1];
    case 4:
      return AXIS_RUNGS[2];
    case 56:
      return AXIS_RUNGS[3];
    case 224:
      return AXIS_RUNGS[4];
    case 896:
      return AXIS_RUNGS[5];
  }
}

/** Resolves a validated storage id to the chart's pixel API. */
export function resolveRungWidth(id: AxisRungId): DayPx {
  switch (id) {
    case 'days':
      return 28;
    case 'weeks':
      return 12;
    case 'months':
      return 4;
    case '4h':
      return 56;
    case '1h':
      return 224;
    case '15m':
      return 896;
  }
}

/** Whether a storage claim names an offered rung. */
export function isAxisRungId(claimed: unknown): claimed is AxisRungId {
  return AXIS_RUNGS.some((rung) => rung.id === claimed);
}

/** Measured safe bracket from the 020.07 timeline experiment; raising it requires a new measurement. */
export const SUB_DAY_MARK_LIMIT = 2_500;

/** The clock words and pixel width shared by the live axis and standalone SVG export. */
export function buildClockCells(
  rung: AxisRung,
): { minute: number; clock: string; shown: string; widthPx: number }[] {
  return Array.from({ length: rung.cellsPerWorkday }, (_, cell) => {
    const minute = STAGE_ONE_DAY_START_MINUTE + (cell * 480) / rung.cellsPerWorkday;
    const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    return {
      minute,
      clock,
      shown: rung.id !== '15m' || minute % 60 === 0 ? clock : '',
      widthPx: rung.pxPerWorkday / rung.cellsPerWorkday,
    };
  });
}
