export enum AuthProviderType {
  FIREBASE = 'Firebase',
}

export enum ApiProxySchemaVersion {
  V1 = 'V1',
}

// TODO use URLs to validate here or in front
export type ApiProxy = {
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
    throw new TypeError(`New ${key}, but it already exists`)
  }
  const jsonValue = JSON.stringify(value);
  await env.BACKMESH_KV.put(key, jsonValue);
}

async function edit<T>(env: Env, key: string, value: T) {
  const curr = await env.BACKMESH_KV.get(key);
  if (curr === null) throw new TypeError(`No value to edit for key: ${key}`);
  const jsonValue = JSON.stringify(value);
  await env.BACKMESH_KV.put(key, jsonValue);
}

async function get<T>(env: Env, key: string): Promise<T> {
  const value = await env.BACKMESH_KV.get(key);
  if (value === null) throw new TypeError(`No value for key: ${key}`);
  return JSON.parse(value) as T;
};

async function del(env: Env, key: string) {
  const curr = await env.BACKMESH_KV.get(key);
  if (curr === null) throw new TypeError(`No value to delete for key: ${key}`);
  await env.BACKMESH_KV.delete(key);
}

export default {
  async newApiProxy(env: Env, uid: string, name: string, value: any) {
    assertApiProxy(value);
    const proxy = value as ApiProxy;
    proxy.proxyUrl = `https://edge.backmesh.com/proxy/v1/${uid}/${name}`
    await create<ApiProxy>(env, `${uid}/${name}`, value);
  },

  async editApiProxy(env: Env, uid: string, name: string, value: any) {
    assertApiProxy(value);
    await edit<ApiProxy>(env, `${uid}/${name}`, value);
  },

  async getApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    const proxy = await get<ApiProxy>(env, key);
    assertApiProxy(proxy);
    return proxy;
  },

  async getAllApiProxies(env: Env, uid: string): Promise<ApiProxy[]> {
    const entries = await env.BACKMESH_KV.list({ prefix: `${uid}/` });

    const proxyPromises = entries.keys.map(async (key) => {
      const proxy = await get<ApiProxy>(env, key.name);
      assertApiProxy(proxy);
      return proxy
    });

    return Promise.all(proxyPromises);
  },

  async delApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    await del(env, key);
  },
};