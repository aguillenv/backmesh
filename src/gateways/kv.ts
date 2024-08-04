export enum AuthProviderType {
  FIREBASE = 'firebase',
}

export enum AppSchemaVersion {
  V1 = 'V1',
}

export type App = {
  authProviderPublicKey: string;
  authProviderProjectId: string;
  authProviderType: AuthProviderType;
  schemaVersion: AppSchemaVersion;
};

// Type guard to check if an object is of type Proxy at runtime
function isApp(obj: any): obj is App {
  return typeof obj === 'object' && obj !== null &&
         typeof obj.authProviderPublicKey === 'string' &&
         typeof obj.authProviderProjectId === 'string' &&
         Object.values(AuthProviderType).includes(obj.authProviderType) &&
         Object.values(AppSchemaVersion).includes(obj.schemaVersion);
}

export enum ProxySchemaVersion {
  V1 = 'V1',
}

export type Proxy = {
  apiUrl: string;
  privateApiKey: string;
  schemaVersion: ProxySchemaVersion;
};

// Type guard to check if an object is of type Proxy at runtime
function isProxy(obj: any): obj is Proxy {
  return typeof obj === 'object' && obj !== null &&
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
  /* APP */
  async setApp(env: Env, uid: string, appName: string, value: any) {
    if (!isApp(value)) {
      throw new Error('Value does not match App type');
    }
    await set<App>(env, `${uid}/${appName}`, value);
  },

  async getApp(env: Env, uid: string, appName: string) {
    const key = `${uid}/${appName}`;
    const app = await get<App>(env, key);
    if (!isApp(app)) {
      throw new Error(`Retrieved value is not of App type:\n${app}`);
    }
    return app;
  },

  async delApp(env: Env, uid: string, appName: string) {
    const key = `${uid}/${appName}`;
    await del(env, key);
  },

  /* PROXY */
  async setProxy(env: Env, uid: string, appName: string, proxyName: string, value: any) {
    if (!isProxy(value)) {
      throw new Error('Value does not match Proxy type');
    }
    await set<Proxy>(env, `${uid}/${appName}/${proxyName}`, value);
  },

  async getProxy(env: Env, uid: string, appName: string, proxyName: string) {
    const key = `${uid}/${appName}/${proxyName}`;
    const proxy = await get<Proxy>(env, key);
    if (!isProxy(proxy)) {
      throw new Error(`Retrieved value is not of Proxy type:\n${proxy}`);
    }
    return proxy;
  },

  async delProxy(env: Env, uid: string, appName: string, proxyName: string) {
    const key = `${uid}/${appName}/${proxyName}`;
    await del(env, key);
  },
};