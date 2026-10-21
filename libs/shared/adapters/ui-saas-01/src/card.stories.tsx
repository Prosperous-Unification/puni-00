import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from './index';

/** The card and its parts, as a signed-out page's one form uses them. */
const meta = {
  title: 'Primitives/Card',
  component: Card,
  args: { className: 'w-96' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use the account your organization gave you.</CardDescription>
      </CardHeader>
      <CardContent>
        <Label>
          Username
          <Input autoComplete="username" />
        </Label>
      </CardContent>
      <CardFooter>
        <Button type="submit">Continue</Button>
        <Button variant="link">Have no account? Register</Button>
      </CardFooter>
    </Card>
  ),
};

/** A card that is only a title and a sentence, the smallest one a page shows. */
export const TitleOnly: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader className="pb-6">
        <CardTitle as="h3">No projects yet</CardTitle>
        <CardDescription>Create one to start planning.</CardDescription>
      </CardHeader>
    </Card>
  ),
};
