import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api.ts';
import { menu } from './routes/menu.ts';
import { schedulerRoutes } from './routes/scheduler.ts';
import { triggers } from './routes/triggers.ts';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/scheduler', schedulerRoutes);
internal.route('/triggers', triggers);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
