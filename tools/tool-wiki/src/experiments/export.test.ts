import { describe, expect, test } from 'bun:test';

import { accountTrial } from './accounting';
import { trialJournal } from './accounting.test';
import { exportTrialEvidence } from './export';

describe('portable experiment export', () => {
  test('supports independent recomputation from JSONL and CSV without tool-wiki code', () => {
    const report = accountTrial(trialJournal());
    const exported = exportTrialEvidence([report]);
    const observations = exported.jsonl
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const outcomes = observations.filter(({ observationKind }) => observationKind === 'outcome');
    const elapsed = observations.filter(({ observationKind }) => observationKind === 'elapsed');
    const invocations = observations.filter(
      ({ observationKind }) => observationKind === 'invocation',
    );
    const allocations = observations.filter(
      ({ observationKind }) => observationKind === 'allocation',
    );
    const acceptedCount = outcomes.filter(({ status }) => status === 'accepted').length;
    const phaseElapsedMs = elapsed.reduce(
      (total, observation) => total + Number(observation['elapsedMs']),
      0,
    );
    const chargedAmountMicros = [...invocations, ...allocations].reduce(
      (total, observation) => total + Number(observation['chargedAmountMicros']),
      0,
    );

    expect(acceptedCount).toBe(1);
    expect(phaseElapsedMs).toBe(150_000);
    expect(chargedAmountMicros).toBe(375);
    expect(exported.outcomesCsv).toContain(
      '"trial.fixture.1","outcome.alpha","Alpha, accepted once","accepted",2,0',
    );
    expect(exported.trialsCsv).toContain(
      '"trial.fixture.1","experiment.fixture.v1","corpus.fixture.v1",2,"censored",1,2,600000,1200000,"USD:375"',
    );
  });

  test('is deterministic across report input order', () => {
    const first = accountTrial(trialJournal());
    const secondJournal = trialJournal();
    secondJournal.trialId = 'trial.fixture.2';
    secondJournal.repeat = 2;
    secondJournal.sessions.forEach((session) => {
      session.sessionId = `${session.sessionId}.second`;
    });
    secondJournal.attempts.forEach((attempt) => {
      attempt.sessionId = `${attempt.sessionId}.second`;
    });
    secondJournal.elapsedReceipts.forEach((receipt) => {
      receipt.trialId = secondJournal.trialId;
    });
    secondJournal.allocationReceipts.forEach((receipt) => {
      receipt.trialId = secondJournal.trialId;
    });
    const second = accountTrial(secondJournal);

    expect(exportTrialEvidence([second, first])).toEqual(exportTrialEvidence([first, second]));
  });

  test('refuses an internally inconsistent report before export', () => {
    const inflated = accountTrial(trialJournal());
    inflated.acceptedOutcomeCount = 2;
    const unprovenAcceptance = accountTrial(trialJournal());
    Reflect.deleteProperty(unprovenAcceptance.outcomes[0], 'acceptanceArtifact');

    expect(() => exportTrialEvidence([inflated])).toThrow('accepted outcome accounting');
    expect(() => exportTrialEvidence([unprovenAcceptance])).toThrow('acceptanceArtifact');
  });
});
