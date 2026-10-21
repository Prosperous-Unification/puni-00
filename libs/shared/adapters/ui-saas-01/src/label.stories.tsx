import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button, FIELD_LABEL_CLASS, FORM_CLASS, Input, Label, SELECT_CLASS } from './index';

/** The field caption, with its control nested inside it as every caller does. */
const meta = {
  title: 'Primitives/Label',
  component: Label,
  args: { className: 'w-72' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Label {...args}>
      Username
      <Input autoComplete="username" />
    </Label>
  ),
};

/** The control helpers: a one-line form with a native select drawn as an input. */
export const Form: Story = {
  render: () => (
    <form
      className={FORM_CLASS}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <Label className={FIELD_LABEL_CLASS}>
        Domain
        <Input defaultValue="example.com" />
      </Label>
      <Label className={FIELD_LABEL_CLASS}>
        Kind
        <select className={SELECT_CLASS} defaultValue="team">
          <option value="team">Team</option>
          <option value="person">Person</option>
        </select>
      </Label>
      <Button type="submit">Add</Button>
    </form>
  ),
};
