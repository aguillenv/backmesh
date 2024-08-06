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
  privateApiKey: string;
  schemaVersion: ApiProxySchemaVersion;
};

// Type guard to check if an object is of type ApiProxy at runtime
function isApp(obj: any): obj is ApiProxy {
  return typeof obj === 'object' && obj !== null &&
         typeof obj.authPublicKey === 'string' &&
         typeof obj.apiUrl === 'string' &&
         typeof obj.privateApiKey === 'string' &&
         Object.values(AuthProviderType).includes(obj.authProviderType) &&
         Object.values(ApiProxySchemaVersion).includes(obj.schemaVersion);
}
async function set<T>(env: Env, key: string, value: T, isNew: boolean) {
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
    if (!isApp(value)) {
      throw new Error('Value does not match ApiProxy type');
    }
    await set<ApiProxy>(env, `${uid}/${name}`, value, false);
  },

  async editApiProxy(env: Env, uid: string, name: string, value: any) {
    if (!isApp(value)) {
      throw new Error('Value does not match ApiProxy type');
    }
    await set<ApiProxy>(env, `${uid}/${name}`, value, true);
  },

  async getApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    const app = await get<ApiProxy>(env, key);
    if (!isApp(app)) {
      throw new Error(`Retrieved value is not of ApiProxy type:\n${app}`);
    }
    return app;
  },

  async getAllApiProxies(env: Env, uid: string): Promise<ApiProxy[]> {
    const entries = await env.BACKMESH_KV.list({ prefix: `${uid}/` });

    const proxyPromises = entries.keys.map(async (key) => {
      const app = await get<ApiProxy>(env, key.name);
      if (isApp(app)) {
        return app;
      } else {
        throw new Error(`Retrieved value is not of ApiProxy type for key: ${key.name}`);
      }
    });

    return Promise.all(proxyPromises);
  },

  async delApiProxy(env: Env, uid: string, name: string) {
    const key = `${uid}/${name}`;
    await del(env, key);
  },
};