import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNightResult, RunStatus } from './types.js';

function isNight(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

type Instant = { seconds: number; fraction: string };

function parseInstant(value: string): Instant | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[0] !== value || !isNight(match[1])) return null;
  const [, date, hour, minute, second, fraction = '', offset] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return null;
  const seconds = Date.parse(`${date}T${hour}:${minute}:${second}${offset}`) / 1000;
  if (!Number.isFinite(seconds)) return null;
  // Keep sub-millisecond precision; removing trailing zeroes also makes equal fractions tie.
  return { seconds, fraction: fraction.replace(/0+$/, '') };
}

type Event = {
  at: string;
  instant: Instant;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isNonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseEvent(line: string): Event | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.at !== 'string' || !isNonblank(data.job)) return null;
  if (data.owner !== null && !isNonblank(data.owner)) return null;
  if (data.status !== 'ok' && data.status !== 'retry' && data.status !== 'fail') return null;
  if ('error' in data && typeof data.error !== 'string') return null;
  const instant = parseInstant(data.at);
  if (!instant) return null;
  return {
    at: data.at, instant, job: data.job, owner: data.owner, status: data.status,
    ...(typeof data.error === 'string' ? { error: data.error } : {}),
  };
}

function readSource(runsDir: string, night: string): string | ReadNightResult {
  let opening = true;
  try {
    // Resolve the directory, not the file: never follow a log-file symlink.
    const directory = realpathSync(runsDir);
    const fd = openSync(join(directory, `${night}.jsonl`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    opening = false;
    try {
      // NONBLOCK avoids hanging on a FIFO before we can reject its file type.
      if (!fstatSync(fd).isFile()) return { kind: 'read-error' };
      return readFileSync(fd, 'utf8');
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    const missing = opening && typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
    return { kind: missing ? 'not-found' : 'read-error' };
  }
}

function compareInstants(a: Instant, b: Instant): number {
  return a.seconds - b.seconds || (a.fraction < b.fraction ? -1 : a.fraction > b.fraction ? 1 : 0);
}

function compareJobs(a: DigestRow, b: DigestRow): number {
  const left = Array.from(a.job, char => char.codePointAt(0)!);
  const right = Array.from(b.job, char => char.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

export function readNight(runsDir: string, night: string): ReadNightResult {
  if (!isNight(night)) return { kind: 'invalid-night' };
  const source = readSource(runsDir, night);
  if (typeof source !== 'string') return source;
  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: Event[] = [];
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else digest.badLines++;
  }
  // Array.sort is stable: equal instants retain their original file order.
  events.sort((a, b) => compareInstants(a.instant, b.instant));
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status]++;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }
  digest.rows = [...rows.values()].sort(compareJobs);
  return { kind: 'ok', digest };
}
