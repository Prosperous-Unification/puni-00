import {
  candidatesAt,
  formatInstant,
  makeLoad,
  parseAttempts,
  placeAttempt,
  SPANS,
  zoomViewport,
} from './model.js';

/* global performance:readonly, URLSearchParams:readonly, location:readonly, fetch:readonly, document:readonly, PerformanceObserver:readonly, URL:readonly, history:readonly, window:readonly */

const mountedAt = performance.now();
const queries = new URLSearchParams(location.search);
const batch = parseAttempts(await (await fetch('fixtures/batch-1.json')).json());
const synthetic = parseAttempts(await (await fetch('fixtures/ambiguity.json')).json());
const controls = Object.fromEntries(
  ['variant', 'fixture', 'rows', 'attempts', 'zone', 'span', 'zoom'].map((id) => [
    id,
    document.getElementById(id),
  ]),
);
let attempts = batch;
let selected = null;
let viewport = { start: batch[0].start, span: SPANS[1], width: 1000 };
const longTasks = [];
new PerformanceObserver((entries) =>
  longTasks.push(
    ...entries.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration })),
  ),
).observe({ type: 'longtask', buffered: true });

for (const [key, control] of Object.entries(controls))
  if (queries.has(key)) control.value = queries.get(key);

function findSelected() {
  return attempts.find((attempt) => attempt.id === selected) ?? null;
}

function showDetails() {
  const attempt = findSelected();
  const details =
    attempt === null
      ? 'Select an attempt'
      : JSON.stringify(
          {
            attempt: attempt.id,
            packet: attempt.packet,
            slice: attempt.slice,
            startUTC: new Date(attempt.start).toISOString(),
            endUTC: attempt.end === null ? null : new Date(attempt.end).toISOString(),
            startLabel: formatInstant(attempt.start, controls.zone.value),
            endLabel:
              attempt.end === null
                ? 'Missing end (not zero)'
                : formatInstant(attempt.end, controls.zone.value),
            elapsedSeconds: attempt.end === null ? null : (attempt.end - attempt.start) / 1000,
            meaning: 'executor return, not success or review approval',
          },
          null,
          2,
        );
  document.getElementById('details').textContent = details;
  document.getElementById('state').textContent = JSON.stringify(
    {
      variant: controls.variant.value,
      fixture: controls.fixture.value,
      zone: controls.zone.value,
      viewportStartUTC: new Date(viewport.start).toISOString(),
      visibleSpanSeconds: viewport.span / 1000,
      selected,
      attempts: attempts.length,
      rows: new Set(attempts.map((attempt) => attempt.packet)).size,
    },
    null,
    2,
  );
}

function selectAttempt(id) {
  selected = id;
  for (const paint of document.querySelectorAll('.paint'))
    paint.classList.toggle('selected', paint.dataset.id === id);
  document.getElementById('ambiguity').replaceChildren();
  showDetails();
}

function renderRuler() {
  const ruler = document.getElementById('ruler');
  ruler.replaceChildren();
  const intervals = [
    1000, 5000, 10000, 30000, 60000, 300000, 900000, 1800000, 3600000, 10800000, 21600000, 43200000,
    86400000, 172800000, 604800000,
  ];
  const interval =
    intervals.find((interval) => (interval / viewport.span) * viewport.width >= 145) ??
    intervals.at(-1);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: controls.zone.value,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let rightEdge = -1;
  for (
    let instant = Math.ceil(viewport.start / interval) * interval;
    instant <= viewport.start + viewport.span;
    instant += interval
  ) {
    const x = ((instant - viewport.start) / viewport.span) * viewport.width;
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = `${x}px`;
    const label = document.createElement('span');
    label.textContent = formatter.format(instant);
    const zone = document.createElement('span');
    zone.textContent = controls.zone.value;
    tick.append(label, zone);
    ruler.append(tick);
    const width = tick.getBoundingClientRect().width;
    if (x < rightEdge + 8 || x + width > viewport.width) tick.remove();
    else rightEdge = x + width;
  }
}

function paintTracks() {
  for (const track of document.querySelectorAll('.track')) {
    for (const paint of track.querySelectorAll('.paint')) {
      const attempt = attemptsById.get(paint.dataset.id);
      const placed = placeAttempt(attempt, viewport);
      paint.style.left = `${placed.x}px`;
      paint.style.width = `${placed.width === null ? 0 : placed.width}px`;
      const hit = paint.nextElementSibling;
      const painted = placed.width === null ? 0 : placed.width;
      const width = Math.max(18, painted);
      hit.style.left = `${placed.x - (width - painted) / 2}px`;
      hit.style.width = `${width}px`;
    }
  }
  // Proof: disabling syncZoomControls fails the browser's fit-all displayed-span regression.
  syncZoomControls();
  renderRuler();
  showDetails();
}

function syncZoomControls() {
  let fitted = controls.span.querySelector('[data-fitted]');
  if (SPANS.includes(viewport.span)) controls.span.value = String(viewport.span);
  else {
    if (!fitted) {
      fitted = document.createElement('option');
      fitted.dataset.fitted = '';
      fitted.disabled = true;
      controls.span.append(fitted);
    }
    fitted.value = String(viewport.span);
    fitted.textContent = `Fit · ${(viewport.span / 3600000).toFixed(2)} hours`;
    controls.span.value = fitted.value;
  }
  controls.zoom.value = String(
    Math.round((Math.log(viewport.span / 300000) / Math.log(604800000 / 300000)) * 1000),
  );
}

let attemptsById = new Map();

function mountRows() {
  const lanes = document.getElementById('lanes');
  lanes.replaceChildren();
  const packets = Map.groupBy(attempts, (attempt) => attempt.packet);
  attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const fragment = document.createDocumentFragment();
  for (const [packet, packetAttempts] of packets) {
    const lane = document.createElement('div');
    lane.className = 'lane';
    const label = document.createElement('div');
    label.className = 'packet-label';
    label.textContent = packet;
    label.title = packet;
    const track = document.createElement('div');
    track.className = 'track';
    track.tabIndex = 0;
    track.setAttribute('aria-label', `${packet} time track`);
    for (const attempt of packetAttempts) {
      const paint = document.createElement('div');
      paint.className = `paint${attempt.end === null ? ' open' : attempt.end === attempt.start ? ' zero' : ''}`;
      paint.dataset.id = attempt.id;
      const hit = document.createElement('button');
      hit.className = 'hit';
      hit.dataset.id = attempt.id;
      hit.setAttribute('aria-label', `Attempt ${attempt.id}`);
      hit.title = `${attempt.id} · ${attempt.slice}`;
      hit.addEventListener('click', () => selectAttempt(attempt.id));
      track.append(paint, hit);
    }
    track.addEventListener('click', (event) => {
      if (event.target !== track) return;
      const candidates = candidatesAt(
        packetAttempts,
        viewport,
        event.clientX - track.getBoundingClientRect().left,
      );
      const ambiguity = document.getElementById('ambiguity');
      ambiguity.replaceChildren();
      if (candidates.length === 1) selectAttempt(candidates[0].id);
      if (candidates.length > 1) {
        const message = document.createElement('strong');
        message.textContent = `${candidates.length} overlapping hit targets — choose:`;
        ambiguity.append(message);
        for (const attempt of candidates) {
          const button = document.createElement('button');
          button.textContent = attempt.id;
          button.addEventListener('click', () => selectAttempt(attempt.id));
          ambiguity.append(button);
        }
      }
    });
    track.addEventListener('keydown', (event) => {
      if (event.target === track && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        pan(event.key === 'ArrowLeft' ? -0.25 : 0.25);
      }
    });
    lane.append(label, track);
    fragment.append(lane);
  }
  lanes.append(fragment);
  viewport.width = document.getElementById('ruler').clientWidth;
  paintTracks();
}

function fitAll() {
  const start = Math.min(...attempts.map((attempt) => attempt.start));
  const end = Math.max(
    ...attempts.map((attempt) => (attempt.end === null ? attempt.start : attempt.end)),
  );
  const padding = Math.max(1000, (end - start) * 0.05);
  viewport = {
    ...viewport,
    start: start - padding,
    span: Math.max(300000, end - start + 2 * padding),
  };
  paintTracks();
}

function fitSelected() {
  const attempt = findSelected();
  if (attempt === null) return;
  const duration = attempt.end === null ? 0 : attempt.end - attempt.start;
  viewport = {
    ...viewport,
    start: attempt.start - Math.max(1000, duration * 0.25),
    span: Math.max(300000, duration * 1.5),
  };
  paintTracks();
}

function zoom(span) {
  const attempt = findSelected();
  const anchor =
    attempt && attempt.start >= viewport.start && attempt.start <= viewport.start + viewport.span
      ? attempt.start
      : undefined;
  viewport = zoomViewport(viewport, span, anchor);
  paintTracks();
}

function pan(fraction) {
  viewport.start += viewport.span * fraction;
  paintTracks();
}

function setFixture() {
  attempts =
    controls.fixture.value === 'batch'
      ? batch
      : controls.fixture.value === 'ambiguity'
        ? synthetic
        : makeLoad(Number(controls.rows.value), Number(controls.attempts.value));
  selected = null;
  mountRows();
  fitAll();
}

controls.fixture.addEventListener('change', setFixture);
controls.rows.addEventListener('change', setFixture);
controls.attempts.addEventListener('change', setFixture);
controls.zone.addEventListener('change', () => {
  renderRuler();
  showDetails();
});
controls.span.addEventListener('change', () => zoom(Number(controls.span.value)));
controls.zoom.addEventListener('input', () =>
  zoom(300000 * Math.pow(604800000 / 300000, Number(controls.zoom.value) / 1000)),
);
function changeVariant() {
  document.getElementById('discrete-control').hidden = controls.variant.value !== 'discrete';
  document.getElementById('continuous-control').hidden = controls.variant.value !== 'continuous';
  showDetails();
}
controls.variant.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('variant', controls.variant.value);
  history.replaceState(null, '', url);
  changeVariant();
});
document.getElementById('fit-all').addEventListener('click', fitAll);
document.getElementById('fit-selected').addEventListener('click', fitSelected);
document.getElementById('pan-left').addEventListener('click', () => pan(-0.25));
document.getElementById('pan-right').addEventListener('click', () => pan(0.25));
let drag = null;
document.getElementById('ruler').addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, start: viewport.start };
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.getElementById('ruler').addEventListener('pointermove', (event) => {
  if (drag) {
    viewport.start = drag.start - ((event.clientX - drag.x) / viewport.width) * viewport.span;
    paintTracks();
  }
});
document.getElementById('ruler').addEventListener('pointerup', () => {
  drag = null;
});
window.addEventListener('resize', () => {
  viewport.width = document.getElementById('ruler').clientWidth;
  paintTracks();
});
setFixture();
changeVariant();

/** Read-only experiment inspection surface; no application services or API mutations. */
window.timeline = {
  ready: true,
  mountedMs: performance.now() - mountedAt,
  longTasks,
  get viewport() {
    return { ...viewport };
  },
  get attempts() {
    return attempts;
  },
  get selected() {
    return selected;
  },
  zoom,
  pan,
  selectAttempt,
  fitAll,
  fitSelected,
  geometry() {
    return attempts.map((attempt) => ({ id: attempt.id, ...placeAttempt(attempt, viewport) }));
  },
};
