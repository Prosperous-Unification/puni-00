/** Lab-derived names. Every one embeds the lab ID; a name alone establishes no creation ownership. */
export interface K3dLabNames {
  readonly platform: string;
  readonly workers: string;
  readonly registry: string;
  readonly network: string;
}

/** Derive every lab resource name from the same lab identity used by direct creation receipts. */
export function labNamesOf(labId: string): K3dLabNames {
  return {
    platform: `puni-${labId}-platform`,
    workers: `puni-${labId}-workers`,
    registry: `puni-${labId}-registry`,
    network: `puni-${labId}`,
  };
}
