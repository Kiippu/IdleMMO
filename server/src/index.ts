import type { Env } from '../env';
import { route } from './router';

export { Guild } from './guild';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return route(request) ?? env.ASSETS.fetch(request);
  },

  // Weekly cron stub (see wrangler.jsonc triggers; cron is UTC).
  async scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('weekly cron fired', controller.cron, new Date(controller.scheduledTime).toISOString());
  },
} satisfies ExportedHandler<Env>;
