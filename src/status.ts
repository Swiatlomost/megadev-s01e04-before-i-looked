import { readdirSync } from 'node:fs';
import { readNight } from './digest/read-night.js';
import type { NightDigest } from './digest/types.js';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  nightSummaries: { night: string; counts: NightDigest['counts'] | null }[];
};

// Nights on disk = regular runs/<real YYYY-MM-DD>.jsonl files, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => {
        const match = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(entry.name);
        if (!entry.isFile() || !match) return false;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
      })
      .map((entry) => entry.name.slice(0, 10))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    nightSummaries: nights.map((night) => {
      const result = readNight(config.runsDir, night);
      return { night, counts: result.kind === 'ok' ? result.digest.counts : null };
    }),
  };
}
