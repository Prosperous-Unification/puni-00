import type { Command } from './cli-parser';
import { createLaunch } from './startup';

/** Independently selected installation and lookup authority, captured before provider dispatch. */
export interface Context {
  readonly installation: { readonly directory: string; readonly entrypoint: string };
  readonly lookup: { readonly directory: string; readonly path: string | undefined };
  readonly callerDirectory: string;
  readonly runtime: string;
  readonly temporaryDirectory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly stdout: (chunk: string | Uint8Array) => void;
  readonly stderr: (chunk: string | Uint8Array) => void;
}

/**
 * Load only the selected provider runtime and execute its already parsed request. Ordinary
 * Burokrat verifies the installed package/toolkit and uses its isolated typed child; lint
 * retains the dedicated owned selected-activation launcher. Missing assets refuse rather
 * than searching a checkout or source validator. Discovery never calls this function.
 */
export async function executeCommand(command: Command, context: Context): Promise<number> {
  switch (command.tool) {
    case 'navigator': {
      // Proof: root-navigator-selection; `navigator executes actual planning files through the typed root` failed under its recorded production fault and passed after restoration.
      const { executeRequest } = await import('@puni/navigator/runtime');
      // Proof: root-navigator-lf; `navigator executes actual planning files through the typed root` failed under its recorded production fault and passed after restoration.
      context.stdout((await executeRequest(command.request)) + '\n');
      return 0;
    }
    case 'dash': {
      const { executeRequest, monotonicClock, wallClock } = await import('@puni/dash/runtime');
      // Proof: root-dash-status; `dash forwards actual native ops refusal status through the typed root` failed under its recorded production fault and passed after restoration.
      return await executeRequest(command.request, {
        clock: wallClock(),
        monotonic: monotonicClock(),
        send: (input, init) => fetch(input, init),
        sleep: (milliseconds) => Bun.sleep(milliseconds),
        environment: context.environment,
        write: (text) => {
          context.stdout(text);
        },
        helperPrefix: createLaunch(context.runtime, context.installation.entrypoint),
      });
    }
    case 'burokrat': {
      // Proof: root-burokrat-selection; `burokrat runs actual ordinary installed template requests through the built root with toolkit1` failed under its recorded production fault and passed after restoration.
      const runtime = await import('@puni/burokrat/runtime');
      const launch = (entrypoint: string) => createLaunch(context.runtime, entrypoint);
      // Proof: root-lint-dedicated-route; `burokrat runs actual selected installed lint through the built root with toolkit2` failed under its recorded production fault and passed after restoration.
      // Proof: root-lint-path-owner; `reports absent root lint PATH inside its bounded executable reporter` failed on the owned diagnostic prefix under an early root refusal and passed after restoration; this fault does not prove closed/stalled lifetime.
      if (command.request.command === 'lint')
        return await runtime.runInstalledLint(command.request, {
          installedDirectory: context.installation.directory,
          // Proof: root-lint-caller; `keeps required installed lint admission78 and caller-relative activation operands through the root` failed under its recorded production fault and passed after restoration.
          callerDirectory: context.callerDirectory,
          lookup: context.lookup,
          // Proof: root-lint-activation; `keeps required installed lint admission78 and caller-relative activation operands through the root` failed under its recorded production fault and passed after restoration.
          activationRoot: context.environment['TOOL_WIKI_ACTIVATION_ROOT'],
          trustedNodeModules: context.environment['TOOL_WIKI_TRUSTED_NODE_MODULES'],
          // Proof: root-lint-required; `keeps required installed lint admission78 and caller-relative activation operands through the root` failed under its recorded production fault and passed after restoration.
          required: context.environment['TOOL_WIKI_REQUIRE_CERTIFIED'] === '1',
          scratchDirectory: context.temporaryDirectory,
          launch,
        });
      const path = context.lookup.path;
      // Proof: root-ordinary-path-refusal; `gives an absent ordinary trusted PATH its explicit refusal before installed input reads` failed under its recorded production fault and passed after restoration.
      if (path === undefined) throw new Error('trusted executable PATH is required for Burokrat');
      return await runtime.executeRequest(command.request, {
        installedDirectory: context.installation.directory,
        callerDirectory: context.callerDirectory,
        // Proof: root-ordinary-lookup; `freezes ordinary root Git lookup before candidate and toolkit cwd changes` failed under its recorded production fault and passed after restoration.
        path: runtime.freezePath(path, context.lookup.directory),
        ciTrustedBinding: context.environment['TOOL_WIKI_CI_TRUSTED_BINDING'],
        launch,
        stdout: context.stdout,
        stderr: context.stderr,
      });
    }
  }
}
