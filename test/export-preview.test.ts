import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const dirs: string[] = [];
const script = resolve('scripts/export-preview.ts');
const env = { ...process.env };
delete env.LANE_MARKER;
function temp() { const dir = mkdtempSync(join(tmpdir(), 'rig-export-')); dirs.push(dir); return dir; }
function run(args: string[], marker?: string, cwd = process.cwd()) {
  return spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd, env: marker ? { ...env, LANE_MARKER: marker } : env, encoding: 'utf8',
  });
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('preview export', () => {
  for (const marker of ['TEST-EXPORT-MARKER', undefined]) {
    it(`exports exactly the handler response (${marker ? 'review' : 'clean'})`, async () => {
      const out = join(temp(), 'out');
      const result = run(['--out-dir', out], marker);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('TEST-EXPORT-MARKER');
      expect(result.stderr).not.toContain('TEST-EXPORT-MARKER');
      const old = process.env.LANE_MARKER;
      if (marker) process.env.LANE_MARKER = marker; else delete process.env.LANE_MARKER;
      try {
        const response = await createApp(loadConfig()).request('/digest/2026-10-28');
        const html = readFileSync(join(out, 'index.html'), 'utf8');
        expect(html).toBe(await response.text());
        expect(html).toContain('fixtures/refresh');
        expect(html).toContain('notes/backup');
        expect(html).toContain(marker ?? 'no marker set');
        expect(readdirSync(out)).toEqual(['index.html']);
      } finally {
        if (old === undefined) delete process.env.LANE_MARKER; else process.env.LANE_MARKER = old;
      }
    });
  }
  it('requires an output directory and writes nothing', () => {
    const dir = temp();
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    const result = run([], undefined, dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Preview export failed');
    expect(readdirSync(dir)).toEqual(['node_modules']);
  });
  it('does not write an error page if the handler cannot find the night', () => {
    const dir = temp();
    // A valid config pointing at an empty runs directory produces a real 404.
    const config = JSON.stringify({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir: dir });
    writeFileSync(join(dir, 'rig.json'), config);
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    const out = join(dir, 'out');
    const result = run(['--out-dir', out], undefined, dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Preview export failed');
    expect(readdirSync(dir).sort()).toEqual(['node_modules', 'rig.json']);
  });
});
