import type { Hold } from '@wbs/domain';

/**
 * The work item holds this release reads, for the production swap guard
 * (`holdKindsCommand` in tool-remote-scripts). None yet: this release neither
 * stores nor reads `work_item.hold`, so it must refuse a database holding one.
 * The storage slice of `add-work-item-statuses` prints every member of `HOLDS`.
 */
const READABLE_HOLDS: readonly Hold[] = [];

console.log(JSON.stringify(READABLE_HOLDS));
