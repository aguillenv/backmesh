import firebase from './gateways/firebase';
import kv from './gateways/kv';

async function crud(request: Request, env: Env, uid: string, name: string) {
	switch (request.method) {
		case 'POST':
			// new
			if (!request.body) {
				return new Response('No body in request', { status: 500 });
			}
			const requestBody = await request.json();
			try {
				await kv.setApiProxy(env, uid, name, requestBody);
			} catch (error: any) {
				// Ensure error has a message property
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return new Response(errorMessage, { status: 400 });
			}
			return new Response('OK', { status: 200 });

		case 'GET':
			const proxy = await kv.getApiProxy(env, uid, name);
			return new Response(JSON.stringify(proxy), { status: 200 });

		case 'DELETE':
			await kv.delApiProxy(env, uid, name);
			return new Response('OK', { status: 200 });

		default:
			return new Response('Not Found', { status: 404 });
	}
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const auth = await firebase.auth(request, env.BACKMESH_FIREBASE_KEY);
		if (auth instanceof Response) return auth;
		const tokenUid = auth;
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter(part => part);

		// /v1/crud/${backmeshUid}/${name}
		const backmeshUid =	parts.at(2);
		if (tokenUid != backmeshUid) {
			new Response('Invalid token', { status: 401 });
		}
		const name =	parts.at(3);
		if (!name) {
			return new Response('Invalid pathname', { status: 500 });
		}
		return crud(request, env, tokenUid, name);
	},
};
