export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  /** Counts of valid events, retry events, and fail events respectively. */
  runs: number;
  retries: number;
  failures: number;
  lastStatus: RunStatus;
  /** The last recorded error, retained even after a later success. */
  lastError: string | null;
  /** Original log timestamps, including their offsets. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  /** A real YYYY-MM-DD date, validated at runtime. */
  night: string;
  /** Sorted deterministically by job. */
  rows: DigestRow[];
  badLines: number;
  /** Counts of events, not final job statuses. */
  counts: { ok: number; retry: number; fail: number };
};

/** An empty file is ok with empty rows and zero counts; a missing file is not-found. */
export type ReadNightResult =
  | { kind: 'ok'; digest: NightDigest }
  | { kind: 'invalid-night' }
  | { kind: 'not-found' }
  | { kind: 'read-error' };

export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
