import type { WriteStamp } from '../ports/write-stamp';

/** Catalogue scopes/packages are real empty source rows, not a legacy StepStore plan seed. */
export interface StepCatalogueSeed {
  readonly organizationId: string;
  readonly foreignOrganizationId: string;
  readonly spaceId: string;
  readonly projectId: string;
  readonly siblingProjectId: string;
  readonly foreignProjectId: string;
  readonly workPackageId: string;
  readonly siblingWorkPackageId: string;
  readonly foreignWorkPackageId: string;
  readonly typeId: string;
  readonly secondTypeId: string;
  readonly foreignTypeId: string;
  readonly stamp: WriteStamp;
}

/** Stable actual source-owned empty catalogue fixture, shared by both adapter openers. */
export const STEP_CATALOGUE_SEED: StepCatalogueSeed = {
  organizationId: 'catalogue-org',
  foreignOrganizationId: 'catalogue-foreign-org',
  spaceId: 'catalogue-space',
  projectId: 'catalogue-project',
  siblingProjectId: 'catalogue-sibling-project',
  foreignProjectId: 'catalogue-foreign-project',
  workPackageId: 'catalogue-empty-package',
  siblingWorkPackageId: 'catalogue-sibling-package',
  foreignWorkPackageId: 'catalogue-foreign-package',
  typeId: 'catalogue-type',
  secondTypeId: 'catalogue-second-type',
  foreignTypeId: 'catalogue-foreign-type',
  stamp: { at: 100, by: 'catalogue-author' },
};
