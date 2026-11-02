import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { chromium } from 'playwright';

const directory = resolve('apps/website/fe-01/dist');
const output = '/tmp/puni-arrival-questionnaire';
mkdirSync(output, { recursive: true });
const conversation = {
  stage: 'clarify',
  turns: [
    { role: 'user', content: 'A booking tool' },
    { role: 'assistant', content: 'Who will use this tool first?' },
  ],
  visitorTurnsRemaining: 7,
  visitorTurnLimit: 8,
  brief: '',
  description: 'A booking tool',
  csrfToken: 'a'.repeat(64),
  initialOperation: { state: 'completed', idempotencyKey: 'arrival-fixture', truncated: false },
  latestOperation: null,
  exhaustedReason: null,
  challenge: null,
  provider: 'openrouter',
  scoping: {
    version: 1,
    startConversation: true,
    startingChoice: 'improve',
    questionId: 'improve-blocker',
    revision: 1,
    references: null,
    candidateBrief: null,
    emailInvitationDeclined: false,
  },
};
const observations = [];
for (const classic of [false, true]) {
  const browser = await chromium.launch({
    headless: true,
    ...(classic ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {}),
    args: ['--no-sandbox', ...(classic ? ['--disable-features=OverlayScrollbar'] : [])],
  });
  try {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 667 },
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ])
      for (const tag of ['scripted-ready', 'unavailable']) {
        const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const failures = [];
        const submissions = [];
        page.on('pageerror', (error) => failures.push(error.message));
        await page.route('**/*', async (route) => {
          const url = new globalThis.URL(route.request().url());
          if (url.hostname === 'dev.app.puni.dev') {
            const path = url.pathname.startsWith('/assets/') ? url.pathname : '/index.html';
            const contentType =
              { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[
                extname(path)
              ] ?? 'application/octet-stream';
            await route.fulfill({
              status: 200,
              body: readFileSync(`${directory}${path}`),
              contentType,
            });
          } else if (url.hostname === 'dev.api.puni.dev') {
            if (url.pathname === '/entry' && route.request().method() === 'GET')
              await route.fulfill({ json: { available: true, reason: null } });
            else if (url.pathname === '/conversation' && route.request().method() === 'GET')
              await route.fulfill({ json: conversation });
            else if (
              url.pathname === '/conversation/stream' &&
              route.request().method() === 'POST'
            ) {
              submissions.push(route.request().postDataJSON());
              await route.fulfill({ status: 503, json: { code: 'unavailable' } });
            } else
              throw new Error(
                `Unexpected fixture API request ${route.request().method()} ${url.pathname}`,
              );
          } else if (url.hostname === 'www.googletagmanager.com' && tag === 'scripted-ready')
            await route.fulfill({
              contentType: 'text/javascript',
              body: '/* Local load-only fixture: no vendor implementation or delivery. */',
            });
          else await route.abort();
        });
        try {
          await page.goto('https://dev.app.puni.dev/', { waitUntil: 'domcontentloaded' });
          const thread = page.getByRole('region', { name: 'Conversation with PUNI', exact: true });
          await thread.waitFor({ state: 'attached' });
          await page.locator('[data-arrival-choice]').waitFor();
          if (tag === 'unavailable')
            await page.locator('[data-arrival-choice]').getByRole('status').waitFor();
          const before = await page.evaluate(() => {
            const shell = globalThis.document.querySelector('.night-shell');
            const thread = globalThis.document.querySelector('.harness-thread');
            const header = globalThis.document.querySelector('.site-header');
            const strip = globalThis.document.querySelector('[data-arrival-choice]');
            if (!shell || !thread || !header || !strip) throw new Error('Missing ready shell');
            const box = thread.getBoundingClientRect();
            const brand = header.querySelector('.brand')?.getBoundingClientRect();
            const navigation = header.querySelector('.site-nav')?.getBoundingClientRect();
            if (!brand || !navigation) throw new Error('Missing masthead parts');
            const style = globalThis.getComputedStyle(header);
            return {
              thread: box.height,
              stripHeight: strip.getBoundingClientRect().height,
              actions: [...strip.querySelectorAll('button')].map((button) => {
                const box = button.getBoundingClientRect();
                return {
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  scrollWidth: button.scrollWidth,
                  clientWidth: button.clientWidth,
                };
              }),
              content: thread.scrollHeight,
              threadClient: thread.clientHeight,
              threadOverflow: globalThis.getComputedStyle(thread).overflowY,
              shellWidth: shell.clientWidth,
              shellOuter: shell.getBoundingClientRect().width,
              rootWidth: globalThis.document.documentElement.clientWidth,
              rootHeight: globalThis.document.documentElement.scrollHeight,
              viewportWidth: globalThis.innerWidth,
              viewportHeight: globalThis.innerHeight,
              headerWidth: header.getBoundingClientRect().width,
              brandLeft: brand.left,
              navigationRight: navigation.right,
              headerPadding: Number.parseFloat(style.paddingLeft),
              focus: globalThis.document.activeElement?.tagName,
            };
          });
          assert.ok(
            before.thread >= 240,
            `Questionnaire must retain a readable region before analytics choice: ${JSON.stringify({ viewport, tag, classic, before })}`,
          );
          assert.equal(before.actions.length, 2);
          assert.ok(
            before.actions.every(
              (action) => action.height >= 44 && action.scrollWidth <= action.clientWidth,
            ),
            'Equal mobile choices remain readable and at least 44px tall',
          );
          assert.equal(
            before.actions[0].y,
            before.actions[1].y,
            'Compact mobile actions share one row',
          );
          await page.screenshot({
            path: `${output}/initial-${viewport.width}-${viewport.height}-${tag}-${classic ? 'classic' : 'overlay'}.png`,
          });
          assert.equal(
            before.threadOverflow,
            'visible',
            'Conversation content shares the shell scroll during arrival',
          );
          assert.ok(
            before.content <= before.threadClient + 1,
            'No second physical thread scrollbar during arrival',
          );
          assert.equal(before.focus, 'H1', 'Existing page-heading focus is preserved');
          assert.equal(
            before.headerWidth,
            before.shellWidth,
            'Header uses the existing physical shell width',
          );
          assert.ok(
            Math.abs(before.brandLeft - before.headerPadding) < 1,
            'Brand retains masthead alignment',
          );
          if (viewport.width >= 992)
            assert.ok(
              Math.abs(before.navigationRight - (before.shellWidth - before.headerPadding)) < 1,
              'Desktop navigation retains masthead alignment',
            );
          assert.equal(before.rootWidth, before.viewportWidth, 'No added root scrollbar gutter');
          assert.ok(
            before.rootHeight <= before.viewportHeight,
            'Only the existing shell scrolls the page',
          );
          assert.equal(before.shellOuter, before.viewportWidth, 'Shell spans the viewport');
          if (classic)
            assert.ok(
              before.shellWidth < before.shellOuter,
              'Classic shell scrollbar fixture must reserve physical width',
            );
          const question = thread.getByText('Who will use this tool first?', { exact: true });
          await question.scrollIntoViewIfNeeded();
          assert.ok(await question.isVisible(), 'Saved question is readable before choice');
          const questionBox = await question.boundingBox();
          assert.ok(
            questionBox &&
              questionBox.y >= 0 &&
              questionBox.y + questionBox.height <= viewport.height,
            'Saved question scrolls into the phone viewport',
          );
          const composer = page.getByPlaceholder('Reply to PUNI…', { exact: true });
          await composer.fill('Local fixture note');
          assert.equal(
            await composer.inputValue(),
            'Local fixture note',
            'Composer remains usable before choice',
          );
          const footer = page.getByRole('complementary', {
            name: 'Analytics privacy',
            exact: true,
          });
          await footer.getByRole('button', { name: 'Privacy choices', exact: true }).click();
          assert.equal(
            await footer
              .getByRole('button', { name: 'Allow analytics cookies', exact: true })
              .count(),
            1,
            'Footer controls remain reachable',
          );
          await footer.getByRole('button', { name: 'Privacy choices', exact: true }).click();
          const answer = thread
            .getByRole('group', { name: 'Suggested answers', exact: true })
            .getByRole('button')
            .first();
          const submitted = page.waitForResponse(
            (response) => response.url().endsWith('/conversation/stream'),
            { timeout: 5000 },
          );
          await answer.click({ timeout: 5000 });
          await submitted;
          assert.equal(
            submissions.length,
            1,
            'A question control sends exactly one locally intercepted answer',
          );
          assert.equal(submissions[0].selected.questionId, 'improve-blocker');
          assert.equal(submissions[0].selected.revision, 1);
          assert.equal(submissions[0].message, 'Local fixture note');
          assert.equal(
            (await context.cookies()).filter((cookie) => cookie.name === 'puni_dev_consent_v1')
              .length,
            0,
            'Questionnaire interaction never requires or persists an analytics choice',
          );
          assert.equal(await page.locator('[data-arrival-choice]').count(), 1);
          assert.deepEqual(failures, []);
          await page.screenshot({
            path: `${output}/${viewport.width}-${viewport.height}-${tag}-${classic ? 'classic' : 'overlay'}.png`,
            fullPage: true,
          });
          if (viewport.width >= 992) {
            const legacySizing = await page.addStyleTag({
              content: `
              .build-page:has(.arrival-choice) > .harness,
              .build-page:has(.arrival-choice) .harness-root,
              .build-page:has(.arrival-choice) .harness-thread { flex: 1; }
              .build-page:has(.arrival-choice) .harness-thread { overflow-y: auto; }
            `,
            });
            try {
              const legacyHeader = await page.evaluate(() => {
                const header = globalThis.document.querySelector('.site-header');
                const brand = header?.querySelector('.brand');
                const navigation = header?.querySelector('.site-nav');
                if (!header || !brand || !navigation) throw new Error('Missing legacy masthead');
                return {
                  width: header.getBoundingClientRect().width,
                  brandLeft: brand.getBoundingClientRect().left,
                  navigationRight: navigation.getBoundingClientRect().right,
                };
              });
              assert.deepEqual(
                legacyHeader,
                {
                  width: before.headerWidth,
                  brandLeft: before.brandLeft,
                  navigationRight: before.navigationRight,
                },
                'Desktop header geometry is identical under the previous viewport/thread sizing',
              );
            } finally {
              await legacySizing.evaluate((node) => node.remove());
            }
          }
          observations.push({ viewport, tag, classic, before, selected: submissions[0].selected });
        } finally {
          await context.close();
        }
      }
  } finally {
    await browser.close();
  }
}
writeFileSync(`${output}/observations.json`, JSON.stringify(observations, null, 2));
globalThis.console.log(
  `Arrival questionnaire: ${String(observations.length)} offline ready-layout cases passed; no external service or durable writes.`,
);
