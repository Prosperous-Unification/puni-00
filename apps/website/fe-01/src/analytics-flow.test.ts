import type { Analytics } from '@website/analytics';
import { expect, test } from 'bun:test';

import { createMilestones } from './analytics-flow';

test('observed transitions advance while dropped and confirmations never backfill', () => {
  const events: unknown[] = [];
  let ready = false;
  const controller = {
    dispatch: (event: unknown) => {
      if (ready) events.push(event);
      return ready ? 'sent' : 'dropped';
    },
    dispatchLead: (receipt: string, event: unknown) => {
      if (ready) events.push(event);
      return ready ? 'sent' : 'dropped';
    },
  } as Analytics;
  const milestones = createMilestones(controller);
  const brief = { name: 'brief_view', route: 'manual', starting_choice: 'typed' } as const;
  const lead = { name: 'generate_lead', route: 'manual', funnel_version: '1' } as const;
  milestones.observe('brief:one', brief);
  milestones.confirm('receipt-one', lead);
  ready = true;
  milestones.observe('brief:one', brief);
  milestones.confirm('receipt-one', lead);
  expect(events).toEqual([]);
  milestones.observe('brief:two', brief);
  milestones.confirm('receipt-two', lead);
  milestones.confirm('receipt-two', lead);
  expect(events).toEqual([brief, lead]);
  expect(JSON.stringify(events)).not.toContain('receipt');
});
