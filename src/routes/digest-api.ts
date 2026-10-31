import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/read-night.js';

export function registerDigestApi(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));
    if (result.kind === 'ok') return c.json(result.digest);
    const status = result.kind === 'invalid-night' ? 400 : result.kind === 'not-found' ? 404 : 500;
    return c.json({ error: { code: result.kind } }, status);
  });
}
