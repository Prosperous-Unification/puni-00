import type { DevelopmentExecutableIO } from '@puni/dash/runtime';

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
  readonly developmentIO?: DevelopmentExecutableIO;
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
      if (command.request.command === 'browser' || command.request.command === 'performance') {
        const request = { ...command.request };
        const retained = {
          ...context,
          installation: { ...context.installation },
          lookup: { ...context.lookup },
          environment: { ...context.environment },
        };
        const runtime = await import('./packaging/test-levels');
        return request.command === 'browser'
          ? await runtime.runInstalledBrowser(request, retained)
          : await runtime.runInstalledPerformance(request, retained);
      }
      if (command.request.command === 'dev-env') {
        const request = { ...command.request };
        const retained = { ...context, installation: { ...context.installation },
          environment: { ...context.environment },
          ...(context.developmentIO === undefined ? {} : { developmentIO: { ...context.developmentIO } }),
        };
        const { runInstalledForge } = await import('./packaging/forge');
        return await runInstalledForge(request, retained);
      }
      if (command.request.command === 'dev') {
        const request = { ...command.request };
        const retained = {
          ...context,
          installation: { ...context.installation },
          lookup: { ...context.lookup },
          environment: { ...context.environment },
        };
        const executableIO =
          retained.developmentIO === undefined ? undefined : { ...retained.developmentIO };
        const { runDevelopment } = await import('@puni/dash/runtime');
        return await runDevelopment(request, {
          runtime: retained.runtime,
          callerDirectory: retained.callerDirectory,
          environment: retained.environment,
          stdout: retained.stdout,
          stderr: retained.stderr,
          ...(executableIO === undefined ? {} : { executableIO }),
          preflight: async (output) => {
            const { runDevPorts } = await import('./development/ports');
            return await runDevPorts(
              { command: 'dev-ports', action: 'check', repository: request.repository, pairs: [] },
              { ...retained, stdout: output.stdout, stderr: output.stderr },
            );
          },
        });
      }
      if (command.request.command === 'dev-ports') {
        const request = { ...command.request, pairs: [...command.request.pairs] };
        const retained = {
          ...context,
          lookup: { ...context.lookup },
          environment: { ...context.environment },
        };
        const { runDevPorts } = await import('./development/ports');
        return await runDevPorts(request, retained);
      }
      if (command.request.command === 'install-puni') {
        const request = { ...command.request };
        const retained = {
          ...context,
          installation: { ...context.installation },
          lookup: { ...context.lookup },
          environment: { ...context.environment },
        };
        const { runInstallPuni } = await import('./packaging/install');
        return await runInstallPuni(request, retained);
      }
      const { executeRequest, monotonicClock, wallClock } = await import('@puni/dash/runtime');
      // Proof: root-dash-status; `dash forwards actual native ops refusal status through the typed root` failed under its recorded production fault and passed after restoration.
      return await executeRequest(command.request, {
        clock: wallClock(),
        monotonic: monotonicClock(),
        send: (input, init) => fetch(input, init),
        sleep: (milliseconds) => Bun.sleep(milliseconds),
        callerDirectory: context.callerDirectory,
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
      if (command.request.command === 'audit-push')
        // Proof: selecting runInstalledLint instead failed
        // `burokrat forwards typed audit-push once without a caller required override: invalid`
        // on child exit 1 (expected 0); raw retained `unexpected root diagnostic`.
        return await runtime.runInstalledPushAudit(command.request, {
          installedDirectory: context.installation.directory,
          callerDirectory: context.callerDirectory,
          lookup: context.lookup,
          activationRoot: context.environment['TOOL_WIKI_ACTIVATION_ROOT'],
          trustedNodeModules: context.environment['TOOL_WIKI_TRUSTED_NODE_MODULES'],
          scratchDirectory: context.temporaryDirectory,
          launch,
        });
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
          // Proof: restoring === '1' coercion made runtime-root's b/true refusal return 37
          // instead of 64 after its valid 0/verdict 37 stage-reset prerequisites (N1).
          required: context.environment['TOOL_WIKI_REQUIRE_CERTIFIED'],
          scratchDirectory: context.temporaryDirectory,
          launch,
        });
      if (
        // Proof: c28-root-preparation-route-normal; injected fault failed `actual root owns current prepare-activation through archive completion`; restoration passed.
        // Proof: c28-root-preparation-path-owner; Reporter/sink-selection ordering only: early PATH refusal bypasses the preparation-owned Bun writer. Closed/stalled lifetime controls may still pass because the root executable exits; no independent early-PATH lifetime failure is claimed.; injected fault failed `actual root enters the bounded preparation reporter before missing PATH under stalled stderr`; restoration passed.
        command.request.command === 'prepare-activation' ||
        // Proof: c28-root-preparation-route-relocation; injected fault failed `actual root owns current prepare-relocation-activation through archive completion`; restoration passed.
        command.request.command === 'prepare-relocation-activation'
      )
        return await runtime.runInstalledPreparation(command.request, {
          installedDirectory: context.installation.directory,
          callerDirectory: context.callerDirectory,
          lookup: context.lookup,
          launch,
        });
      const path = context.lookup.path;
      // Proof: root-ordinary-path-refusal; `gives an absent ordinary trusted PATH its explicit refusal before installed input reads` failed under its recorded production fault and passed after restoration.
      if (path === undefined) throw new Error('trusted executable PATH is required for Burokrat');
      // Proof: c28-root-ordinary-current-route; injected fault failed `burokrat runs actual ordinary installed template requests through the built root with current PUNI toolkit2` and 2 additional named controls; restoration passed.
      return runtime.executeCurrentRequest(command.request, {
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
