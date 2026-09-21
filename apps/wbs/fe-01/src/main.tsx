import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { ROOT_FAULT_OPTIONS } from './components/chrome/root-fault-options';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
// The options are not decoration: react-dom's own default writes the thrown error and its
// stack to the console for every fault a boundary catches. See {@link ROOT_FAULT_OPTIONS}.
// Proof: removing the second argument made the root-options assertion receive `undefined`
// instead of the three handlers (N12, 2026-09-21).
createRoot(el, ROOT_FAULT_OPTIONS).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
