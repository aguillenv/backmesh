# Backmesh, Firebase for LLM APIs

Backmesh is Typescript backend hosted on Cloudflare Workers that lets you securely call LLM APIs from your mobile or web app without spinning up a new backend. Simply call Backmesh directly instead of the LLM API with the user's JWT from the app's authentication provider e.g. Supabase or Firebase Authentication. Backmesh will act as a proxy to the LLM APIs and apply configurable rate limits per user to prevent abuse (e.g. no more than 5 OpenAI API calls per hour per user). For more details, see the [security documentation](https://backmesh.com/docs/security).

```dart
// Auth Provider: Firebase
// App Type: Flutter Dart
// Private Key API: OpenAI

import 'package:firebase_auth/firebase_auth.dart';
import 'package:dart_openai/dart_openai.dart';


OpenAI.baseUrl =
 "https://edge.backmesh.com/appid/proxyname";
// set api secret key to jwt
OpenAI.apiKey = await FirebaseAuth.instance.currentUser
 .getIdToken();
await OpenAI.instance.chat(...)
```

## Deployment

Backmesh can be deployed to your own Cloudflare account. Check out the pricing and usage limits for the different Cloudflare worker plans: https://developers.cloudflare.com/workers/platform/limits/ or use our [hosted SaaS](https://app.backmesh.com) with [pricing plans](https://backmesh.com/pricing/) starting at $8 per month.

## Local development and testing

Expects a `.dev.vars` that gets ignored by git per https://developers.cloudflare.com/workers/testing/local-development/#local-only-environment-variables. It can be bootstrapped with variables in [`worker-configuration.d.ts`](./worker-configuration.d.ts)

Then install dependencies and run the worker locally with

```bash
npm run dev
```

To see the keys in the local KV run:

```bash
npx wrangler kv key list --namespace-id <BINDING_ID> --local
```

## Versioned Routes

- `/v1/proxy` uses the user's JWT authentication and should only call KV to stay performant
- `/v1/crud` called by the dashboard and uses Backmesh Firebase Auth JWT authentication

### HTTP methods

- `POST` for creations, fail if it already exists
- `PUT` for updates, fails if it does not already exist
- `DELETE`
- `GET`

## Versioned Data Model

Cloudflare KV is the main data store. Resources have unique alphanumeric names set by us. Collections do not end in template.

### API Proxy

`proxies/${backmeshUid}/[]`

- `proxies/${backmeshUid}/${proxyId}`

### API Proxy End User

`endusers/${backmeshUid}/${proxyId}/[]`

- `endusers/${backmeshUid}/${proxyId}/{uid}`
- can have cummulative summaries or indices down the line

### API Proxy per user request history

`reqs/${backmeshUid}/${proxyId}/{uid}/[]`

- `reqs/${backmeshUid}/${proxyId}/{uid}/{ts}|${model}|${tokens}|${timing}`

### API Proxy per user rate limit

`limits/${backmeshUid}/${proxyId}/[]`

- `limits/${backmeshUid}/${proxyId}/{uid}-${windowstart}`

### API Proxy private resourecs

`resources/${backmeshUid}/${proxyId}[]`

- `resources/${backmeshUid}/${proxyId}/${resource.id}`
