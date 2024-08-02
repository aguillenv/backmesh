import firebase from './gateways/firebase';
import kv from './gateways/kv';

export default {
	async proxy(request: Request, env: Env, ctx: ExecutionContext) {
		const auth = await firebase.auth(request, env);
		if (auth instanceof Response) return auth;
		const uid = auth;
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter(part => part);
		const proxyName =	parts.at(2); // account for /api/proxy/${proxyName}
		if (!proxyName) {
			return new Response('Invalid pathname', { status: 500 });
		}

		if (request.method === 'POST') {
			if (!request.body) {
				return new Response('No body in request', { status: 500 });
			}
			const requestBody = await request.json();
			try {
				await kv.setProxy(env, uid, proxyName, requestBody);
			} catch (error: any) {
				// Ensure error has a message property
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return new Response(errorMessage, { status: 400 });
			}
			return new Response('OK', { status: 200 });
		} else if (request.method === 'GET') {
			const proxy = await kv.getProxy(env, uid, proxyName);
			return new Response(JSON.stringify(proxy), { status: 200 });
		} else {
			return new Response('Not Found', { status: 404 });
		}
	},
};
