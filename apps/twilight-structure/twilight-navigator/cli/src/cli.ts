import { runAdmitProgress } from './admit-progress';
import type { NavigatorCommand, NavigatorRequest } from './cli-parser';
import { runPlanReference } from './plan-reference';
import { runReceiptToCommands } from './receipt-to-commands';

type Handlers = {
  readonly [Name in NavigatorCommand['command']]: (
    request: NavigatorRequest<Name>,
  ) => Promise<string>;
};

/** One handler per command the parser accepts; each returns the line to print. */
export const navigatorHandlers: Handlers = {
  'admit-progress': runAdmitProgress,
  'plan-reference': runPlanReference,
  'receipt-to-commands': runReceiptToCommands,
};

/**
 * Dispatches one parsed `twin` command to {@link navigatorHandlers} and returns the line to
 * print. The command line was refused, if at all, by `readNavigatorInvocation` before any file
 * is read.
 */
export async function runNavigator(command: NavigatorCommand): Promise<string> {
  switch (command.command) {
    case 'admit-progress':
      return await navigatorHandlers['admit-progress'](command);
    case 'plan-reference':
      return await navigatorHandlers['plan-reference'](command);
    case 'receipt-to-commands':
      return await navigatorHandlers['receipt-to-commands'](command);
  }
}
