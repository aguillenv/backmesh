import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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
const geminiProxyInit = JSON.stringify({
	...JSON.parse(invalidProxyInit),
	apiPrivateKey: env.NIMBUS_GEMINI_API_KEY,
});
// TODO use supabase to test both
const openAIProxyInit = JSON.stringify({
	apiUrl: 'https://api.openai.com',
	apiReqHeader: 'Authorization',
	authPublicKey: testUserFirebaseKey,
	apiPrivateKey: env.NIMBUS_OPENAI_API_KEY,
	authAppId: 'nimbus-d5268',
	rateLimit: 20,
	rateLimitUnit: RateLimitUnit.MINUTE,
	authType: AuthProviderType.FIREBASE,
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
describe('Firebase + Gemini API Proxy Failed Creations', () => {
	it('fails to create proxy with no token', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: 'asdfsdf',
			},
			body: geminiProxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid token', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: 'asdfsdf',
			},
			body: geminiProxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid header field', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/', {
			method: 'POST',
			headers: {
				Authorizationnnnnn: testUserJwt,
			},
			body: geminiProxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid path', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/', {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: geminiProxyInit,
		});
		expect(response.status).toBe(401);
	});
	it('fails to create proxy with invalid uid', async () => {
		response = await SELF.fetch('https://example.com/v1/crud/backmeshUid', {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: geminiProxyInit,
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

describe('Firebase + OpenAI API Proxy user access control for files', () => {
	let fileId1stUser: string, fileId2ndUser: string;
	beforeAll(async () => {
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: openAIProxyInit,
		});
		expect(response.status).toBe(200);
		let data = (await response.json()) as ApiProxy;
		expect(data.id.length).toBeGreaterThan(0);
		expect(data.proxyUrl.length).toBeGreaterThan(0);
		expect(data.apiPrivateKey === '').toBe(true);
		proxyId = data.id;
		reqHeader = JSON.parse(openAIProxyInit)['apiReqHeader'];

		const body = (() => {
			const formData = new FormData();
			formData.append(
				'file',
				new Blob(['example content'], { type: 'text/plain' }),
				'example.txt',
			);
			formData.append('purpose', 'fine-tune');
			return formData;
		})();

		// 1st user creates file
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files`,
			{
				method: 'POST',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
				body,
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
		fileId1stUser = ((await response.json()) as any).id;

		// 2nd user creates file
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files`,
			{
				method: 'POST',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
				body,
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
		fileId2ndUser = ((await response.json()) as any).id;
	});
	afterAll(async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId2ndUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
	});

	it('forbids /batches which is not in whitelist', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/batches`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('1st user can get it directly', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('1st user can get contents', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}/content`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
	});

	it('1st user only list its files', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(200);
		let res: any[] = await response.json();
		expect(res.length).toBe(1);
	});

	it('2nd user only lists its files', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('2nd user fails to get contents', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}/contents`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		if (response.status !== 403)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(403);
	});

	it('2nd user fails to get it when listing files', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(200);
		let res: any = await response.json();
		expect(res.length).toBe(1);
	});

	it('2nd user cannot delete', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId1stUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		if (response.status !== 403)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(403);
	});

	it('1st user fails to get it', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId2ndUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('1st user cannot delete', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId2ndUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
				},
			},
		);
		if (response.status !== 403)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(403);
	});

	it('2nd user can get it', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId2ndUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('2nd user can get contents', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/files/${fileId2ndUser}/content`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
	});
});

describe('Firebase + OpenAI Proxy user access control for threads', async () => {
	let threadId1stUser: string, threadId2ndUser: string;
	beforeAll(async () => {
		// create proxy
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: openAIProxyInit,
		});
		expect(response.status).toBe(200);
		let data = (await response.json()) as ApiProxy;
		expect(data.id.length).toBeGreaterThan(0);
		expect(data.proxyUrl.length).toBeGreaterThan(0);
		expect(data.apiPrivateKey === '').toBe(true);
		proxyId = data.id;
		reqHeader = JSON.parse(openAIProxyInit)['apiReqHeader'];

		// 1st user creates thread
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads`,
			{
				method: 'POST',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
		threadId1stUser = ((await response.json()) as any).id;

		// 2nd user creates thread
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads`,
			{
				method: 'POST',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
		threadId2ndUser = ((await response.json()) as any).id;
	});

	afterAll(async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId2ndUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		if (response.status !== 200)
			console.error('Response body:', await response.text());
		expect(response.status).toBe(200);
	});

	it('1st user can get it directly', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('1st user can get messages', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}/messages`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('2nd user fails to get it directly', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('2nd user fails to get messages', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}/messages`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(403);
	});
	it('2nd user cannot delete', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId1stUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('1st user fails to get it', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId2ndUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('1st user cannot delete', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId2ndUser}`,
			{
				method: 'DELETE',
				headers: {
					[reqHeader]: `Bearer ${testUser1stUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(403);
	});

	it('2nd user can get it', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId2ndUser}`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
	});

	it('2nd user can get messages', async () => {
		response = await SELF.fetch(
			`https://example.com/v1/proxy/${testUserId}/${proxyId!}/v1/threads/${threadId2ndUser}/messages`,
			{
				method: 'GET',
				headers: {
					[reqHeader]: `Bearer ${testUser2ndUserJwt}`,
					'OpenAI-Beta': 'assistants=v2',
				},
			},
		);
		expect(response.status).toBe(200);
	});
});

describe('Firebase + Gemini API Proxy', () => {
	beforeAll(async () => {
		response = await SELF.fetch(`https://example.com/v1/crud/${testUserId}`, {
			method: 'POST',
			headers: {
				Authorization: testUserJwt,
			},
			body: geminiProxyInit,
		});
		expect(response.status).toBe(200);
		let data = (await response.json()) as ApiProxy;
		expect(data.id.length).toBeGreaterThan(0);
		expect(data.proxyUrl.length).toBeGreaterThan(0);
		expect(data.apiPrivateKey === '').toBe(true);
		proxyId = data.id;
		reqHeader = JSON.parse(geminiProxyInit)['apiReqHeader'];
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
