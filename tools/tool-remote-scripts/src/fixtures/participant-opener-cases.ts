export const PARTICIPANT_OPENER_CASES = [
  'exact-prod',
  'dev',
  'init-pid',
  'foreign-pid',
  'start-time',
  'uid',
  'cgroup',
  'exe-device',
  'exe-inode',
  'exe-sha',
  'exe-null',
  'prestart',
  'late-before-ready',
  'late-final-return',
] as const;
export type ParticipantOpenerCase = (typeof PARTICIPANT_OPENER_CASES)[number];
