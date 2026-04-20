import { type } from '@wbs/validation';

export const Dependency = type({
  from: 'string',
  to: 'string',
  kind: "'finish-to-start'|'start-to-start'|'finish-to-finish'|'start-to-finish'",
});
export type Dependency = typeof Dependency.infer;
