export type AuthHeader = {
	field: string;
	value: string;
	extractedJwt: string;
};

export default {
	async firebaseUidFromJwt(
		token: string,
		publicFirebaseKey: string,
	): Promise<string | null> {
		const response = await fetch(
			`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${publicFirebaseKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					idToken: token,
				}),
			},
		);

		if (!response.ok) {
			console.error('Error verifying ID token:', response.statusText);
			return null;
		}

		// TODO import firebase types?
		interface FirebaseResponse {
			users?: { localId: string }[];
		}
		const data: FirebaseResponse = await response.json();
		return data && data.users && data.users.length > 0
			? data.users[0].localId
			: null;
	},

	getAuthHeader(request: Request, apiReqHeader: string): AuthHeader | null {
		const val = request.headers.get(apiReqHeader);
		if (!val) return null;
		const parts = val.split(' ');
		if (parts.length > 2) return null; // wtf
		return {
			field: apiReqHeader,
			value: val,
			extractedJwt: parts.length === 2 ? parts[1] : parts[0],
		};
	},

	newProxyHeaders(request: Request, header: AuthHeader, apiKey: string) {
		return {
			[header.field]: header.value.replace(header.extractedJwt, apiKey),
			...request.headers,
			'Content-Type': 'application/json',
		};
	},
};
