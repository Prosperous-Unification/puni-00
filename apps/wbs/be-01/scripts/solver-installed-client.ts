import { createInterface } from 'node:readline';

import {
  connectSolverSupervisor,
  type SolverSupervisorAttempt,
  type SolverSupervisorRequest,
} from '../src/module/solver-supervisor/solver-supervisor.repository';
import {
  type ImageSolverRequest,
  sharedPersonRequest,
  verifyImageSolverResponse,
} from './solver-image-scenario';

export interface InstalledClientOptions {
  readonly unix: string;
  readonly callerId: string;
  readonly scenario: 'baseline' | 'shared-person';
  readonly attemptToken: string;
}
export interface InstalledClientPorts {
  connect(request: SolverSupervisorRequest): Promise<SolverSupervisorAttempt>;
  emit(frame: unknown): void;
  decision(): Promise<string>;
}

/** Pauses the authenticated attempt until the host verifies its exact managed child. */
export async function runInstalledSolverClient(
  options: InstalledClientOptions,
  ports: InstalledClientPorts,
): Promise<{
  type: 'accepted';
  scenario: string;
  attemptToken: string;
  pid: number;
  status: 'feasible';
}> {
  // The committed baseline is trusted build input; the answer is revalidated against this exact request.
  const baseline: unknown =
    options.scenario === 'baseline'
      ? JSON.parse(
          await Bun.file(
            new URL(
              '../../../../libs/wbs/domain/contracts/solver/fixtures/request/valid-quantised-baseline.json',
              import.meta.url,
            ),
          ).text(),
        )
      : null;
  // This cast is bounded by the committed request fixture; the accepted response is independently revalidated below.
  const request =
    options.scenario === 'baseline' ? (baseline as ImageSolverRequest) : sharedPersonRequest();
  const attempt = await ports.connect({
    unix: options.unix,
    callerId: options.callerId,
    attemptToken: options.attemptToken,
    projectId: '11111111-1111-4111-8111-111111111111',
    objective: 'pri',
    childDeadlineAt: Date.now() + 180_000,
    searchWorkers: 2,
    memoryLimitMb: 512,
    request: { ...request },
  });
  const completion = Promise.all([
    new Response(attempt.stdout).text(),
    new Response(attempt.stderr).text(),
    attempt.terminal,
  ]);
  ports.emit({
    type: 'started',
    scenario: options.scenario,
    attemptToken: options.attemptToken,
    callerId: options.callerId,
    pid: attempt.pid,
  });
  const decision = await ports.decision();
  // Proof: host-abort injection must send abort and refuse acceptance, before any bound verdict.
  if (decision !== 'bound') {
    await attempt.verdict('abort');
    await completion;
    throw new Error('installed solver client: host refused child');
  }
  await attempt.verdict('bound');
  const [stdout, stderr, terminal] = await completion;
  // Proof: independent exit/deadline/OOM injections in solver-installed-client.test.ts refuse acceptance.
  if (terminal.exitCode !== 0 || terminal.deadlineKilled || terminal.oomKilled) {
    throw new Error(`installed solver client: unsuccessful terminal: ${stderr}`);
  }
  // Proof: shared overlap injection in solver-installed-client.test.ts reaches the production revalidator.
  verifyImageSolverResponse(request, stdout);
  return {
    type: 'accepted',
    scenario: options.scenario,
    attemptToken: options.attemptToken,
    pid: attempt.pid,
    status: 'feasible',
  };
}

if (import.meta.main) {
  const unix = process.argv.at(2);
  const scenario = process.argv.at(3);
  const attemptToken = process.argv.at(4);
  const callerId = process.env['HOSTNAME'];
  if (
    process.argv.length !== 5 ||
    unix !== '/run/wbs-solver/supervisor.sock' ||
    (scenario !== 'baseline' && scenario !== 'shared-person') ||
    attemptToken === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptToken) ||
    callerId === undefined ||
    !/^[0-9a-f]{12}$/.test(callerId)
  ) {
    throw new Error(
      'installed solver client: expected mounted socket, scenario, UUID token and Docker hostname',
    );
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const decisions = lines[Symbol.asyncIterator]();
  try {
    const receipt = await runInstalledSolverClient(
      { unix, scenario, attemptToken, callerId },
      {
        connect: connectSolverSupervisor,
        emit: (frame) => {
          console.log(JSON.stringify(frame));
        },
        decision: async () => {
          const timer = setTimeout(() => {
            lines.close();
          }, 3_500);
          try {
            const line = await decisions.next();
            return line.done === true ? 'abort' : line.value;
          } finally {
            clearTimeout(timer);
          }
        },
      },
    );
    console.log(JSON.stringify(receipt));
  } finally {
    lines.close();
  }
}
