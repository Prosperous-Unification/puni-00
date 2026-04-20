import type { EventLogRepo } from '../repository/event-log';

export function runRetention(
  repo: EventLogRepo,
  opts: { maxPerSubscription: number },
): Promise<number> {
  return repo.pruneBeyond(opts.maxPerSubscription);
}
