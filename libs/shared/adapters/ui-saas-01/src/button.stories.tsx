import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button, BUTTON_SIZES, BUTTON_VARIANTS } from './index';

/**
 * Every button the kit draws. The controls list the cva table's own keys, so
 * a new variant is selectable without a story edit; `stories.test.ts` still
 * asks for a named story per key, because each story is a card on the design
 * canvas.
 */
const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save plan', variant: 'default', size: 'default' },
  argTypes: {
    variant: { control: 'select', options: BUTTON_VARIANTS },
    size: { control: 'select', options: BUTTON_SIZES },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: 'default' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete plan' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Link: Story = { args: { variant: 'link', children: 'Have an account? Sign in' } };

export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Square: Story = {
  args: { size: 'square', variant: 'outline', children: '✕', 'aria-label': 'Close' },
};

/** A toggle's pressed face: filled in primary whatever the variant, here beside its plain twin. */
export const Pressed: Story = {
  render: (args) => (
    <div className="flex gap-2">
      <Button {...args} variant="outline" aria-pressed="true">
        Plan
      </Button>
      <Button {...args} variant="outline" aria-pressed="false">
        Board
      </Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };

/** Every variant against every size, in one frame. */
export const Matrix: Story = {
  render: (args) => (
    <div className="grid gap-3">
      {BUTTON_VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="text-muted-foreground w-24 text-xs">{variant}</span>
          {BUTTON_SIZES.map((size) => (
            <Button
              key={size}
              {...args}
              variant={variant}
              size={size}
              aria-label={`${variant} ${size}`}
            >
              {size === 'square' ? '✕' : size}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};
