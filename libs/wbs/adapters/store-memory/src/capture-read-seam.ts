import type { PlanInputReads } from '@wbs/core';

export const CAPTURE_FIRST_READ = 'saved-plan-capture:first-work-package-read' as const;

export interface CaptureFirstReadEvidence {
  readonly workPackageId: string;
  readonly workPackage: PlanInputReads['workPackage'];
}

export interface CaptureReadSeam {
  afterFirstRead(evidence: CaptureFirstReadEvidence): Promise<void>;
}

export const inertMemoryCaptureReadSeam: CaptureReadSeam = {
  afterFirstRead: () => Promise.resolve(),
};
