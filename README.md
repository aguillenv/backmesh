# edge

A Cloudflare worker written in Typescript and deployed to edge.backmesh.com.

Worker Plan Limits: https://developers.cloudflare.com/workers/platform/limits/

## Local development

Expects a `.dev.vars` that gets ignored by git per https://developers.cloudflare.com/workers/testing/local-development/#local-only-environment-variables. It can be bootstrapped with:

```
BACKMESH_FIREBASE_KEY="AIzaSyBHz11i2YIYtMkKdLpj3QiiKD8UguTKyRo"
PASSWORD="secret"
```

Then install dependencies and run the worker locally with

```bash
npm run dev
```

## Versioned Routes

- `/v1/proxy` uses the user's JWT authentication and should only call KV to stay performant
- `/v1/crud` called by the dashboard and uses Backmesh Firebase Auth JWT authentication

## HTTP methods

- `POST` for creations, fail if it already exists
- `PUT` for updates, fails if it does not already exist
- `DELETE`
- `GET`

## Data Model

Cloudflare KV is the main data store. Version schemas to avoid insidious bugs down the line. Resources have unique alphanumeric names set by us. Collections do not end in template.

### API Proxy

`${backmeshUid}/proxies[]`

- `${backmeshUid}/proxies/${proxyId}`

<!--
### API Proxy End User

`${backmeshUid}/proxies/${proxyId}/users[]`
- `${backmeshUid}/proxies/${proxyId}/users/{uid}`
- can have cummulative summaries or indices down the line

 ### API Proxy per user request history

`${backmeshUid}/proxies/${proxyId}/users/{uid}/requests[]`
- `${backmeshUid}/proxies/${proxyId}/users/{uid}/requests/{epochTS}-{statusCode}`

-->

### API Proxy per user rate limit

`${backmeshUid}/proxies/${proxyId}/users/{uid}/rateLimit[]`

- `${backmeshUid}/proxies/${proxyId}/users/{uid}/rateLimit/${windowstart}`

### API Proxy private resourecs

`${backmeshUid}/proxies/${proxyId}/resource[]`

- `${backmeshUid}/proxies/${proxyId}/resource/${resource.id}`
