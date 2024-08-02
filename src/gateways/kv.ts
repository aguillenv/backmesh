export enum AuthProviderType {
  // SUPABASE = 'supabase',
  // AUTH0 = 'auth0',
  FIREBASE = 'firebase',
}

export enum ProxySchemaVersion {
  V1 = 'v1',
}

export type Proxy = {
  authProviderPublicKey: string;
  authProviderProjectId: string;
  authProviderType: AuthProviderType;
  apiUrl: string;
  privateApiKey: string;
  schemaVersion: ProxySchemaVersion;
};

// Type guard to check if an object is of type Proxy at runtime
function isProxy(obj: any): obj is Proxy {
  return typeof obj === 'object' && obj !== null &&
         typeof obj.authProviderPublicKey === 'string' &&
         typeof obj.authProviderProjectId === 'string' &&
         Object.values(AuthProviderType).includes(obj.authProviderType) &&
         typeof obj.apiUrl === 'string' &&
         typeof obj.privateApiKey === 'string' &&
         Object.values(ProxySchemaVersion).includes(obj.schemaVersion);
}

async function set<T>(env: Env, key: string, value: T) {
  const jsonValue = JSON.stringify(value);
  await env.BACKMESH_KV.put(key, jsonValue);
}

async function get<T>(env: Env, key: string): Promise<T> {
  const value = await env.BACKMESH_KV.get(key);
  if (value === null) throw new Error(`No value for key: ${key}`);
  return JSON.parse(value) as T;
};

async function del(env: Env, key: string) {
  await env.BACKMESH_KV.delete(key);
}

export default {

  async setProxy(env: Env, uid: string, proxyName: string, value: any) {
    if (!isProxy(value)) {
      throw new Error('Value does not match Proxy type');
    }
    await set<Proxy>(env, `${uid}/${proxyName}`, value);
  },

  async getProxy(env: Env, uid: string, proxyName: string) {
    const key = `${uid}/${proxyName}`;
    const proxy = await get<Proxy>(env, key);
    if (!isProxy(proxy)) {
      throw new Error(`Retrieved value is not of Proxy type:\n${proxy}`);
    }
    return proxy;
  },

  async delProxy(env: Env, uid: string, proxyName: string) {
    const key = `${uid}/${proxyName}`;
    await del(env, key);
  },
};