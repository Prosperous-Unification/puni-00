import { type } from '@wbs/validation';

export const WbsItemId = type('/^[0-9A-HJKMNP-TV-Z]{9,26}$/');
export type WbsItemId = typeof WbsItemId.infer;

export const WbsItem = type({
  id: WbsItemId,
  title: 'string>0',
  estimateHours: 'number>=0',
  'parentId?': WbsItemId,
});
export type WbsItem = typeof WbsItem.infer;
