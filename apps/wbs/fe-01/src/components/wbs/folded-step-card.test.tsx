import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FoldedStepCard } from './folded-step-card';

describe('folded step estimate detail', () => {
  it('keeps the existing final line for zero allowance', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[{ point: 'realistic', days: '2' }]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="2"
        allowancePercent={0}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
      />,
    );
    expect(screen.getByText('Final 2 days')).toBeInTheDocument();
    expect(screen.queryByText(/Charged/)).toBeNull();
  });

  it('shows no charged figure for an unknown estimate', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[{ point: 'realistic', days: '' }]}
        final=""
        allowancePercent={30}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
      />,
    );
    expect(screen.getByText('No estimate yet')).toBeInTheDocument();
    expect(screen.queryByText(/Charged/)).toBeNull();
  });
  it('explains the base, allowance, before-rounding and charged days', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[
          { point: 'optimistic', days: '2' },
          { point: 'realistic', days: '2' },
          { point: 'pessimistic', days: '2' },
        ]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="3"
        allowancePercent={30}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
      />,
    );
    expect(screen.getByText('Base estimate 2 days')).toBeInTheDocument();
    expect(screen.getByText('Allowance +30%')).toBeInTheDocument();
    expect(screen.getByText('Before rounding 2.6 days')).toBeInTheDocument();
    expect(screen.getByText('Charged 3 days')).toBeInTheDocument();
  });

  it('shows the fraction a tiny allowance leaves before rounding', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[
          { point: 'optimistic', days: '2' },
          { point: 'realistic', days: '2' },
          { point: 'pessimistic', days: '2' },
        ]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="3"
        allowancePercent={0.01}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
      />,
    );
    expect(screen.getByText('Before rounding 2.0002 days')).toBeInTheDocument();
    expect(screen.getByText('Charged 3 days')).toBeInTheDocument();
  });
});
