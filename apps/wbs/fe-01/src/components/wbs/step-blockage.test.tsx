import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { stepBlockageOf, StepBlockageSection } from './step-blockage';
import type { TreeRow } from './wbs-rows';
const leaf = (fields: Partial<TreeRow>): TreeRow =>
  ({
    id: 'leaf',
    number: '020',
    name: 'Payment',
    rolledUp: false,
    progress: { dev: 'in_progress' },
    nodeReadings: { dev: 'blocked' },
    blockages: {},
    blockageCauses: { dev: [{ kind: 'step', nodeId: 'leaf.dev' }] },
    ...fields,
  }) as TreeRow;
const labels = new Map([
  ['root.dev', '010.dev · Checkout · Dev'],
  ['leaf.dev', '020.dev · Payment · Dev'],
]);
describe('step blockage details', () => {
  it('distinguishes a direct statement and retains underlying progress', () => {
    render(
      <StepBlockageSection
        blockage={stepBlockageOf(leaf({ blockages: { dev: { blockedAt: 12 } } }), 'dev', labels)}
        label="020.dev"
        setBlocked={vi.fn()}
      />,
    );
    expect(screen.getByText('Direct step blockage')).toBeVisible();
    expect(screen.getByText('Progress: In progress')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear step blockage on 020.dev' })).toBeVisible();
  });
  it('names proxy roots and offers block instead of clearing the derived reading', () => {
    const setBlocked = vi.fn();
    render(
      <StepBlockageSection
        blockage={stepBlockageOf(
          leaf({
            nodeReadings: { dev: 'blocked_by_proxy' },
            blockageCauses: { dev: [{ kind: 'step', nodeId: 'root.dev' }] },
          }),
          'dev',
          labels,
        )}
        label="020.dev"
        setBlocked={setBlocked}
      />,
    );
    expect(screen.getByText('Blocked by dependency')).toBeVisible();
    expect(screen.getByText('Cause: 010.dev · Checkout · Dev')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Block step 020.dev' }));
    expect(setBlocked).toHaveBeenCalledWith(true);
  });
  it('allows clearing a retained done fact and refuses a new done fact', () => {
    const { rerender } = render(
      <StepBlockageSection
        blockage={stepBlockageOf(
          leaf({
            progress: { dev: 'done' },
            nodeReadings: { dev: 'done' },
            blockages: { dev: { blockedAt: 12 } },
          }),
          'dev',
          labels,
        )}
        label="020.dev"
        setBlocked={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Clear step blockage on 020.dev' })).toBeEnabled();
    rerender(
      <StepBlockageSection
        blockage={stepBlockageOf(
          leaf({ progress: { dev: 'done' }, nodeReadings: { dev: 'done' } }),
          'dev',
          labels,
        )}
        label="020.dev"
        setBlocked={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Block step 020.dev' })).toBeDisabled();
  });
  it('shows older metadata as unknown without offering a write', () => {
    render(
      <StepBlockageSection
        blockage={stepBlockageOf(
          leaf({ blockages: undefined, blockageCauses: undefined }),
          'dev',
          labels,
        )}
        label="020.dev"
        setBlocked={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Step blockage unknown — this server omits blockage details.'),
    ).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('rejects incomplete supported metadata and a missing node reading', () => {
    expect(() => stepBlockageOf(leaf({ blockages: undefined }), 'dev', labels)).toThrow(
      'Incomplete step blockage metadata',
    );
    expect(() => stepBlockageOf(leaf({ nodeReadings: {} }), 'dev', labels)).toThrow(
      'Missing node reading',
    );
  });
  it('keeps a work-item hold distinct from a direct step statement', () => {
    render(
      <StepBlockageSection
        blockage={stepBlockageOf(
          leaf({ blockageCauses: { dev: [{ kind: 'work-item', workItemId: 'root' }] } }),
          'dev',
          new Map([['root', '010 · Checkout']]),
        )}
        label="020.dev"
        setBlocked={vi.fn()}
      />,
    );
    expect(screen.getByText('Blocked by work-item hold')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Block step 020.dev' })).toBeEnabled();
    expect(screen.getByText('Cause: 010 · Checkout')).toBeVisible();
  });
  it('rejects an empty blocked cause collection', () => {
    expect(() => stepBlockageOf(leaf({ blockageCauses: { dev: [] } }), 'dev', labels)).toThrow(
      'Missing blockage causes',
    );
  });
  it('rejects a missing supported cause entry and an unknown cause identity', () => {
    expect(() => stepBlockageOf(leaf({ blockageCauses: {} }), 'dev', labels)).toThrow(
      'Missing blockage causes',
    );
    expect(() =>
      stepBlockageOf(
        leaf({ blockageCauses: { dev: [{ kind: 'step', nodeId: 'missing' }] } }),
        'dev',
        labels,
      ),
    ).toThrow('Unknown blockage cause');
  });
});
