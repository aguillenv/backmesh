import firebase from './gateways/firebase';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const auth = await firebase.auth(request, env);
		if (auth instanceof Response) return auth;
		const uid = auth;
		return new Response(`Hello Api!`);
	},
};
