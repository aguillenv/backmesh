import auth from './services/auth';
import kv from './services/kv';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter((part) => part);
		// /v1/proxy/${backmeshUid}/${apiProxyName}/
		const backmeshUid = parts.at(2);
		const apiProxyName = parts.at(3);
		if (!backmeshUid || !apiProxyName) {
			return new Response('Invalid pathname', { status: 400 });
		}
		let apiProxy;
		try {
			apiProxy = await kv.getAdminApiProxy(env, backmeshUid, apiProxyName);
		} catch (error: any) {
			console.error(error);
			const status = error instanceof TypeError ? 404 : 500;
			return new Response(error.message ?? 'Unknown error', { status });
		}
		const authHeader = auth.getAuthHeader(request, apiProxy.apiReqHeader);
		if (authHeader === null)
			return new Response('Missing or invalid Authorization header', {
				status: 401,
			});
		const uid = await auth.getUidFromJwt(authHeader.extractedJwt, apiProxy);
		if (uid === null) return new Response('Invalid token', { status: 401 });
		const rateLimit = await kv.rateLimit(env, backmeshUid, apiProxy, uid);
		if (rateLimit)
			return new Response('Backmesh request limit exceeded', { status: 429 });
		const pathName = parts.slice(4).join('/');
		let apiUrl =
			apiProxy.apiUrl + (apiProxy.apiUrl.endsWith('/') ? '' : '/') + pathName;
		// Add existing query parameters
		if (requestUrl.searchParams.size > 0) {
			const url = new URL(apiUrl);
			url.search = requestUrl.search;
			apiUrl = url.toString();
		}

		const init: RequestInit = {
			method: request.method,
			headers: auth.newProxyHeaders(request, authHeader, apiProxy.apiPrivateKey),
		};

		// GET and HEAD requests do not have a body
		if (request.body) {
			init.body = await request.clone().text();
		}

		const response = await fetch(apiUrl, init);

		if (!response.body) {
			return new Response('No body in response', { status: 500 });
		}

		const { readable, writable } = new TransformStream();

		// Start pumping the body. NOTE: No await!
		response.body.pipeTo(writable);

		// ... and deliver our Response while that’s running.
		return new Response(readable, response);
	},
};
