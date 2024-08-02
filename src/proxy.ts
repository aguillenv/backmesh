import firebase from './gateways/firebase';
import kv from './gateways/kv';

export default {

	async fetch(request: Request, env: Env, ctx: ExecutionContext) {

		const requestUrl = new URL(request.url);
		// get proxy name from url and fetch from KV
		const parts = requestUrl.pathname.split('/').filter(part => part);
		// /proxy/${uid}/${proxyName}
		const routeUid =	parts.at(1);
		const proxyName =	parts.at(2);
		if (!routeUid || !proxyName) {
			return new Response('Invalid pathname', { status: 500 });
		}
		const proxy = await kv.getProxy(env, routeUid, proxyName);
		const auth = await firebase.auth(request, proxy.authProviderPublicKey);
		if (auth instanceof Response) return auth;
		if (auth != routeUid) {
			new Response('Invalid token', { status: 401 });
		}
		const pathName = parts.slice(2).join('/');
		const apiUrl = proxy.apiUrl + (proxy.apiUrl.endsWith('/') ? '' : '/') + pathName;

		const init = {
			method: request.method,
			headers: {
				'Authorization': `Bearer ${proxy.privateApiKey}`,
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
