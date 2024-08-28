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

		// v1/assistants, v1/vector_stores and v1/fine_tuning can be added as private endpoints
		// whitelist of routes supported until someone complains and then understand their use case
		const pathParts = pathName.split('/');
		const route = pathParts[1];
		if (apiProxy.apiUrl.startsWith('https://api.openai.com')) {
			const allowedPaths = [
				'audio',
				'chat',
				'models',
				'images',
				'moderations',
				'files', // private ones
				'threads', // private ones
			];
			if (!allowedPaths.some((path) => route === path)) {
				return new Response('Forbidden', { status: 403 });
			}
		}

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

		let response = null;

		const { readable, writable } = new TransformStream();

		// TODO support /v1/uploads and resulting file created
		if (apiProxy.apiUrl.startsWith('https://api.openai.com')) {
			if (route === 'files' || route === 'threads') {
				if (request.method === 'POST') {
					// parse response without consuming original
					response = await fetch(apiUrl, init);
					const jsonResponse: any = await response.clone().json();
					const resourceId = jsonResponse.id;
					await kv.newUserResource(env, {
						backmeshUid,
						proxyId: apiProxy.id,
						uid,
						resourceId,
					});
					// Files API
					// ---------
					// DELETE or GET with id
					// v1/files/${fileId}
					// or GET contents
					// v1/files/${fileId}/content
					//
					// Threads API
					// -----------
					// DELETE or GET with id plus any action on it
					// v1/threads/${threadId}/...
				} else if (pathParts.length === 3 || pathParts.length === 4) {
					const resourceId = pathParts[2];
					const isOwner = await kv.isUserResource(env, {
						backmeshUid,
						proxyId: apiProxy.id,
						uid,
						resourceId,
					});
					if (!isOwner) return new Response('Forbidden', { status: 403 });
					// GET v1/files lists all files
					// parse response, grab id and set in KV
				} else if (
					request.method === 'GET' &&
					pathParts.length === 2 &&
					route === 'files'
				) {
					// parse response and filter files that do not belong to this user
					// assumes JSON
					response = await fetch(apiUrl, init);
					const jsonResponse: any = await response.clone().json();
					const filteredResponse = await Promise.all(
						(jsonResponse.data as any[]).map(async (file) => {
							const isOwner = await kv.isUserResource(env, {
								backmeshUid,
								proxyId: apiProxy.id,
								uid,
								resourceId: file.id,
							});
							return isOwner ? file : null;
						}),
					).then((results) => results.filter((file) => file !== null));
					const writer = writable.getWriter();
					writer.write(new TextEncoder().encode(JSON.stringify(filteredResponse)));
					writer.close();

					return new Response(readable, response);
				}
			}
		}

		if (!response) {
			response = await fetch(apiUrl, init);
		}

		if (!response.body) {
			return new Response('No body in response', { status: 500 });
		}
		// Start pumping the body. NOTE: No await!
		response.body.pipeTo(writable);

		// ... and deliver our Response while that’s running.
		return new Response(readable, response);
	},
};
