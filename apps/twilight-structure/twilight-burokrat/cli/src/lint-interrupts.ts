import { createInterrupts } from '@shared/bun-output';
export type {
  Interrupt as LintInterrupt,
  Interrupts as LintInterrupts,
  SubscribeInterrupts as SubscribeLintInterrupts,
} from '@shared/bun-output';

/** Preserve lint's native signal and parent-control API over the shared first-reason broker. */
export function createLintInterrupts() {
  return createInterrupts('lint');
}
