import firebase from './gateways/firebase';
import kv from './gateways/kv';

async function proxy(request: Request, env: Env, uid: string, appName: string, proxyName: string) {
	switch (request.method) {
		case 'POST':
			// new proxy
			if (!request.body) {
				return new Response('No body in request', { status: 500 });
			}
			const requestBody = await request.json();
			try {
				await kv.setProxy(env, uid, appName, proxyName, requestBody);
			} catch (error: any) {
				// Ensure error has a message property
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return new Response(errorMessage, { status: 400 });
			}
			return new Response('OK', { status: 200 });

		case 'GET':
			const proxy = await kv.getProxy(env, uid, appName, proxyName);
			return new Response(JSON.stringify(proxy), { status: 200 });

		case 'DELETE':
			await kv.delProxy(env, uid, appName, proxyName);
			return new Response('OK', { status: 200 });

		default:
			return new Response('Not Found', { status: 404 });
	}
};

async function app(request: Request, env: Env, uid: string, appName: string) {
	switch (request.method) {
		case 'POST':
			// new app
			if (!request.body) {
				return new Response('No body in request', { status: 500 });
			}
			const requestBody = await request.json();
			try {
				await kv.setApp(env, uid, appName, requestBody);
			} catch (error: any) {
				// Ensure error has a message property
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return new Response(errorMessage, { status: 400 });
			}
			return new Response('OK', { status: 200 });

		case 'GET':
			const proxy = await kv.getApp(env, uid, appName);
			return new Response(JSON.stringify(proxy), { status: 200 });

		case 'DELETE':
			await kv.delApp(env, uid, appName);
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

		// /v1/api/${backmeshUid}/${appName}/${proxyName}
		const backmeshUid =	parts.at(2);
		if (tokenUid != backmeshUid) {
			new Response('Invalid token', { status: 401 });
		}
		const appName =	parts.at(3);
		if (!appName) {
			return new Response('Invalid pathname', { status: 500 });
		}
		const proxyName =	parts.at(4);
		if (!proxyName) {
			return app(request, env, tokenUid, appName);
		} else {
			return proxy(request, env, tokenUid, appName, proxyName);
		}
	},
};
