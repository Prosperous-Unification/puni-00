import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workItemView } from '@/testing/views';

import { dependencyWords, endpointChoices, TypedDependencyEditor } from './typed-dependency-editor';
import { toTree } from './wbs-rows';

const steps = [
  { id: 'dev', name: 'Dev', allowancePercent: 0 },
  { id: 'qa', name: 'QA', allowancePercent: 0 },
];
const rows = toTree([
  workItemView({ id: 'a', number: '010', name: 'Strip' }),
  workItemView({ id: 'b', number: '020', name: 'Paint' }),
]);
const predecessor = rows[0];
const successor = rows[1];

describe('typed dependency editor', () => {
  it('refuses an unknown relationship in a read chip and an edit', () => {
    const unknown = {
      id: 'future',
      type: 'SF',
      predecessor: { scope: 'whole' as const, workItemId: 'a' },
      successor: { scope: 'whole' as const, workItemId: 'b' },
    };
    expect(() => dependencyWords(unknown, rows, steps)).toThrow(
      'Unknown dependency relationship SF',
    );
    expect(() =>
      render(
        <TypedDependencyEditor
          predecessor={predecessor}
          successor={successor}
          rows={rows}
          steps={steps}
          dependency={unknown}
          onCancel={vi.fn()}
          onSave={vi.fn()}
        />,
      ),
    ).toThrow('Unknown dependency relationship SF');
  });
  it.each([
    ['SS', 'Start-to-start'],
    ['FF', 'Finish-to-finish'],
  ] as const)('spells %s in chips and accessible words', (type, fullName) => {
    const words = dependencyWords(
      {
        id: 'typed',
        type,
        predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev' },
        successor: { scope: 'node', workItemId: 'b', stepId: 'dev' },
      },
      rows,
      steps,
    );
    expect(words.chip).toBe(`010.dev ${type} → dev`);
    expect(words.label).toContain('Dev step of 010 Strip');
    expect(words.label).toContain('Dev step of 020 Paint');
    expect(words.label).toContain(fullName);
  });
  it.each(['SS', 'FF'] as const)('selects %s and gives its lower-bound meaning', async (type) => {
    const onSave = vi.fn().mockResolvedValue('landed');
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: type } });
    expect(
      screen.getByText(
        type === 'SS'
          ? /020 starts no earlier than 010 starts/
          : /020 finishes no earlier than 010 finishes/,
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        { scope: 'whole', workItemId: 'a' },
        { scope: 'whole', workItemId: 'b' },
        type,
      );
    });
  });

  it.each(['SS', 'FF'] as const)('keeps %s when editing only an endpoint', async (type) => {
    const onSave = vi.fn().mockResolvedValue('landed');
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        dependency={{
          id: 'd1',
          type,
          predecessor: { scope: 'whole', workItemId: 'a' },
          successor: { scope: 'whole', workItemId: 'b' },
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('This work item'), { target: { value: 'qa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        { scope: 'whole', workItemId: 'a' },
        { scope: 'node', stepNodeId: 'sn1.b.qa' },
        type,
      );
    });
  });
  it('explains whole-parent expansion with the descendant leaf count', () => {
    const branch = toTree([
      workItemView({ id: 'p', number: '030', name: 'Parent' }),
      workItemView({ id: 'c1', parentId: 'p', number: '030.1' }),
      workItemView({ id: 'c2', parentId: 'p', number: '030.2' }),
    ]);
    expect(
      endpointChoices(branch[0], [...branch, ...(branch[0]?.subRows ?? [])], steps)[0]?.label,
    ).toBe('All descendant work items (2)');
  });
  it('proposes the same step id on both sides without writing before Add', async () => {
    const onSave = vi.fn().mockResolvedValue('landed');
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        preferredStepId="qa"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    // Proof: making Customize write immediately caused this assertion to fail with one API call; watched 2026-09-27.
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Predecessor')).toHaveProperty('value', 'qa');
    expect(screen.getByLabelText('This work item')).toHaveProperty('value', 'qa');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        { scope: 'node', stepNodeId: 'sn1.a.qa' },
        { scope: 'node', stepNodeId: 'sn1.b.qa' },
        'FS',
      );
    });
  });

  it('marks a missing predecessor step unavailable instead of substituting Dev', () => {
    const onSave = vi.fn().mockResolvedValue('landed');
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        preferredStepId="qa"
        availablePredecessorStepIds={['dev']}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText('Predecessor')).toHaveProperty('value', 'qa');
    expect(screen.getByRole('option', { name: 'QA step unavailable for 010' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('spells whole, node and descendant scopes with full accessible words', () => {
    const parentRows = toTree([
      workItemView({ id: 'p', number: '030', name: 'Parent' }),
      workItemView({ id: 'c1', parentId: 'p', number: '030.1' }),
      workItemView({ id: 'c2', parentId: 'p', number: '030.2' }),
    ]);
    const allRows = [...rows, ...parentRows, ...(parentRows[0]?.subRows ?? [])];
    const whole = dependencyWords(
      {
        id: 'd1',
        type: 'FS',
        predecessor: { scope: 'whole', workItemId: 'a' },
        successor: { scope: 'whole', workItemId: 'b' },
      },
      allRows,
      steps,
    );
    expect(whole.chip).toBe('010 FS');
    expect(whole.label).toContain('010 Strip');
    expect(whole.label).toContain('020 Paint');
    const node = dependencyWords(
      {
        id: 'd2',
        type: 'FS',
        predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev' },
        successor: { scope: 'node', workItemId: 'b', stepId: 'dev' },
      },
      allRows,
      steps,
    );
    expect(node.chip).toBe('010.dev FS → dev');
    expect(node.label).toContain('Dev step of 010 Strip');
    const coded = dependencyWords(
      {
        id: 'd2',
        type: 'FS',
        predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev', stepNodeId: 'sn1.a.dev' },
        successor: { scope: 'node', workItemId: 'b', stepId: 'dev', stepNodeId: 'sn1.b.dev' },
      },
      allRows,
      steps,
      [
        { id: 'sn1.a.dev', workItemId: 'a', stepId: 'dev', reference: '010.build' },
        { id: 'sn1.b.dev', workItemId: 'b', stepId: 'dev', reference: '020.ship' },
      ],
    );
    expect(coded.chip).toBe('010.build FS → ship');
    expect(() =>
      dependencyWords(
        {
          id: 'd2',
          type: 'FS',
          predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev', stepNodeId: 'sn1.a.dev' },
          successor: { scope: 'whole', workItemId: 'b' },
        },
        allRows,
        steps,
        [],
      ),
    ).toThrow('Missing dependency step node');
    const descendant = dependencyWords(
      {
        id: 'd3',
        type: 'FS',
        predecessor: { scope: 'descendant-step', workItemId: 'p', stepId: 'dev' },
        successor: { scope: 'whole', workItemId: 'b' },
      },
      allRows,
      steps,
    );
    expect(descendant.chip).toBe('030 · all Dev (2) FS');
    expect(descendant.label).toContain('all descendant work items under 030 Parent');
  });

  it('keeps the editor open and announces a refused save', async () => {
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue('refused')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Dependency refused');
    });
    expect(screen.getByRole('dialog', { name: 'Customize dependency' })).toBeDefined();
  });

  it('uses work-item and step words when a server node has no reference', () => {
    const words = dependencyWords(
      {
        id: 'd-null',
        type: 'FS',
        predecessor: { scope: 'node', workItemId: 'a', stepId: 'dev', stepNodeId: 'sn1.a.dev' },
        successor: { scope: 'node', workItemId: 'b', stepId: 'dev', stepNodeId: 'sn1.b.dev' },
      },
      rows,
      steps,
      [
        { id: 'sn1.a.dev', workItemId: 'a', stepId: 'dev', reference: null },
        { id: 'sn1.b.dev', workItemId: 'b', stepId: 'dev', reference: null },
      ],
    );
    expect(words.chip).toBe('010 · Dev step FS → 020 · Dev step');
  });

  it('keeps ArrowLeft inside a scope selector', () => {
    const onCancel = vi.fn();
    render(
      <TypedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        rows={rows}
        steps={steps}
        onCancel={onCancel}
        onSave={vi.fn().mockResolvedValue('landed')}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Predecessor'), { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Customize dependency' })).toBeDefined();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
