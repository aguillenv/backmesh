export default {

	async auth(request: Request, publicFirebaseKey: string): Promise<string | Response> {
		// Extract the ID token from the Authorization header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return new Response('Missing or invalid Authorization header', { status: 401 });
		}

		const idToken = authHeader.split(' ')[1];
		const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${publicFirebaseKey}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				idToken
			})
		});

    const invalidTokResp = new Response('Invalid token', { status: 401 });

		if (!response.ok) {
			console.error('Error verifying ID token:', response.statusText);
			return invalidTokResp;
		}

		// TODO import firebase types?
		interface FirebaseResponse {
			users?: { localId: string }[];
		}
		const data: FirebaseResponse = await response.json();
		return (data && data.users && data.users.length > 0) ? data.users[0].localId : invalidTokResp;
	},
};