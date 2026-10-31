import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { DigestView } from '../src/views/digest.js';

const digest: NightDigest = {
  night: '2026-10-28', badLines: 2, counts: { ok: 4, retry: 3, fail: 1 },
  rows: [
    { job: '<z>', owner: null, runs: 5, retries: 3, failures: 1, lastStatus: 'ok', lastError: '<script>alert("x")</script>', firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-29T01:00:00+01:00' },
    { job: 'alpha', owner: 'A&B', runs: 1, retries: 0, failures: 0, lastStatus: 'ok', lastError: null, firstAt: 'first', lastAt: 'last' },
  ],
};

describe('DigestView', () => {
  it('presents all supplied fields in supplied order, with textual and styled warnings', () => {
    const html = (<DigestView digest={digest} />).toString();
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html.indexOf('&lt;z&gt;')).toBeLessThan(html.indexOf('alpha'));
    expect(html).toContain('2026-10-28');
    expect(html).toContain('bad lines: 2');
    expect(html).toContain('ok: 4');
    expect(html).toContain('retry: 3');
    expect(html).toContain('fail: 1');
    expect(html).toContain('last recorded error');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('2026-10-28T23:00:00+01:00');
    expect(html).toContain('2026-10-29T01:00:00+01:00');
    expect(html).toMatch(/class="warn"[^>]*>3[^<]*high retries/);
    expect(html).toMatch(/class="warn"[^>]*>1[^<]*historical fail/);
    expect(html).toContain('<td>ok</td>');
    expect(html.match(/<td>—<\/td>/g)?.length).toBe(2);
  });

  it('distinguishes empty from all-invalid nights', () => {
    const empty = { ...digest, rows: [], badLines: 0 };
    expect((<DigestView digest={empty} />).toString()).toContain('nothing ran');
    const invalid = (<DigestView digest={{ ...empty, badLines: 3 }} />).toString();
    expect(invalid).toContain('no valid entries');
    expect(invalid).toContain('bad lines: 3');
    expect(invalid).not.toContain('nothing ran');
  });
});

describe('digest route smoke', () => {
  it('renders the real night in the layout and maps missing and invalid nights', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp({ adapter: 'test', installed: 'test', beatEverySeconds: 60, runsDir: 'runs' });
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('lane-07');
    expect(html).toContain('bad lines: 1');
    expect(html).not.toContain('<script');
    expect((await app.request('/digest/2026-02-30')).status).toBe(400);
    expect((await app.request('/digest/2020-01-01')).status).toBe(404);
  });
});
