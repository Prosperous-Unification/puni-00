import {
  WorkItemService,
  type WorkItemServiceOptions,
} from '@wbs/core/module/work-item/work-item.resource';
import { AuthService, type AuthServiceOptions } from '@wbs/core/service/auth.service';

export function constructWithoutClocks(
  workItemOptions: WorkItemServiceOptions,
  authOptions: AuthServiceOptions,
): void {
  const { clock: _workItemClock, ...workItemWithoutClock } = workItemOptions;
  const { clock: _authClock, ...authWithoutClock } = authOptions;

  // Proof: removing these expectations failed be-01:typecheck twice on TS2741,
  // with clock missing from WorkItemServiceOptions and AuthServiceOptions
  // (2026-09-09).
  // @ts-expect-error WorkItemService requires the composition root's clock.
  new WorkItemService(workItemWithoutClock);
  // @ts-expect-error AuthService requires the composition root's clock.
  new AuthService(authWithoutClock);
}
