import api from './api';
import proxy from './proxy';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api')) {
      return api.fetch(request, env, ctx);
    } else if (path.startsWith('/proxy')) {
      return proxy.fetch(request, env, ctx);
    } else {
      return new Response('Not Found', { status: 404 });
    }
  },
};