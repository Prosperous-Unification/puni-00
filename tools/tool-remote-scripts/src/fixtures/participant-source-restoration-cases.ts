export const PARTICIPANT_POLICY_CASES = [
  {
    kind: 'policy-released',
    name: 'participant policy restoration refuses released original source-ready context',
  },
  {
    kind: 'policy-name',
    name: 'participant policy restoration refuses wrong original policy name',
  },
  {
    kind: 'policy-count',
    name: 'participant policy restoration refuses wrong original retry count',
  },
  {
    kind: 'policy-pid',
    name: 'participant policy restoration refuses process drift after exact update',
  },
  {
    kind: 'policy-listener',
    name: 'participant policy restoration refuses listener drift after final policy readback',
  },
  {
    kind: 'policy-readback-fence',
    name: 'participant policy restoration refuses fence loss after first policy readback before later intent',
  },
  {
    kind: 'policy-published-record',
    name: 'participant policy restoration refuses late record drift after actual restored publication',
  },
  {
    kind: 'policy-ready',
    name: 'participant policy restoration retains original policies and whole bindings',
  },
] as const;

export const INHERITED_SOURCE_CASES = [
  { kind: 'ready', name: 'source restoration retains original gateway authority through ready' },
  {
    kind: 'admission',
    name: 'source restoration refuses absent and copied phases before genuine continuation',
  },
  { kind: 'released', name: 'source restoration refuses released original context' },
  {
    kind: 'record-missing',
    name: 'source restoration refuses missing gateway record and terminal repair',
  },
  { kind: 'record-unreadable', name: 'source restoration refuses unreadable gateway record' },
  {
    kind: 'record-replacement',
    name: 'source restoration refuses same-byte gateway record replacement',
  },
  {
    kind: 'record-rebased',
    name: 'source restoration refuses gateway record rebased through public summary',
  },
  { kind: 'dev-gateway', name: 'source restoration refuses dev gateway database opener' },
  { kind: 'dev-mcp', name: 'source restoration refuses dev MCP database opener' },
  { kind: 'dev-frontend', name: 'source restoration refuses dev frontend database opener' },
  { kind: 'dev-helper', name: 'source restoration refuses dev Nx helper database opener' },
  { kind: 'dev-foreign', name: 'source restoration refuses foreign dev database opener' },
  { kind: 'dev-ticks', name: 'source restoration refuses changed dev backend start ticks' },
  { kind: 'dev-executable', name: 'source restoration refuses null dev backend executable' },
  { kind: 'prod-source', name: 'source restoration refuses source backend as prod opener' },
  { kind: 'backend-drift', name: 'source restoration refuses backend drift during source HTTP' },
  { kind: 'gateway-drift', name: 'source restoration refuses gateway drift during source HTTP' },
  { kind: 'solver-drift', name: 'source restoration refuses solver drift during source HTTP' },
  {
    kind: 'source-after-authority',
    name: 'source restoration refuses source drift after authority return',
  },
  {
    kind: 'ready-missing',
    name: 'source restoration refuses missing actual source ready publication',
  },
  {
    kind: 'late-fence',
    name: 'source restoration refuses late fence drift after final source observation',
  },
  {
    kind: 'selected',
    name: 'source restoration refuses wrong selected source before intent and start',
  },
  {
    kind: 'listener-after-ready',
    name: 'source restoration refuses listener replacement after actual ready publication',
  },
] as const;

export const SOURCE_RESTORATION_CASES = [
  ...PARTICIPANT_POLICY_CASES,
  ...INHERITED_SOURCE_CASES,
] as const;
export type SourceRestorationCase = (typeof SOURCE_RESTORATION_CASES)[number]['kind'];
