import api from './api';
import proxy from './proxy';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/proxy')) {
      return api.proxy(request, env, ctx);
    } else if (path.startsWith('/api/rule')) {
      // return api.rule(request, env, ctx);
      return new Response('Not Implemented', { status: 501 });
    } else if (path.startsWith('/proxy')) {
      return proxy.fetch(request, env, ctx);
    }
    return new Response('Not Found', { status: 404 });
  },
};