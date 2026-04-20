import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { renderAll, renderTemplate } from './render';

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
        BE_IMAGE: 'be:1',
        BE_PORT: '3100',
        BE_HOST_PORT: '3100',
        GW_IMAGE: 'gw:1',
        GW_PORT: '3200',
        GW_HOST_PORT: '3200',
        DOMAIN: 'test.local',
        OBSERVABILITY_BASIC_AUTH_HASH: '$H$',
      },
    });
    expect(written.length).toBeGreaterThan(0);
    const be = await readFile(join(outDir, 'be.compose'), 'utf8');
    expect(be).toMatch(/image: be:1/);
    const caddy = await readFile(join(outDir, 'be.caddy'), 'utf8');
    expect(caddy).toMatch(/reverse_proxy be-01:3100/);
  });
});
