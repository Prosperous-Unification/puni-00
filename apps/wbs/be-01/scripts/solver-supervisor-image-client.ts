import { connectSolverSupervisor } from '../src/module/solver-supervisor/solver-supervisor.repository';
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

// The bundled baseline fixture is trusted build input; response revalidation checks its
// placement constraints before the image smoke accepts the answer.
const request: ImageSolverRequest =
  requestPath === 'shared-person'
    ? sharedPersonRequest()
    : (recordOf(JSON.parse(await Bun.file(requestPath).text())) as unknown as ImageSolverRequest);
const attempt = await connectSolverSupervisor({
  unix,
  callerId,
  projectId: '11111111-1111-4111-8111-111111111111',
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
verifyImageSolverResponse(request, stdout);
console.log(
  `[solver-image-smoke] supervisor authenticated and published feasible ${requestPath === 'shared-person' ? 'shared-person' : 'baseline'} answer`,
);
