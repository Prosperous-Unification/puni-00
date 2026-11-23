import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { httpWorkPackageApi } from '@/lib/wbs-api';
import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import { refusingApi } from '@/testing/refusing-api';

import { StepsPanel } from './steps-panel';
import { INITIAL_HIDDEN_COLUMNS } from './table-frame';

afterEach(cleanup);
const dev = {
  id: 'dev',
  name: 'Development',
  estimateUnit: 'workdays' as const,
  allowancePercent: 0,
};
function mount(overrides: Partial<Parameters<typeof StepsPanel>[0]> = {}) {
  const onDirtyChange = vi.fn();
  const setStepAllowance = vi.fn(() => Promise.resolve({ ...dev, allowancePercent: 12.34 }));
  const properties = {
    steps: [dev],
    estimateCounts: { dev: 0 },
    setStepUnit: vi.fn(() => Promise.resolve(dev)),
    setStepAllowance,
    frameState: {
      hasAnyNotBefore: false,
      deepestDepth: 0,
      numberingFrozen: false,
      widestDependencyChip: null,
      waitsForSeveral: false,
    },
    hiddenColumnIds: INITIAL_HIDDEN_COLUMNS,
    depReach: 'whole-item' as const,
    setDepReach: vi.fn(() => Promise.resolve()),
    onChanged: vi.fn(() => Promise.resolve()),
    onDirtyChange,
    ...overrides,
  };
  render(<StepsPanel {...properties} />);
  return { properties, onDirtyChange, setStepAllowance };
}

it('the real package facade and its bound commands expose values without retired definition methods', () => {
  const api = httpWorkPackageApi('token');
  const commands = createPlanCommands({ workPackageId: 'package-a', routes: api });
  for (const target of [api, commands])
    for (const key of ['addStep', 'renameStep', 'removeStep'])
      expect(Reflect.get(target, key)).toBeUndefined();
  expect(typeof api.setStepAllowance).toBe('function');
  expect(typeof commands.setStepUnit).toBe('function');
});
it('the fake package facade exposes no retired definition methods and still refuses an unstated supported method', async () => {
  const api = fakeWorkPackageApi();
  for (const key of ['addStep', 'renameStep', 'removeStep'])
    expect(Reflect.get(api, key)).toBeUndefined();
  expect(Reflect.get(api, Symbol.for('unsupported fixture member'))).toBeUndefined();
  expect(await Promise.resolve(api)).toBe(api);
  await expect(refusingApi({}).setStepUnit('package-a', 'dev', 'minutes')).rejects.toThrow(
    'api.setStepUnit is not one this test answers',
  );
});
it('package steps show immutable names, editable local values and scoped-settings guidance', () => {
  mount();
  expect(screen.queryByRole('textbox', { name: 'Development' })).toBeNull();
  expect(screen.getByText('Development')).toBeDefined();
  expect(
    screen.queryByRole('button', { name: /Add step|Remove Development|Rename Development/ }),
  ).toBeNull();
  expect(screen.queryByLabelText('New step')).toBeNull();
  expect(
    screen.getByText(
      /Names and applicability are managed in organization, space and project settings/,
    ),
  ).toBeDefined();
  expect(screen.getByRole('radio', { name: 'Development minutes' })).toBeDefined();
  expect(screen.getByLabelText('Development allowance (%)')).toBeDefined();
});
it('an empty package has no local definition creation control', () => {
  mount({ steps: [], estimateCounts: {} });
  expect(screen.queryByLabelText('New step')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add step' })).toBeNull();
  expect(screen.getByText(/No steps apply to this work package/)).toBeDefined();
});
it('a local allowance draft remains dirty and Escape restores the actual package value', () => {
  const { onDirtyChange, setStepAllowance } = mount();
  const field = screen.getByLabelText('Development allowance (%)');
  fireEvent.change(field, { target: { value: '12.34' } });
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field).toHaveProperty('value', '0');
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(setStepAllowance).not.toHaveBeenCalled();
});
it('a pending allowance keeps its focus and sends one write across repeated Enter and blur', async () => {
  let finish: (() => void) | undefined;
  const held = new Promise<typeof dev>((resolve) => {
    finish = () => {
      resolve(dev);
    };
  });
  const setStepAllowance = vi.fn(() => held);
  mount({ setStepAllowance });
  const field = screen.getByLabelText<HTMLInputElement>('Development allowance (%)');
  field.focus();
  fireEvent.change(field, { target: { value: '12.34' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  fireEvent.keyDown(field, { key: 'Enter' });
  fireEvent.blur(field);
  expect(setStepAllowance).toHaveBeenCalledExactlyOnceWith('dev', 12.34);
  expect(field.readOnly).toBe(true);
  expect(field.disabled).toBe(false);
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field).toHaveProperty('value', '12.34');
  if (finish === undefined) throw Error('Missing pending allowance completion');
  const complete = finish;
  await act(async () => {
    complete();
    await held;
  });
  await waitFor(() => {
    expect(field.readOnly).toBe(false);
  });
});
