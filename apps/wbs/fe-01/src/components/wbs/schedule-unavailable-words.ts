import type { PlanRead } from '@/lib/wbs-api';

type UnavailableSchedule = Exclude<PlanRead['scheduleError'], string | null>;

/** Explains captured connected placement refusal without concealing the editable plan. */
export function scheduleUnavailableWords(refusal: UnavailableSchedule): string {
  // Proof: routing missing-calendar evidence through the range message failed the mounted table and chart project-label assertions (2026-10-22).
  switch (refusal.kind) {
    case 'dependency_calendar_missing':
      return `Dates are unavailable because a dependency project has no start date: ${refusal.projects.map((project) => `${project.abbreviation} · ${project.name}`).join(', ')}. Dependencies and readiness remain inspectable.`;
    case 'engine_unavailable':
      return refusal.reason === 'adapter_missing'
        ? 'The required optimized scheduling engine is unavailable. Dependencies and readiness remain inspectable.'
        : 'Connected optimization is unavailable for this plan. Dependencies and readiness remain inspectable.';
    default: {
      const unknown: never = refusal;
      throw new Error(`Unknown schedule refusal: ${JSON.stringify(unknown)}`);
    }
  }
}
