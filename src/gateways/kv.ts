export enum AuthProviderType {
  FIREBASE = 'Firebase',
}

export enum ApiProxySchemaVersion {
  V1 = 'V1',
}

export type ApiProxy = {
  authPublicKey: string;
  authType: AuthProviderType;
  apiUrl: string;
  apiPrivateKey: string;
  schemaVersion: ApiProxySchemaVersion;
};

// Type guard to check if an object is of type ApiProxy at runtime
function checkApiProxy(obj: any): obj is ApiProxy {
  if (!obj.schemaVersion) {
    obj.schemaVersion = ApiProxySchemaVersion.V1;
  }

  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Object is not valid');
  }
  if (typeof obj.authPublicKey !== 'string') {
    throw new Error('authPublicKey is not a string');
  }
  if (typeof obj.apiUrl !== 'string') {
    throw new Error('apiUrl is not a string');
  }
  if (typeof obj.apiPrivateKey !== 'string') {
    throw new Error('apiPrivateKey is not a string');
  }
  if (!Object.values(AuthProviderType).includes(obj.authType)) {
    throw new Error('authType is not valid');
  }
  if (!Object.values(ApiProxySchemaVersion).includes(obj.schemaVersion)) {
    throw new Error('schemaVersion is not valid');
  }

  // TODO where to add proxy URL
  return true;

}
async function set<T>(env: Env, key: string, value: T, { isNew }: { isNew: boolean }) {
  const curr = await env.BACKMESH_KV.get(key);
  if (curr === null && !isNew) {
    throw new Error(`Update ${key}, but it does not exist`)
  }
  if (curr !== null && isNew) {
    throw new Error(`New ${key}, but it already exists`)
  }
  const jsonValue = JSON.stringify(value);
  await env.BACKMESH_KV.put(key, jsonValue);
}

async function get<T>(env: Env, key: string): Promise<T> {
  const value = await env.BACKMESH_KV.get(key);
  if (value === null) throw new Error(`No value for key: ${key}`);
  return JSON.parse(value) as T;
};

async function del(env: Env, key: string) {
  const curr = await env.BACKMESH_KV.get(key);
  if (curr !== null) throw new Error(`Del ${key}, but it does not exist`)
  await env.BACKMESH_KV.delete(key);
}

export default {
  /* APP */
  async newApiProxy(env: Env, uid: string, name: string, value: any) {
    checkApiProxy(value);
    await set<ApiProxy>(env, `${uid}/${name}`, value, { isNew: true });
  },

  async editApiProxy(env: Env, uid: string, name: string, value: any) {
    checkApiProxy(value);
    await set<ApiProxy>(env, `${uid}/${name}`, value, { isNew: false });
  },

  async getApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    const proxy = await get<ApiProxy>(env, key);
    checkApiProxy(proxy);
    return proxy;
  },

  async getAllApiProxies(env: Env, uid: string): Promise<ApiProxy[]> {
    const entries = await env.BACKMESH_KV.list({ prefix: `${uid}/` });

    const proxyPromises = entries.keys.map(async (key) => {
      const proxy = await get<ApiProxy>(env, key.name);
      checkApiProxy(proxy);
      return proxy
    });

    return Promise.all(proxyPromises);
  },

  async delApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    await del(env, key);
  },
};