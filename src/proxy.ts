import firebase from './gateways/firebase';
import kv from './gateways/kv';

export default {

	async fetch(request: Request, env: Env, ctx: ExecutionContext) {

		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter(part => part);
		// /v1/proxy/${backmeshUid}/${appName}/${proxyName}/
		const backmeshUid =	parts.at(2);
		const appName =	parts.at(3);
		const proxyName =	parts.at(4);
		if (!backmeshUid || !proxyName || !appName) {
			return new Response('Invalid pathname', { status: 500 });
		}
		const apiProxy = await kv.getApiProxy(env, backmeshUid, appName);
		const auth = await firebase.auth(request, apiProxy.authPublicKey);
		if (auth instanceof Response) return auth;
		const pathName = parts.slice(2).join('/');
		const apiUrl = apiProxy.apiUrl + (apiProxy.apiUrl.endsWith('/') ? '' : '/') + pathName;

		const init = {
			method: request.method,
			headers: {
				'Authorization': `Bearer ${apiProxy.privateApiKey}`,
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
			}
		});

		// Start pumping the body. NOTE: No await!
		response.body.pipeTo(writable);

		// ... and deliver our Response while that’s running.
		return new Response(readable, response);
	}
};
