import { HOLDS } from '@wbs/domain';

/**
 * The work item holds this release reads, for the production swap guard
 * (`holdKindsCommand` in tool-remote-scripts). A release without this CLI
 * reads none, so the swap refuses it over any stored hold.
 */
console.log(JSON.stringify(HOLDS));
