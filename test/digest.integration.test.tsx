import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir: string;
const night = '2026-10-28';
const config = () => ({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
const file = (contents: string) => writeFileSync(join(runsDir, `${night}.jsonl`), contents);
const event = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-integration-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

describe('digest routes with real JSONL files', () => {
  it('returns independently expected aggregation and ordered HTML, including recovered failure and retries', async () => {
    file([
      event('2026-10-29T01:00:00+02:00', 'zeta', 'ok', null),
      event('2026-10-28T23:00:00+01:00', 'alpha', 'fail', 'old', 'disk failed'),
      event('2026-10-29T00:15:00+01:00', 'alpha', 'retry', 'old'),
      event('2026-10-29T00:30:00+01:00', 'alpha', 'retry', 'old'),
      event('2026-10-29T00:45:00+01:00', 'alpha', 'retry', 'old'),
      event('2026-10-29T02:00:00+02:00', 'alpha', 'ok', null),
      '{broken json',
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'invalid', status: 'unknown', owner: null }),
      '',
    ].join('\n'));
    const app = createApp(config());
    const api = await app.request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({
      night, badLines: 2, counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        { job: 'alpha', owner: null, runs: 5, retries: 3, failures: 1, lastStatus: 'ok', lastError: 'disk failed', firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-29T02:00:00+02:00' },
        { job: 'zeta', owner: null, runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T01:00:00+02:00', lastAt: '2026-10-29T01:00:00+02:00' },
      ],
    });
    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('alpha');
    expect(html).toContain('zeta');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('disk failed');
    expect(html).toContain('2026-10-28T23:00:00+01:00');
    expect(html).toContain('2026-10-29T02:00:00+02:00');
    expect(html).toContain('—');
    expect(html).toMatch(/retry|retries/i);
    expect(html).toMatch(/fail/i);
    expect(html).toMatch(/bad|invalid/i);
    expect(html).not.toContain('{broken json');
    expect(html).not.toMatch(/<script\b/i);
  });

  it.each([['2026-10-27', 404, 'not-found'], ['2026-02-30', 400, 'invalid-night']])(
    'maps %s to %i without leaking paths', async (requested, status, code) => {
      const app = createApp(config());
      const api = await app.request(`/api/digest/${requested}`);
      expect(api.status).toBe(status);
      expect(await api.json()).toEqual({ error: { code } });
      const page = await app.request(`/digest/${requested}`);
      expect(page.status).toBe(status);
      expect(await page.text()).not.toContain(runsDir);
    },
  );

  it('distinguishes an empty night from one with only invalid lines', async () => {
    const app = createApp(config());
    file('  \n\n');
    const empty = await app.request(`/api/digest/${night}`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    const emptyPage = await app.request(`/digest/${night}`);
    expect(emptyPage.status).toBe(200);
    expect(await emptyPage.text()).toMatch(/nothing ran/i);

    file('{bad\n{"job":"missing fields"}\n');
    const invalid = await app.request(`/api/digest/${night}`);
    expect(invalid.status).toBe(200);
    expect(await invalid.json()).toEqual({ night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 } });
    const invalidPage = await app.request(`/digest/${night}`);
    expect(invalidPage.status).toBe(200);
    const html = await invalidPage.text();
    expect(html).not.toMatch(/nothing ran/i);
    expect(html).toMatch(/no (valid|correct) (entries|events|runs)/i);
    expect(html).toContain('2');
    expect(html).not.toContain('{bad');
  });

  it('reports a real I/O error without exposing the server path', async () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    const app = createApp(config());
    const api = await app.request(`/api/digest/${night}`);
    expect(api.status).toBe(500);
    const text = await api.text();
    expect(JSON.parse(text)).toEqual({ error: { code: 'read-error' } });
    expect(text).not.toContain(runsDir);
    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(500);
    expect(await page.text()).not.toContain(runsDir);
  });
});
