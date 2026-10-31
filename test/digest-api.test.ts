import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDigestApi } from '../src/routes/digest-api.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function harness() {
  const runsDir = mkdtempSync(join(tmpdir(), 'digest-api-'));
  dirs.push(runsDir);
  const app = new Hono();
  registerDigestApi(app, { runsDir, adapter: '', installed: '', beatEverySeconds: 1 });
  return { app, runsDir };
}

describe('digest API (prawdziwy czytnik)', () => {
  it('zwraca nieopakowany digest w kolejności czytnika', async () => {
    const { app, runsDir } = harness();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at: '2026-10-28T01:00:00Z', job: 'z', owner: null, status: 'retry' }),
      JSON.stringify({ at: '2026-10-28T02:00:00Z', job: 'a', owner: 'Ada', status: 'ok' }),
      'broken',
    ].join('\n'));
    const response = await app.request('/api/digest/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ night: '2026-10-28', rows: [
      { job: 'a', owner: 'Ada', runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T02:00:00Z', lastAt: '2026-10-28T02:00:00Z' },
      { job: 'z', owner: null, runs: 1, retries: 1, failures: 0, lastStatus: 'retry', lastError: null, firstAt: '2026-10-28T01:00:00Z', lastAt: '2026-10-28T01:00:00Z' },
    ], badLines: 1, counts: { ok: 1, retry: 1, fail: 0 } });
  });

  it('odróżnia pusty plik i same błędne linie', async () => {
    const { app, runsDir } = harness();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), 'bad\n{}\n');
    for (const [night, badLines] of [['2026-10-28', 0], ['2026-10-29', 2]] as const) {
      const response = await app.request(`/api/digest/${night}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ night, rows: [], badLines, counts: { ok: 0, retry: 0, fail: 0 } });
    }
  });

  it('mapuje błędy bez ujawniania szczegółów systemu', async () => {
    const { app, runsDir } = harness();
    mkdirSync(join(runsDir, '2026-10-30.jsonl'));
    for (const [night, status, code] of [['2026-02-30', 400, 'invalid-night'], ['2026-10-29', 404, 'not-found'], ['2026-10-30', 500, 'read-error']] as const) {
      const response = await app.request(`/api/digest/${night}`);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: { code } });
    }
  });
});
