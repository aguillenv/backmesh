/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {

	async getFirebaseUid(env: Env, idToken: string) {
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.BACKMESH_FIREBASE_KEY}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				idToken
			})
		});

		if (!response.ok) {
			console.error('Error verifying ID token:', response.statusText);
			return false;
		}

		// TODO import firebase types?
		interface FirebaseResponse {
			users?: { localId: string }[];
		}
		const data: FirebaseResponse = await response.json();
		return data && data.users && data.users.length > 0 ? data.users[0].localId : undefined;
	},

	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// Extract the ID token from the Authorization header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return new Response('Missing or invalid Authorization header', { status: 401 });
		}

		const idToken = authHeader.split(' ')[1];
		const uid = await this.getFirebaseUid(env, idToken);

		if (uid === undefined) {
			return new Response('Invalid Firebase ID token', { status: 401 });
		}

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
