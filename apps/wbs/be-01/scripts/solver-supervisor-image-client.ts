import { connectSolverSupervisor } from '../src/module/solver-supervisor/solver-supervisor.repository';
import {
  connectedImageScenario,
  verifyConnectedImageResponse,
} from './connected-solver-image-scenario';
import {
  type ImageSolverRequest,
  sharedPersonRequest,
  verifyImageSolverResponse,
} from './solver-image-scenario';

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('solver supervisor image smoke: request fixture is not an object');
  }
  return { ...value };
}

const unix = process.argv.at(2);
const requestPath = process.argv.at(3);
const attemptToken = process.argv.at(4);
if (unix === undefined || requestPath === undefined || attemptToken === undefined) {
  throw new Error('solver supervisor image smoke: expected socket, request, and attempt token');
}
const callerId = process.env['HOSTNAME'];
if (callerId === undefined || !/^[0-9a-f]{12}$/.test(callerId)) {
  throw new Error('solver supervisor image smoke: caller hostname is not a 12-hex Docker id');
}

/** Keep connected validation paired with the exact captured stage sent to the child. */
type ImageScenario =
  | { readonly kind: 'local'; readonly request: ImageSolverRequest }
  | { readonly kind: 'connected'; readonly captured: ReturnType<typeof connectedImageScenario> };

async function readScenario(selector: string): Promise<ImageScenario> {
  if (selector === 'connected-feasible' || selector === 'connected-fractional') {
    return { kind: 'connected', captured: connectedImageScenario(selector) };
  }
  if (selector === 'shared-person') return { kind: 'local', request: sharedPersonRequest() };
  // The bundled baseline is trusted image input; its placement is independently revalidated.
  const request = recordOf(
    JSON.parse(await Bun.file(selector).text()),
  ) as unknown as ImageSolverRequest;
  return { kind: 'local', request };
}

const scenario = await readScenario(requestPath);
const request = scenario.kind === 'connected' ? scenario.captured.request : scenario.request;
const attempt = await connectSolverSupervisor({
  unix,
  callerId,
  projectId:
    scenario.kind === 'connected'
      ? scenario.captured.stage.projectId
      : '11111111-1111-4111-8111-111111111111',
  objective: 'pri',
  attemptToken,
  // The deadline also covers Docker create/start on contended shared runners.
  childDeadlineAt: Date.now() + 180_000,
  searchWorkers: 2,
  memoryLimitMb: 512,
  request: { ...request },
});
await attempt.verdict('bound');

const [stdout, stderr, terminal] = await Promise.all([
  new Response(attempt.stdout).text(),
  new Response(attempt.stderr).text(),
  attempt.terminal,
]);
if (terminal.exitCode !== 0 || terminal.deadlineKilled || terminal.oomKilled) {
  throw new Error(
    `solver supervisor image smoke: launcher classified internal-error (${String(terminal.exitCode)}): ${stderr.trim()}`,
  );
}
if (scenario.kind === 'connected') verifyConnectedImageResponse(scenario.captured, stdout);
else verifyImageSolverResponse(scenario.request, stdout);
console.log(`[solver-image-smoke] supervisor authenticated and accepted ${requestPath}`);
