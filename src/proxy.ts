import firebase from './gateways/firebase';

export default {

	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const auth = await firebase.auth(request, env);
		if (auth instanceof Response) return auth;
		const uid = auth;

		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter(part => part);
		// Remove the first part
		if (parts.length > 0) {
			parts.shift();
		}
		const pathName = parts.join('/');
		const apiUrl = 'https://api.openai.com/' + pathName;

		const init = {
			method: request.method,
			headers: {
				'Authorization': `Bearer ${env.OPENAI_KEY}`,
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
