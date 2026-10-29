export const GATEWAY_RESTORATION_CASES = [
  {
    kind: 'gateway-ready',
    name: 'solver-backend gateway retains original authority through ready',
  },
  {
    kind: 'gateway-record-missing',
    name: 'solver-backend gateway refuses missing backend ready record and terminal repair',
  },
  {
    kind: 'gateway-record-unreadable',
    name: 'solver-backend gateway refuses unreadable backend ready record',
  },
  {
    kind: 'gateway-record-changed',
    name: 'solver-backend gateway refuses backend record rebased through a public result',
  },
  {
    kind: 'gateway-record-same-byte',
    name: 'solver-backend gateway refuses same-byte backend ready replacement',
  },
  {
    kind: 'gateway-released',
    name: 'solver-backend gateway refuses released original backend phase',
  },
  { kind: 'gateway-parked', name: 'solver-backend gateway refuses parked-only backend phase' },
  {
    kind: 'gateway-backend-drift',
    name: 'solver-backend gateway refuses backend process drift during health',
  },
  {
    kind: 'gateway-solver-drift',
    name: 'solver-backend gateway refuses solver process drift during health',
  },
  { kind: 'gateway-opener', name: 'solver-backend gateway refuses a gateway database opener' },
  { kind: 'gateway-dev-opener', name: 'solver-backend gateway refuses a dev database opener' },
  {
    kind: 'gateway-foreign-opener',
    name: 'solver-backend gateway refuses a foreign database opener',
  },
  {
    kind: 'gateway-late-source',
    name: 'solver-backend gateway refuses source drift after final observation',
  },
  {
    kind: 'gateway-late-fence',
    name: 'solver-backend gateway refuses fence drift after final observation',
  },
  {
    kind: 'gateway-late-process',
    name: 'solver-backend gateway refuses gateway process drift after authority',
  },
] as const;
export type GatewayRestorationCase = (typeof GATEWAY_RESTORATION_CASES)[number]['kind'];
