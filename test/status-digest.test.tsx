import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import * as reader from '../src/digest/read-night.js';
import { readStatus } from '../src/status.js';

it('shows event counts, links, existing status, and a failed night without false zeros', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  const config = { adapter: 'test-adapter', installed: 'today', beatEverySeconds: 60, runsDir: dir };
  try {
    for (const n of ['2026-10-28', '2026-10-29']) writeFileSync(join(dir, `${n}.jsonl`), '');
    const event = (status: string) => JSON.stringify({ at: '2026-10-28T01:00:00Z', job: 'job', owner: null, status });
    writeFileSync(join(dir, '2026-10-28.jsonl'), [event('retry'), event('fail'), event('ok'), event('ok')].join('\n'));
    const realRead = reader.readNight;
    vi.spyOn(reader, 'readNight').mockImplementation((d, n) => n === '2026-10-29' ? { kind: 'read-error' } : realRead(d, n));
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('test-adapter');
    expect(html).toContain('today');
    expect(html).toContain('last beat');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-29"');
    expect(html).toMatch(/event counts/i);
    expect(html).toMatch(/ok: 2.*retry: 1.*fail: 1/);
    expect(html).toMatch(/2026-10-29<\/a>.*unavailable/i);
    expect(readStatus(config).nights).toEqual(['2026-10-29', '2026-10-28']);
  } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
});

it('returns a server error instead of an empty success when listing fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  try {
    const file = join(dir, 'file'); writeFileSync(file, '');
    const res = await createApp({ adapter: 'x', installed: 'x', beatEverySeconds: 60, runsDir: file }).request('/');
    expect(res.status).toBe(500);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
