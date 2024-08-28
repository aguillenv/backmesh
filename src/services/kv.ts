import { decrypt, encrypt } from './crypto';

export enum AuthProviderType {
	FIREBASE = 'Firebase',
	SUPABASE = 'Supabase',
}

export enum ApiProxySchemaVersion {
	V1 = 'V1',
}

export enum RateLimitUnit {
	MINUTE = 'minute',
	HOUR = 'hour',
	DAY = 'day',
	MONTH = 'month',
}

function getRateLimitUnitInSecs(unit: RateLimitUnit): number {
	switch (unit) {
		case RateLimitUnit.MINUTE:
			return 60;
		case RateLimitUnit.HOUR:
			return 3600;
		case RateLimitUnit.DAY:
			return 86400;
		case RateLimitUnit.MONTH:
			return 2592000; // Assuming 30 days in a month
		default:
			throw new Error('Invalid RateLimitUnit');
	}
}

// TODO use URLs to validate here or in front
export type ApiProxy = {
	id: string;
	authPublicKey: string;
	authType: AuthProviderType;
	apiUrl: string;
	apiPrivateKey: string;
	schemaVersion: ApiProxySchemaVersion;
	proxyUrl: string;
	apiReqHeader: string;
	rateLimitUnit: RateLimitUnit;
	rateLimit: number;
	authAppId: string;
};

// Type guard to check if an object is of type ApiProxy at runtime
function assertApiProxy(obj: any): obj is ApiProxy {
	if (!obj.schemaVersion) {
		obj.schemaVersion = ApiProxySchemaVersion.V1;
	}

	if (typeof obj !== 'object' || obj === null) {
		throw new TypeError('Object is not valid');
	}
	if (typeof obj.authPublicKey !== 'string') {
		throw new TypeError('authPublicKey is not a string');
	}
	if (typeof obj.apiReqHeader !== 'string') {
		throw new TypeError('apiReqHeader is not a string');
	}
	if (typeof obj.id !== 'string') {
		throw new TypeError('id is not a string');
	}
	if (typeof obj.proxyUrl !== 'string') {
		throw new TypeError('proxyUrl is not a string');
	}
	if (typeof obj.apiUrl !== 'string') {
		throw new TypeError('apiUrl is not a string');
	}
	if (typeof obj.authAppId !== 'string') {
		throw new TypeError('authAppId is not a string');
	}
	if (typeof obj.apiPrivateKey !== 'string') {
		throw new TypeError('apiPrivateKey is not a string');
	}
	if (!Object.values(AuthProviderType).includes(obj.authType)) {
		throw new TypeError('authType is not valid');
	}
	if (!Object.values(ApiProxySchemaVersion).includes(obj.schemaVersion)) {
		throw new TypeError('schemaVersion is not valid');
	}
	if (!Object.values(RateLimitUnit).includes(obj.rateLimitUnit)) {
		throw new TypeError('rateLimitUnit is not valid');
	}
	if (typeof obj.rateLimit !== 'number' || obj.rateLimit < 0) {
		throw new TypeError('rateLimit is not valid');
	}
	return true;
}

async function create<T>(env: Env, key: string, value: T) {
	const curr = await env.BACKMESH_KV.get(key);
	if (curr !== null) {
		throw new TypeError(`New ${key}, but it already exists`);
	}
	const jsonValue = JSON.stringify(value);
	await env.BACKMESH_KV.put(key, jsonValue);
}

async function edit<T>(
	env: Env,
	key: string,
	value: T,
	immutableFields: Array<string>,
) {
	const curr = await env.BACKMESH_KV.get(key);
	if (curr === null) throw new TypeError(`No value to edit for key: ${key}`);
	const currVal = JSON.parse(curr);
	const newValue = value as any;
	for (const field of immutableFields) {
		if (currVal[field] !== newValue[field]) {
			throw new TypeError(`Field '${field}' is immutable and cannot be changed`);
		}
	}
	// Use current value if the new value is empty
	// needed to preserve private api key on updates
	for (const field in currVal) {
		if (newValue[field] === undefined || newValue[field] === '') {
			newValue[field] = currVal[field];
		}
	}
	const jsonValue = JSON.stringify(value);
	await env.BACKMESH_KV.put(key, jsonValue);
}

async function get<T>(env: Env, key: string): Promise<T> {
	const value = await env.BACKMESH_KV.get(key);
	if (value === null) throw new TypeError(`No value for key: ${key}`);
	return JSON.parse(value) as T;
}

async function del(env: Env, key: string) {
	const curr = await env.BACKMESH_KV.get(key);
	if (curr === null) throw new TypeError(`No value to delete for key: ${key}`);
	await env.BACKMESH_KV.delete(key);
}

function generateId(length: number = 20): string {
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

function isValidStr(testStr: string) {
	return typeof testStr === 'string' && testStr.trim() !== '';
}

function getProxyKey(backmeshUid: string, id: string) {
	return `${backmeshUid}/proxies/${id}`;
}

function getProxiesKey(backmeshUid: string) {
	return `${backmeshUid}/proxies/`;
}

function getRateLimitKey(
	backmeshUid: string,
	id: string,
	uid: string,
	windowStart: number,
) {
	return `${getProxyKey(backmeshUid, id)}/users/${uid}/rateLimit/${windowStart}`;
}

// the key that maps to uid that owns this resource
function getPrivateResourceKey(
	backmeshUid: string,
	proxyId: string,
	resourceId: string,
) {
	return `${backmeshUid}/proxies/${proxyId}/resource/${resourceId}`;
}

export default {
	async newApiProxy(env: Env, backmeshUid: string, value: any): Promise<ApiProxy> {
		const id = generateId();
		value.id = id;
		value.proxyUrl = `https://edge.backmesh.com/v1/proxy/${backmeshUid}/${id}`;
		if (!isValidStr(value.apiPrivateKey)) {
			throw new TypeError('apiPrivateKey is not a valid string');
		}
		value.apiPrivateKey = await encrypt(value.apiPrivateKey, env.PASSWORD);
		assertApiProxy(value);
		await create<ApiProxy>(env, getProxyKey(backmeshUid, id), value);
		// do not return private key
		value.apiPrivateKey = '';
		return value;
	},

	async editApiProxy(
		env: Env,
		backmeshUid: string,
		id: string,
		value: any,
	): Promise<ApiProxy> {
		assertApiProxy(value);
		// user is trying to set a new one
		if (isValidStr(value.apiPrivateKey)) {
			value.apiPrivateKey = await encrypt(value.apiPrivateKey, env.PASSWORD);
		}
		await edit<ApiProxy>(env, getProxyKey(backmeshUid, id), value, [
			'id',
			'proxyUrl',
		]);
		// do not return private key
		value.apiPrivateKey = '';
		return value;
	},

	async getApiProxy(env: Env, backmeshUid: string, id: string) {
		const key = getProxyKey(backmeshUid, id);
		const proxy = await get<ApiProxy>(env, key);
		assertApiProxy(proxy);
		proxy.apiPrivateKey = '';
		return proxy;
	},

	async getAdminApiProxy(env: Env, backmeshUid: string, id: string) {
		const key = getProxyKey(backmeshUid, id);
		const proxy = await get<ApiProxy>(env, key);
		proxy.apiPrivateKey = await decrypt(proxy.apiPrivateKey, env.PASSWORD);
		assertApiProxy(proxy);
		return proxy;
	},

	async getAllApiProxies(env: Env, backmeshUid: string): Promise<ApiProxy[]> {
		const entries = await env.BACKMESH_KV.list({
			prefix: getProxiesKey(backmeshUid),
		});

		const proxyPromises = entries.keys.map(async (key) => {
			const proxy = await get<ApiProxy>(env, key.name);
			assertApiProxy(proxy);
			proxy.apiPrivateKey = '';
			return proxy;
		});

		return Promise.all(proxyPromises);
	},

	async delApiProxy(env: Env, backmeshUid: string, id: string) {
		console.log('delApiProxy');
		const key = getProxyKey(backmeshUid, id);
		await del(env, key);
	},

	async newUserResource(
		env: Env,
		{
			backmeshUid,
			proxyId,
			uid,
			resourceId,
		}: {
			backmeshUid: string;
			proxyId: string;
			uid: string;
			resourceId: string;
		},
	) {
		const key = getPrivateResourceKey(backmeshUid, proxyId, resourceId);
		await env.BACKMESH_KV.put(key, uid);
	},

	async isUserResource(
		env: Env,
		{
			backmeshUid,
			proxyId,
			uid,
			resourceId,
		}: {
			backmeshUid: string;
			proxyId: string;
			uid: string;
			resourceId: string;
		},
	) {
		const key = getPrivateResourceKey(backmeshUid, proxyId, resourceId);
		const kvUid = await env.BACKMESH_KV.get(key);
		return kvUid === uid;
	},

	// sliding window rate limiting per user
	async rateLimit(
		env: Env,
		backmeshUid: string,
		apiProxy: ApiProxy,
		uid: string,
	): Promise<boolean> {
		const now = Math.floor(Date.now() / 1000);
		const rateLimitWindow = getRateLimitUnitInSecs(apiProxy.rateLimitUnit);
		const windowStart = Math.floor(now / rateLimitWindow) * rateLimitWindow;

		// Get the current count for this user + proxy from KV, if any
		const rateLimitKey = `${getRateLimitKey(
			backmeshUid,
			apiProxy.id,
			uid,
			windowStart,
		)}`;
		const requestCount = await env.BACKMESH_KV.get(rateLimitKey);
		let count = requestCount ? parseInt(requestCount, 10) : 0;

		if (count >= apiProxy.rateLimit) {
			// Exceeded the rate limit
			return true;
		}

		// Increment the request count
		count += 1;

		// Store the updated count back to KV with an expiration time (equal to the window duration)
		await env.BACKMESH_KV.put(rateLimitKey, count.toString(), {
			expirationTtl: rateLimitWindow,
		});

		return false;
	},
};
