import './styles.css';

import { bootstrapApplication } from './runtime/application-bootstrap';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
// The runtime is built before anything renders, so no component ever owns it, and
// the bootstrap models its own failure as the sanitized fatal page. Nothing is
// caught here: a rejection from this call is a defect in the bootstrap itself, and
// an unhandled rejection is louder than a handler nobody reads.
void bootstrapApplication(el);
