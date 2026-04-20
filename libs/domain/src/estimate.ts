import { type } from '@wbs/validation';

export const Estimate = type({
  wbsItemId: 'string',
  hours: 'number>=0',
  confidence: "'low'|'medium'|'high'",
});
export type Estimate = typeof Estimate.infer;
