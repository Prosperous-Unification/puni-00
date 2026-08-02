import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { renderAll, renderTemplate } from './render';

const TEMPLATES = join(import.meta.dir, 'templates');

describe('renderTemplate', () => {
  it('substitutes {{KEY}} placeholders', () => {
    const result = renderTemplate('port {{PORT}}, host {{HOST}}', {
      PORT: '3100',
      HOST: 'localhost',
    });
    expect(result).toBe('port 3100, host localhost');
  });

  it('throws on missing placeholder', () => {
    expect(() => renderTemplate('missing {{FOO}}', {})).toThrow(/FOO/);
  });
});

describe('renderAll', () => {
  it('renders all .tmpl files under templates/ into outDir', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'tool-compose-'));
    const written = await renderAll({
      templatesDir: join(import.meta.dir, 'templates'),
      outDir,
      context: {
        TIER: 'be',
        COLOR: 'green',
        IMAGE: 'registry.infra.bulletpoints.club/wbs-be-01:abc1234',
        SITE_ADDRESS: 'wbs.bulletpoints.club',
        BE_COLOR: 'green',
        GW_COLOR: 'blue',
        FE_COLOR: 'green',
      },
    });
    expect(written.length).toBeGreaterThan(0);
    const tier = await readFile(join(outDir, 'tier.compose'), 'utf8');
    expect(tier).toMatch(/image: registry.infra.bulletpoints.club\/wbs-be-01:abc1234/);
    expect(tier).toMatch(/be-green:/);
    const site = await readFile(join(outDir, 'site.caddy'), 'utf8');
    expect(site).toMatch(/reverse_proxy be-01-green:3100/);
  });
});

describe('site.caddy.tmpl', () => {
  const tmpl = readFileSync(join(TEMPLATES, 'site.caddy.tmpl'), 'utf8');

  it('renders with every placeholder supplied', () => {
    const out = renderTemplate(tmpl, {
      SITE_ADDRESS: 'wbs.bulletpoints.club',
      BE_COLOR: 'green',
      GW_COLOR: 'blue',
      FE_COLOR: 'green',
    });
    expect(out).toContain('be-01-green:3100');
    expect(out).toContain('gw-01-blue:3200');
    expect(out).toContain('fe-01-green:80');
    expect(out).not.toContain('{{');
  });

  it('keeps stream_close_delay above the drain ceiling', () => {
    expect(tmpl).toContain('stream_close_delay 310s');
  });

  it('passes /api through rather than stripping it', () => {
    // handle_path would strip /api, but be-01 mounts its controllers under /api.
    expect(tmpl).not.toContain('handle_path /api');
    expect(tmpl).toContain('handle /api/*');
  });
});
