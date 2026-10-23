import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Button,
  Modal,
  ModalClose,
  ModalContent,
  type ModalContentProps,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from './index';

/** The props a modal story varies: where the surface sits and whether it draws its ✕. */
type ModalStoryArgs = Pick<ModalContentProps, 'side' | 'closeButton'>;

/**
 * Each surface open from the start, so the card on the design canvas shows the
 * surface rather than a trigger. `modal={false}` keeps the catalogue page
 * scrollable and its other stories reachable while one is open.
 */
function OpenModal({ side, closeButton }: ModalStoryArgs) {
  return (
    <Modal defaultOpen modal={false}>
      <ModalTrigger asChild>
        <Button variant="outline">Open</Button>
      </ModalTrigger>
      <ModalContent side={side} closeButton={closeButton}>
        <ModalHeader>
          <ModalTitle>Delete plan?</ModalTitle>
          <ModalDescription>The plan and its history are removed for everyone.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="outline">Cancel</Button>
          </ModalClose>
          <Button variant="destructive">Delete</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

const meta = {
  title: 'Primitives/Modal',
  component: OpenModal,
  args: { side: 'centre', closeButton: true },
  argTypes: {
    side: { control: 'select', options: ['centre', 'right', 'left', 'bottom'] },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OpenModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Centre: Story = { args: { side: 'centre' } };
export const Right: Story = { args: { side: 'right' } };
export const Left: Story = { args: { side: 'left' } };
export const Bottom: Story = { args: { side: 'bottom' } };
/** A confirm whose Cancel dismisses it, so it draws no ✕. */
export const NoCloseButton: Story = { args: { side: 'centre', closeButton: false } };
