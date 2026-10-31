import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { nightsOnDisk } from '../src/status.js';

it('lists named nights newest first and handles a missing directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nights-'));
  try {
    writeFileSync(join(dir, '2026-10-28.jsonl'), '');
    writeFileSync(join(dir, '2026-10-29.jsonl'), '');
    writeFileSync(join(dir, 'other.txt'), '');
    expect(nightsOnDisk(dir)).toEqual(['2026-10-29', '2026-10-28']);
    expect(nightsOnDisk(join(dir, 'missing'))).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it('accepts only regular files with real dates and surfaces directory errors', async () => {
  const { mkdirSync, symlinkSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'nights-'));
  try {
    for (const name of ['2024-02-29.jsonl', '2023-02-29.jsonl', '2026-04-31.jsonl', '2026-13-01.jsonl']) writeFileSync(join(dir, name), '');
    mkdirSync(join(dir, '2026-10-29.jsonl'));
    symlinkSync(join(dir, '2024-02-29.jsonl'), join(dir, '2026-10-28.jsonl'));
    expect(nightsOnDisk(dir)).toEqual(['2024-02-29']);
    expect(() => nightsOnDisk(join(dir, '2024-02-29.jsonl'))).toThrow();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
