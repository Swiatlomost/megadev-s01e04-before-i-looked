import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNight } from '../src/digest/read-night.js';
import type { NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const base = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'owner' };
let root: string;
let runs: string;

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), 'rig-reader-'));
  runs = join(root, 'runs');
  fs.mkdirSync(runs);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function writeEvents(events: unknown[], date = night): void {
  fs.writeFileSync(join(runs, `${date}.jsonl`), events.map(event => JSON.stringify(event)).join('\n'));
}
function digest(date = night): NightDigest {
  const result = readNight(runs, date);
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') throw new Error('Expected a digest');
  return result.digest;
}

describe('readNight input and IO', () => {
  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/../secret', '2026-10-28.jsonl',
    '2026-2-28', '2026-10-28\n', '2026-02-29', '2026-02-30', '1900-02-29',
    '2026-00-01', '2026-13-01', '2026-04-31', '2026-01-00', '2026-01-32', ''])
  ('rejects invalid night %j before IO', date => {
    expect(readNight(join(root, 'absent'), date)).toEqual({ kind: 'invalid-night' });
  });

  it.each(['2024-02-29', '2000-02-29', '2026-04-30', night])('accepts real date %s', date => {
    writeEvents([], date);
    expect(digest(date)).toEqual({ night: date, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('distinguishes missing file/directory from an empty file', () => {
    expect(readNight(runs, night)).toEqual({ kind: 'not-found' });
    expect(readNight(join(root, 'absent'), night)).toEqual({ kind: 'not-found' });
    writeEvents([]);
    expect(digest().rows).toEqual([]);
  });

  it('does not read directories or non-directory runs paths', () => {
    fs.mkdirSync(join(runs, `${night}.jsonl`));
    expect(readNight(runs, night)).toEqual({ kind: 'read-error' });
    fs.writeFileSync(join(root, 'file'), 'not a directory');
    expect(readNight(join(root, 'file'), night)).toEqual({ kind: 'read-error' });
  });

  it.each(['outside', 'inside', 'dangling'])('rejects %s file symlinks', target => {
    const path = target === 'inside' ? join(runs, 'other.jsonl') : join(root, 'outside.jsonl');
    if (target !== 'dangling') fs.writeFileSync(path, JSON.stringify(base));
    fs.symlinkSync(path, join(runs, `${night}.jsonl`));
    expect(readNight(runs, night)).toEqual({ kind: 'read-error' });
  });

  it('does not mask permission errors or disclose paths', () => {
    writeEvents([base]);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error(`private ${root}`), { code: 'EACCES' });
    });
    expect(readNight(runs, night)).toEqual({ kind: 'read-error' });
  });

  it('reads fresh data on each call without a cache', () => {
    writeEvents([base]);
    expect(digest().counts.ok).toBe(1);
    writeEvents([base, base]);
    expect(digest().counts.ok).toBe(2);
  });
});

describe('line validation', () => {
  const badFields: unknown[] = [null, [], 3, 'text', {},
    { ...base, at: undefined }, { ...base, at: 3 },
    { ...base, job: undefined }, { ...base, job: null }, { ...base, job: 1 },
    { ...base, job: '' }, { ...base, job: ' \t ' },
    { ...base, owner: undefined }, { ...base, owner: 1 }, { ...base, owner: '' }, { ...base, owner: '\t ' },
    { ...base, status: undefined }, { ...base, status: 'OK' }, { ...base, status: null },
    { ...base, error: null }, { ...base, error: 1 }, { ...base, error: {} }];
  it.each(badFields.map((value, index) => ({ value, index })))('counts invalid fields #$index', ({ value }) => {
    writeEvents([value, base]);
    expect(digest()).toMatchObject({ badLines: 1, counts: { ok: 1, retry: 0, fail: 0 } });
  });

  it.each(['2026-02-30T12:00:00Z', '2026-02-29T12:00:00+01:00', '1900-02-29T12:00:00Z',
    '2026-04-31T00:00:00Z', '2026-10-28T24:00:00Z', '2026-10-28T23:60:00Z',
    '2026-10-28T23:59:60Z', '2026-10-28T12:00:00+24:00', '2026-10-28T12:00:00+01:60',
    '2026-10-28T12:00:00', '2026-10-28', 'yesterday', '2026-10-28T12:00:00Z\n'])
  ('rejects invalid timestamp %j', at => {
    writeEvents([{ ...base, at }]);
    expect(digest()).toEqual({ night, rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it.each(['2024-02-29T12:00:00Z', '2000-02-29T12:00:00.123+05:30',
    '2026-10-29T00:00:00-03:30', '2026-10-28T12:00:00.0001Z'])('preserves valid timestamp %s', at => {
    writeEvents([{ ...base, at }]);
    expect(digest().rows[0]).toMatchObject({ firstAt: at, lastAt: at });
  });

  it('ignores blank lines/CRLF, counts malformed JSON and continues', () => {
    fs.writeFileSync(join(runs, `${night}.jsonl`), `\r\n \t\r\n{broken\r\n${JSON.stringify(base)}\r\n\r\n`);
    expect(digest()).toMatchObject({ badLines: 1, counts: { ok: 1, retry: 0, fail: 0 } });
  });

  it('distinguishes whitespace-only from all-invalid files', () => {
    fs.writeFileSync(join(runs, `${night}.jsonl`), '\n \t\r\n');
    expect(digest()).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    fs.writeFileSync(join(runs, `${night}.jsonl`), 'bad\nnull\n{}\n');
    expect(digest()).toEqual({ night, rows: [], badLines: 3, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('keeps original strings, null owner and empty error; ignores extra fields', () => {
    writeEvents([{ ...base, job: ' job with space ', owner: ' owner with space ', error: ' error \t', extra: {} },
      { ...base, job: 'nullable', owner: null, error: '' }]);
    expect(digest().rows).toEqual([
      { job: ' job with space ', owner: ' owner with space ', runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: ' error \t', firstAt: base.at, lastAt: base.at },
      { job: 'nullable', owner: null, runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: '', firstAt: base.at, lastAt: base.at },
    ]);
  });
});

describe('aggregation', () => {
  it('orders instants with offsets, groups by job, retains historical error/failure and latest null owner', () => {
    writeEvents([
      { ...base, at: '2026-10-29T03:00:00+01:00', owner: null },
      { ...base, at: '2026-10-29T02:00:00Z', status: 'ok', owner: null },
      { ...base, at: '2026-10-29T00:45:00Z', status: 'retry', error: 'newest error', owner: 'second' },
      { ...base, at: '2026-10-29T01:30:00+02:00', status: 'fail', error: 'old error' },
      { ...base, at: '2026-10-29T00:00:00Z', status: 'retry', owner: 'third' },
    ]);
    expect(digest()).toEqual({ night, badLines: 0, counts: { ok: 2, retry: 2, fail: 1 }, rows: [
      { job: 'job', owner: null, runs: 5, retries: 2, failures: 1, lastStatus: 'ok', lastError: 'newest error',
        firstAt: '2026-10-29T01:30:00+02:00', lastAt: '2026-10-29T02:00:00Z' },
    ] });
  });

  it('breaks equal-time ties by file order for first/last, owner and error', () => {
    writeEvents([
      { ...base, at: '2026-10-28T23:00:00.000+01:00', error: 'first' },
      { ...base, at: '2026-10-28T22:00:00Z', status: 'fail', owner: null, error: 'second' },
      { ...base, at: '2026-10-28T22:00:00.0Z', status: 'ok', owner: 'last' },
    ]);
    expect(digest().rows[0]).toEqual({ job: 'job', owner: 'last', runs: 3, retries: 0, failures: 1,
      lastStatus: 'ok', lastError: 'second', firstAt: '2026-10-28T23:00:00.000+01:00', lastAt: '2026-10-28T22:00:00.0Z' });
  });

  it('compares fractional instants without truncation to milliseconds', () => {
    writeEvents([
      { ...base, at: '2026-10-28T22:00:00.0002Z', owner: 'later', error: 'later' },
      { ...base, at: '2026-10-28T22:00:00.0001Z', owner: 'earlier', error: 'earlier' },
    ]);
    expect(digest().rows[0]).toMatchObject({ owner: 'later', lastError: 'later',
      firstAt: '2026-10-28T22:00:00.0001Z', lastAt: '2026-10-28T22:00:00.0002Z' });
  });

  it('counts duplicates and repeated successes, with null error when none was recorded', () => {
    writeEvents([base, base, { ...base, owner: null }]);
    expect(digest()).toEqual({ night, badLines: 0, counts: { ok: 3, retry: 0, fail: 0 }, rows: [
      { job: 'job', owner: null, runs: 3, retries: 0, failures: 0, lastStatus: 'ok', lastError: null,
        firstAt: base.at, lastAt: base.at },
    ] });
  });

  it('sorts jobs by Unicode codepoint without locale, preserving distinct keys', () => {
    writeEvents(['😀', '\uE000', 'ä', 'a', 'Z', '__proto__', 'constructor', 'a ', ' a'].map(job => ({ ...base, job })));
    expect(digest().rows.map(row => row.job)).toEqual([' a', 'Z', '__proto__', 'a', 'a ', 'constructor', 'ä', '\uE000', '😀']);
  });

  it('reads the real fixture without modifying it', () => {
    const result = readNight('runs', night);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected fixture digest');
    expect(result.digest.badLines).toBe(1);
    expect(result.digest.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result.digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.digest.rows[1]).toEqual({ job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      failures: 0, lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' });
  });
});
