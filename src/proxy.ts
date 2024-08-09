import auth from './services/firebase';
import kv from './services/kv';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter((part) => part);
		// /v1/proxy/${backmeshUid}/${apiProxyName}/
		const backmeshUid = parts.at(2);
		const apiProxyName = parts.at(3);
		if (!backmeshUid || !apiProxyName) {
			return new Response('Invalid pathname', { status: 500 });
		}
		const apiProxy = await kv.getAdminApiProxy(env, backmeshUid, apiProxyName);
		const authHeader = auth.getAuthHeader(request, apiProxy.apiReqHeader);
		if (authHeader === null)
			return new Response('Missing or invalid Authorization header', {
				status: 401,
			});
		const uid = await auth.firebaseUidFromJwt(
			authHeader.extractedJwt,
			apiProxy.authPublicKey,
		);
		if (uid === null) return new Response('Invalid token', { status: 401 });
		const pathName = parts.slice(4).join('/');
		const apiUrl =
			apiProxy.apiUrl + (apiProxy.apiUrl.endsWith('/') ? '' : '/') + pathName;

		const init = {
			method: request.method,
			headers: auth.newProxyHeaders(request, authHeader, apiProxy.apiPrivateKey),
			body: await request.clone().text(),
		};

		const response = await fetch(apiUrl, init);

		if (!response.body) {
			return new Response('No body in response', { status: 500 });
		}

		let { readable, writable } = new TransformStream({
			transform(chunk, controller) {
				controller.enqueue(chunk);
			},
		});

		// Start pumping the body. NOTE: No await!
		response.body.pipeTo(writable);

		// ... and deliver our Response while that’s running.
		return new Response(readable, response);
	},
};
