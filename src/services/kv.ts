import { decrypt, encrypt } from './crypto';

export enum AuthProviderType {
	FIREBASE = 'Firebase',
}

export enum ApiProxySchemaVersion {
	V1 = 'V1',
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
	if (typeof obj.id !== 'string') {
		throw new TypeError('id is not a string');
	}
	if (typeof obj.proxyUrl !== 'string') {
		throw new TypeError('proxyUrl is not a string');
	}
	if (typeof obj.apiUrl !== 'string') {
		throw new TypeError('apiUrl is not a string');
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
	for (const field of immutableFields) {
		if (currVal[field] !== (value as any)[field]) {
			throw new TypeError(`Field '${field}' is immutable and cannot be changed`);
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

export default {
	async newApiProxy(env: Env, uid: string, value: any): Promise<ApiProxy> {
		const id = generateId();
		value.id = id;
		value.proxyUrl = `https://edge.backmesh.com/v1/proxy/${uid}/${id}`;
		value.apiPrivateKey = await encrypt(value.apiPrivateKey, env.PASSWORD);
		assertApiProxy(value);
		await create<ApiProxy>(env, `${uid}/${id}`, value);
		// do not return private key
		value.apiPrivateKey = '';
		return value;
	},

	async editApiProxy(
		env: Env,
		uid: string,
		id: string,
		value: any,
	): Promise<ApiProxy> {
		assertApiProxy(value);
		// user is trying to set a new one
		if (value.apiPrivateKey.length > 0) {
			value.apiPrivateKey = await encrypt(value.apiPrivateKey, env.PASSWORD);
		}
		await edit<ApiProxy>(env, `${uid}/${id}`, value, ['id', 'proxyUrl']);
		// do not return private key
		value.apiPrivateKey = '';
		return value;
	},

	async getApiProxy(env: Env, uid: string, id: string) {
		const key = `${uid}/${id}`;
		const proxy = await get<ApiProxy>(env, key);
		assertApiProxy(proxy);
		proxy.apiPrivateKey = '';
		return proxy;
	},

	async getAdminApiProxy(env: Env, uid: string, id: string) {
		const key = `${uid}/${id}`;
		const proxy = await get<ApiProxy>(env, key);
		proxy.apiPrivateKey = await decrypt(proxy.apiPrivateKey, env.PASSWORD);
		assertApiProxy(proxy);
		return proxy;
	},

	async getAllApiProxies(env: Env, uid: string): Promise<ApiProxy[]> {
		const entries = await env.BACKMESH_KV.list({ prefix: `${uid}/` });

		const proxyPromises = entries.keys.map(async (key) => {
			const proxy = await get<ApiProxy>(env, key.name);
			assertApiProxy(proxy);
			proxy.apiPrivateKey = '';
			return proxy;
		});

		return Promise.all(proxyPromises);
	},

	async delApiProxy(env: Env, uid: string, name: string) {
		const key = `${uid}/${name}`;
		await del(env, key);
	},
};
