import firebase from './gateways/firebase';
import kv from './gateways/kv';

async function handleRequest(callback: () => Promise<any>): Promise<Response> {
	try {
		const result = await callback();
		return new Response(result instanceof Object ? JSON.stringify(result) : 'OK', { status: 200 });
	} catch (error: any) {
		const status = error instanceof TypeError ? 400 : 500;
		return new Response(error.message ?? 'Unknown error', { status });
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const auth = await firebase.auth(request, env.BACKMESH_FIREBASE_KEY);
		if (auth instanceof Response) return auth;
		const uid = auth;
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter(part => part);

		// /v1/crud/${backmeshUid}/${name}
		const backmeshUid =	parts.at(2);
		if (uid != backmeshUid) {
			new Response('Invalid token', { status: 401 });
		}
		const name = parts.at(3);
		// /v1/crud/${backmeshUid} is also allowed
		if (name === undefined && request.method !== 'GET') {
			return new Response('Invalid pathname', { status: 500 });
		}
		switch (request.method) {
			case 'POST':
				if (!request.body) {
					return new Response('No body in request', { status: 500 });
				}
				return handleRequest(async () => kv.newApiProxy(env, uid, name!, await request.json()));

			case 'PUT':
				if (!request.body) {
					return new Response('No body in request', { status: 500 });
				}
				return handleRequest(async () => kv.newApiProxy(env, uid, name!, await request.json()));

			case 'GET':
				return handleRequest(async () => name === undefined ?
					kv.getAllApiProxies(env, uid) :
					kv.getApiProxy(env, uid, name!));

			case 'DELETE':
				return handleRequest(async () => kv.delApiProxy(env, uid, name!));

			default:
				return new Response('Not Found', { status: 404 });
		}
	},
};
