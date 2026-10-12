/**
 * Every way this command refuses to prepare a relocation activation, in the order the
 * preparation reaches them. Four codes cover more ground than the design named for them:
 * `R3` is a candidate that is not the committed tree the receipts will claim, so it refuses a
 * dirty checkout and equally a `--work` or `--destination` inside the candidate repository;
 * `R16` is a check that did not fully measure the candidate, so it refuses a non-zero exit and
 * equally a receipt carrying skips, which `validateEvidence` would reject later and dearer;
 * `R19` is a build environment that is not the candidate's own, so it refuses an operator Bun
 * other than the candidate's `.bun-version` ({@link assertPinnedRuntime}) and equally a trusted
 * node module that is absent, unreadable or a symlink rather than a real directory (the CLI's
 * `packageDirectory`);
 * `R21` requires the lineage source to already stratify every review the candidate policy names,
 * because the risk stratum is copied, never invented: the base activation's authority in base mode,
 * the operator's audit strata file in toolkit mode.
 */
export type RelocationRefusalCode =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'
  | 'R14'
  | 'R15'
  | 'R16'
  | 'R17'
  | 'R18'
  | 'R19'
  | 'R20'
  | 'R21';

/** A named refusal to prepare an activation; the message always names the offending id or path. */
export class RelocationRefusal extends Error {
  constructor(
    readonly code: RelocationRefusalCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RelocationRefusal';
  }
}

export function refuse(code: RelocationRefusalCode, message: string): never {
  throw new RelocationRefusal(code, message);
}
