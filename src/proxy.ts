import firebase from './services/firebase';
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
		const apiProxy = await kv.getApiProxy(env, backmeshUid, apiProxyName);
		const auth = await firebase.auth(request, apiProxy.authPublicKey);
		if (auth instanceof Response) return auth;
		const pathName = parts.slice(2).join('/');
		const apiUrl =
			apiProxy.apiUrl + (apiProxy.apiUrl.endsWith('/') ? '' : '/') + pathName;

		const init = {
			method: request.method,
			headers: {
				Authorization: `Bearer ${apiProxy.apiPrivateKey}`,
				'Content-Type': 'application/json',
			},
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
