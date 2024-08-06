import crud from './crud';
import proxy from './proxy';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/v1/crud')) {
      return crud.fetch(request, env, ctx);
    } else if (path.startsWith('/v1/proxy')) {
      return proxy.fetch(request, env, ctx);
    }
    return new Response('Not Found', { status: 404 });
  },
};