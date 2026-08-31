import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';

export const schedulerRoutes = new Hono();

/**
 * Daily task, declared in `devvit.json` with `cron: "0 0 * * *"` (UTC).
 * Creates the post for the new UTC day. Filled in by the daily service.
 */
schedulerRoutes.post('/daily', async (c) => {
  const input = await c.req.json<TaskRequest>();
  console.log(`[daily] task "${input.name}" fired at ${new Date().toISOString()}`);
  return c.json<TaskResponse>({}, 200);
});
