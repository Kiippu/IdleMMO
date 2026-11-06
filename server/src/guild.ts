import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

/** Stub: one Durable Object per guild/crew (treasury, raid state). */
export class Guild extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return Response.json({ guild: this.ctx.id.toString(), stub: true });
  }
}
