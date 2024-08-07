# edge

A Cloudflare worker written in Typescript that gets deployed to edge.backmesh.com and gets called by the dashboard.

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
