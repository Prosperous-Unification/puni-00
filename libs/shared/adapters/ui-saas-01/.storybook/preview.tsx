import './preview.css';

import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

/** Light and dark in the toolbar: the dark one puts `.dark` on `<html>`, as an app does. */
const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
  ],
  parameters: { layout: 'padded' },
};

export default preview;
