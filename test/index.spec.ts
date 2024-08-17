// test/index.spec.ts
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

import { ApiProxy, AuthProviderType, RateLimitUnit } from '../src/services/kv';

async function getTokenFromFirebaseKey(
	publicFirebaseKey: string,
	email: string,
	password: string,
): Promise<string> {
	const response = await fetch(
		`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${publicFirebaseKey}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				email: email,
				password: password,
				returnSecureToken: true,
			}),
		},
	);

	console.log('Response status:', response.status);
	if (!response.ok) {
		const errorText = await response.text();
		console.error('Error response text:', errorText);
		throw new Error('Error verifying password: ' + response.statusText);
	}

	const data: any = await response.json();
	return data.idToken;
}

describe('Bad proxy requests', () => {
	it('invalid proxy path', async () => {
		let response = await SELF.fetch('https://example.com/v1/proxy/', {
			method: 'POST',
			body: '{}',
		});
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Invalid pathname');
	});
	it('not found headers', async () => {
		let response = await SELF.fetch(
			'https://example.com/v1/proxy/asdfasdf/asdfsadf',
			{
				method: 'POST',
				body: '{}',
			},
		);
		expect(response.status).toBe(404);
	});
});

const backmeshFirebaseKey = 'AIzaSyBHz11i2YIYtMkKdLpj3QiiKD8UguTKyRo';
const backmeshTestUserId = 'gbBbHCDBxqb8zwMk6dCio63jhOP2';
const nimbusFirebaseKey = 'AIzaSyBc8gRnTgkaiHq9LEyncmwvyU2YJ7EyBJE';
const backmeshJwt = await getTokenFromFirebaseKey(
	backmeshFirebaseKey,
	'lfdepombo+backmesh@gmail.com',
	env.TEST_USER_PASS,
);
const nimbusJwt = await getTokenFromFirebaseKey(
	nimbusFirebaseKey,
	'lfdepombo+nimbus@gmail.com',
	env.TEST_USER_PASS,
);
const invalidProxyInit = JSON.stringify({
	apiUrl: 'https://generativelanguage.googleapis.com',
	apiReqHeader: 'x-goog-api-key',
	authPublicKey: nimbusFirebaseKey,
	authAppId: 'nimbus-d5268',
	rateLimit: 10,
	rateLimitUnit: RateLimitUnit.MINUTE,
	authType: AuthProviderType.FIREBASE,
});
const proxyInit = JSON.stringify({
	...JSON.parse(invalidProxyInit),
	apiPrivateKey: env.NIMBUS_GEMINI_API_KEY,
});

describe('API Proxy Firebase + Gemini', () => {
	let response, proxyId, proxyUrl, reqHeader;
	it('fails to create proxy with no token', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: 'asdfsdf',
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid token', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: 'asdfsdf',
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid header field', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/', {
			method: 'POST',
			headers: {
				Authorizationnnnnn: backmeshJwt,
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid path', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/', {
			method: 'POST',
			headers: {
				Authorization: backmeshJwt,
			},
			body: proxyInit,
		});
		console.log(await response.text());
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid uid', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: backmeshJwt,
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create a proxy without private key', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/crud/${backmeshTestUserId}`,
			{
				method: 'POST',
				headers: {
					Authorization: backmeshJwt,
				},
				body: invalidProxyInit,
			},
		);
		expect(response.status).toBe(400);
	});
	it('creates and uses a new proxy', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/crud/${backmeshTestUserId}`,
			{
				method: 'POST',
				headers: {
					Authorization: backmeshJwt,
				},
				body: proxyInit,
			},
		);
		expect(response.status).toBe(200);
		let data = (await response.json()) as ApiProxy;
		expect(data.id.length).toBeGreaterThan(0);
		expect(data.proxyUrl.length).toBeGreaterThan(0);
		expect(data.apiPrivateKey === '').toBe(true);
		proxyUrl = data.proxyUrl;
		proxyId = data.id;
		reqHeader = JSON.parse(proxyInit)['apiReqHeader'];

		// bad path
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${backmeshTestUserId}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: nimbusJwt,
				},
			},
		);
		expect(response.status).toBe(400);

		// bad token
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${backmeshTestUserId}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: backmeshJwt,
				},
			},
		);
		expect(response.status).toBe(400);

		// not using proxy header
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${backmeshTestUserId}/${proxyId!}`,
			{
				method: 'GET',
				headers: {
					InvalidHeader: nimbusJwt,
				},
			},
		);
		expect(response.status).toBe(401);

		// not a valid path in proxy
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${backmeshTestUserId}/${proxyId!}/`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: nimbusJwt,
				},
			},
		);
		expect(response.status).toBe(404);

		response = await SELF.fetch(
			`https://example.com/v1/proxy/${backmeshTestUserId}/${proxyId!}/v1beta/models/gemini-pro`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: nimbusJwt,
				},
			},
		);
		expect(response.status).toBe(200);
	});
});
