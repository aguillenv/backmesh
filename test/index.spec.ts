import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

import { firebaseUidFromJwt } from '../src/services/auth';
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

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Error response text:', errorText);
		throw new Error('Error verifying password: ' + response.statusText);
	}

	const data: any = await response.json();
	return data.idToken;
}

const backmeshFirebaseKey = 'AIzaSyBHz11i2YIYtMkKdLpj3QiiKD8UguTKyRo';

// nimbus is the backmesh test user
const testUserId = 'gbBbHCDBxqb8zwMk6dCio63jhOP2';
const testUserEmail = 'lfdepombo+backmesh@gmail.com';
const testUserFirebaseKey = 'AIzaSyBc8gRnTgkaiHq9LEyncmwvyU2YJ7EyBJE';
const testUserJwt = await getTokenFromFirebaseKey(
	backmeshFirebaseKey,
	testUserEmail,
	env.TEST_USER_PASS,
);

describe('Firebase Authentication UID <=> JWT Mapper', () => {
	it('properly auth user to get jwt and the use that jwt to get uid', async () => {
		const uid = await firebaseUidFromJwt(testUserJwt, backmeshFirebaseKey);
		expect(uid).toMatch(testUserId);
	});
});

// andnimbus has 2 users calling the proxy
const testUser1stUserEmail = 'lfdepombo+nimbus@gmail.com';
// const testUser1stUserId = 'L8krqnkRWPXcxjoocPrQh33xTmD3';
const testUser1stUserJwt = await getTokenFromFirebaseKey(
	testUserFirebaseKey,
	testUser1stUserEmail,
	env.TEST_USER_PASS,
);
console.log(testUser1stUserJwt);

const testUser2ndUserEmail = 'lfdepombo+nimbus2@gmail.com';
// const testUser2ndUserId = 'GTUe0voWDiSerEk9iJvv3q9W9Ur1';
const testUser2ndUserJwt = await getTokenFromFirebaseKey(
	testUserFirebaseKey,
	testUser2ndUserEmail,
	env.TEST_USER_PASS,
);

const invalidProxyInit = JSON.stringify({
	apiUrl: 'https://generativelanguage.googleapis.com',
	apiReqHeader: 'x-goog-api-key',
	authPublicKey: testUserFirebaseKey,
	authAppId: 'nimbus-d5268',
	rateLimit: 2,
	rateLimitUnit: RateLimitUnit.MINUTE,
	authType: AuthProviderType.FIREBASE,
});
const proxyInit = JSON.stringify({
	...JSON.parse(invalidProxyInit),
	apiPrivateKey: env.NIMBUS_GEMINI_API_KEY,
});

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

let response, proxyId, reqHeader: string;
describe('Firebase + Gemini API Proxy Failed Creaties', () => {
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
				Authorizationnnnnn: testUserJwt,
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid path', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/', {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
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
				Authorization: testUserJwt,
			},
			body: proxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create a proxy without private key', async () => {
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: invalidProxyInit,
		});
		expect(response.status).toBe(400);
	});
});

describe('Firebase + Gemini API Proxy', () => {
	beforeEach(async () => {
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: proxyInit,
		});
		expect(response.status).toBe(200);
		let data = (await response.json()) as ApiProxy;
		expect(data.id.length).toBeGreaterThan(0);
		expect(data.proxyUrl.length).toBeGreaterThan(0);
		expect(data.apiPrivateKey === '').toBe(true);
		proxyId = data.id;
		reqHeader = JSON.parse(proxyInit)['apiReqHeader'];
	});

	it('bad path', async () => {
		response = await SELF.fetch(`https://example.com/v1/proxy/${testUserId}`, {
			method: 'GET',
			headers: {
				[reqHeader]: testUser1stUserJwt,
			},
		});
		expect(response.status).toBe(400);
	});

	it('bad token', async () => {
		response = await SELF.fetch(`https://example.com/v1/proxy/${testUserId}`, {
			method: 'GET',
			headers: {
				[reqHeader]: testUserJwt,
			},
		});
		expect(response.status).toBe(400);
	});

	it('not using proxy header', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}`,
			{
				method: 'GET',
				headers: {
					InvalidHeader: testUser1stUserJwt,
				},
			},
		);
		expect(response.status).toBe(401);
	});

	it('rate limits correctly', async () => {
		// not a valid path in proxy
		// but counts towards rate limit as 1st request for 1st user
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: testUser1stUserJwt,
				},
			},
		);
		expect(response.status).toBe(404);

		// 2nd request for 1st user to proxy
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1beta/models/gemini-pro`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: testUser1stUserJwt,
				},
			},
		);
		expect(response.status).toBe(200);

		// 3rd request for 1st user should rate limit
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1beta/models/gemini-pro`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: testUser1stUserJwt,
				},
			},
		);
		expect(response.status).toBe(429);

		// but 1st request for 2nd user should go through
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1beta/models/gemini-pro`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: testUser2ndUserJwt,
				},
			},
		);
		expect(response.status).toBe(200);

		// Wait for 60 seconds before making the next request for the 1st user
		const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
		await wait(60000);

		// now the next request for 1st user should not rate limit
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1beta/models/gemini-pro`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: testUser1stUserJwt,
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('delete without proxy id fails', async () => {
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'DELETE',
			headers: {
				Authorization: testUserJwt,
			},
		});
		expect(response.status).toBe(400);
	});
	it('successfully deletes proxy', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/crud/${testUserId}/${proxyId!}`,
			{
				method: 'DELETE',
				headers: {
					Authorization: testUserJwt,
				},
			},
		);
		expect(response.status).toBe(200);
	});
});
