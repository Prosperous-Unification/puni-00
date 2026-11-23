import type { PlanExportReader } from '@wbs/core/ports/plan-export-reader';

/** Unrelated compositions explicitly lack an export observation; accidental use fails visibly. */
export const refusingPlanExports: PlanExportReader = {
  readExport: () => Promise.reject(new Error('this fixture does not provide plan export capture')),
};
