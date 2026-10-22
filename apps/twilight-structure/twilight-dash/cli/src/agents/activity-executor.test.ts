import {
  acceptWorkflowBinding,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import { expect, test } from 'bun:test';

import {
  attemptId,
  decisionId,
  occurrenceId,
  operationKey,
  ownerId,
  runId,
} from '../runs/record-codecs';
import {
  ActivityDispatchError,
  type ExecutorLocator,
  type Preparation,
  snapshotExecutorLocator,
  snapshotPreparation,
  snapshotTurnRequest,
  type TurnRequest,
} from './activity-executor';

function preparation() {
  return {
    version: 1 as const,
    identity: {
      version: 1 as const,
      runId: runId('run'),
      occurrenceId: occurrenceId('occurrence'),
      operationKey: operationKey('operation'),
    },
    attemptId: attemptId('attempt'),
    creationKey: 'creation',
  };
}

function request() {
  return {
    version: 1 as const,
    turnKey: 'turn',
    owner: { ownerId: ownerId('owner'), epoch: 1 },
    cause: { kind: 'decision' as const, decisionId: decisionId('decision') },
    input: 'Hello',
  };
}

function locator() {
  const binding = decodeWorkflowBinding({
    version: 1,
    types: { default: { build: { class: 'tool' } } },
    classes: { tool: { executor: 'tool', command: 'build' } },
  });
  const selected = selectWorkflowActivity(
    acceptWorkflowBinding(checkWorkflowBinding(binding, ['build']), []),
    'change',
    'build',
  );
  const { bindingDigest, requestedType, matchedType, stepCode, className } = selected;
  return {
    version: 1 as const,
    executor: 'api-model' as const,
    executorVersion: '1',
    preparation: preparation(),
    selection: { bindingDigest, requestedType, matchedType, stepCode, className },
    session: {
      version: 1 as const,
      workerId: 'worker',
      sessionId: 'session',
      operationKey: operationKey('operation'),
    },
  };
}

test('preparation snapshot detaches and freezes identity while caller remains mutable', () => {
  const original = preparation();
  const retained = snapshotPreparation(original);
  original.identity.runId = runId('changed');
  original.creationKey = 'changed';
  expect(retained.identity.runId).toBe(runId('run'));
  expect(retained.creationKey).toBe('creation');
  expect(Object.isFrozen(original)).toBe(false);
  expect(Object.isFrozen(retained)).toBe(true);
  expect(Object.isFrozen(retained.identity)).toBe(true);
});

test('turn snapshot detaches nested owner and decision while caller remains mutable', () => {
  const original = request();
  const retained = snapshotTurnRequest(original);
  original.owner.epoch = 2;
  original.cause.decisionId = decisionId('changed');
  original.input = 'changed';
  expect(retained.owner.epoch).toBe(1);
  expect(retained.cause).toEqual({ kind: 'decision', decisionId: decisionId('decision') });
  expect(retained.input).toBe('Hello');
  expect(Object.isFrozen(original.owner)).toBe(false);
  expect(Object.isFrozen(retained.owner)).toBe(true);
  expect(Object.isFrozen(retained.cause)).toBe(true);
});

test('locator snapshot detaches every portable branch and preserves operation identity', () => {
  const original = locator();
  const retained = snapshotExecutorLocator(original);
  original.preparation.identity.operationKey = operationKey('changed');
  original.session.sessionId = 'changed';
  original.selection.className = 'changed';
  expect(retained.preparation.identity.operationKey).toBe(operationKey('operation'));
  expect(retained.session.sessionId).toBe('session');
  expect(retained.selection.className).toBe('tool');
  expect(Object.isFrozen(retained.selection)).toBe(true);
  expect(Object.isFrozen(retained.session)).toBe(true);
});

test('preparation boundary rejects unknown versions fields and malformed identity keys', () => {
  for (const corrupt of [
    { ...preparation(), version: 2 },
    { ...preparation(), extra: true },
    { ...preparation(), creationKey: '' },
    { ...preparation(), creationKey: 'x'.repeat(257) },
    { ...preparation(), attemptId: '' },
    { ...preparation(), identity: { ...preparation().identity, runId: '' } },
    { ...preparation(), identity: { ...preparation().identity, operationKey: 'x'.repeat(257) } },
  ])
    expect(() => snapshotPreparation(corrupt as Preparation)).toThrow();
});

test('turn boundary rejects unknown versions fields unsafe epoch malformed owner decision and turn keys', () => {
  for (const corrupt of [
    { ...request(), version: 2 },
    { ...request(), extra: true },
    { ...request(), turnKey: '' },
    { ...request(), turnKey: 'x'.repeat(257) },
    { ...request(), owner: { ownerId: 'owner', epoch: Number.MAX_SAFE_INTEGER + 1 } },
    { ...request(), owner: { ownerId: 'owner', epoch: 0 } },
    { ...request(), owner: { ownerId: '', epoch: 1 } },
    { ...request(), owner: { ownerId: 'owner', epoch: 1, extra: true } },
    { ...request(), cause: { kind: 'decision', decisionId: '' } },
    { ...request(), cause: { kind: 'initial', extra: true } },
    { ...request(), cause: { kind: 'decision', decisionId: decisionId('decision'), extra: true } },
    { ...request(), input: null },
  ])
    expect(() => snapshotTurnRequest(corrupt as TurnRequest)).toThrow();
  expect(
    snapshotTurnRequest({ ...request(), cause: { kind: 'initial' }, input: '' }).cause,
  ).toEqual({ kind: 'initial' });
});

test('locator boundary rejects unknown shape malformed session selection and operation mismatch', () => {
  for (const corrupt of [
    { ...locator(), version: 2 },
    { ...locator(), extra: true },
    { ...locator(), executor: 'unknown' },
    { ...locator(), executorVersion: '' },
    { ...locator(), selection: { ...locator().selection, bindingDigest: 'invalid' } },
    { ...locator(), selection: { ...locator().selection, className: '' } },
    { ...locator(), selection: { ...locator().selection, requestedType: '' } },
    { ...locator(), selection: { ...locator().selection, matchedType: '' } },
    { ...locator(), selection: { ...locator().selection, stepCode: '' } },
    { ...locator(), selection: { ...locator().selection, extra: true } },
    { ...locator(), session: { ...locator().session, sessionId: '' } },
    { ...locator(), session: { ...locator().session, sessionId: 'x'.repeat(257) } },
    { ...locator(), session: { ...locator().session, workerId: '' } },
    { ...locator(), session: { ...locator().session, operationKey: operationKey('other') } },
  ])
    expect(() => snapshotExecutorLocator(corrupt as ExecutorLocator)).toThrow();
});

test('dispatch error keeps detached turn correlation and original cause with safe message', () => {
  const identity = {
    locator: locator(),
    turnKey: 'turn',
    owner: { ownerId: ownerId('owner'), epoch: 1 },
  };
  const cause = new Error('secret provider details');
  const failure = new ActivityDispatchError(identity, cause);
  identity.locator.session.sessionId = 'changed';
  identity.owner.epoch = 2;
  identity.turnKey = 'changed';
  expect(failure.cause).toBe(cause);
  expect(failure.identity.locator.session.sessionId).toBe('session');
  expect(failure.identity.turnKey).toBe('turn');
  expect(failure.identity.owner.epoch).toBe(1);
  expect(Object.isFrozen(failure.identity)).toBe(true);
  expect(Object.isFrozen(failure.identity.owner)).toBe(true);
  expect(failure.message).not.toContain('secret');
  expect(failure.message).toBe(new ActivityDispatchError(failure.identity, 'different').message);
});

test('dispatch error refuses corrupted correlation keys and owner epochs', () => {
  for (const corrupt of [
    { locator: locator(), turnKey: '', owner: { ownerId: ownerId('owner'), epoch: 1 } },
    {
      locator: locator(),
      turnKey: 'turn',
      owner: { ownerId: ownerId('owner'), epoch: Number.MAX_SAFE_INTEGER + 1 },
    },
  ])
    expect(() => {
      new ActivityDispatchError(corrupt, new Error('cause'));
    }).toThrow();
});
