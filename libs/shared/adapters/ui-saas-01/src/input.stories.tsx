import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './index';

/** The text box in each of its states; each one names itself, as every real input must. */
const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { 'aria-label': 'Project name', placeholder: 'Project name', className: 'w-72' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: 'Website relaunch' } };
export const Invalid: Story = { args: { defaultValue: 'x', 'aria-invalid': true } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Website relaunch' } };
