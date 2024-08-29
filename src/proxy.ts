import auth, { AuthHeader } from './services/auth';
import kv, { ApiProxy } from './services/kv';

export type ProxyRequest = {
	endUserId: string;
	backmeshUid: string;
	proxyId: string;
	authHeader: AuthHeader;
	request: Request;
	apiProxy: ApiProxy;
	path: string;
};

export default {
	async validate(request: Request, env: Env): Promise<ProxyRequest | Response> {
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter((part) => part);
		// /v1/proxy/${backmeshUid}/${apiProxyName}/
		const backmeshUid = parts.at(2);
		const proxyId = parts.at(3);
		if (!backmeshUid || !proxyId) {
			return new Response('Invalid pathname', { status: 400 });
		}
		let apiProxy;
		try {
			apiProxy = await kv.getAdminApiProxy(env, backmeshUid, proxyId);
		} catch (error: any) {
			console.error(error);
			const status = error instanceof TypeError ? 404 : 500;
			return new Response(error.message ?? 'Unknown error', { status });
		}
		const authHeader = auth.getAuthHeader(request, apiProxy.apiReqHeader);
		if (authHeader === null)
			return new Response('Missing or invalid Authorization header', {
				status: 401,
			});
		const endUserId = await auth.getUidFromJwt(authHeader.extractedJwt, apiProxy);
		if (endUserId === null) return new Response('Invalid token', { status: 401 });
		return {
			apiProxy,
			request,
			authHeader,
			proxyId,
			backmeshUid,
			endUserId,
			path: parts.slice(4).join('/'),
		};
	},
	async fetch(proxyRequest: ProxyRequest, env: Env) {
		const { apiProxy, request, authHeader, proxyId, backmeshUid, endUserId } =
			proxyRequest;
		const rateLimit = await kv.rateLimit(env, backmeshUid, apiProxy, endUserId);
		if (rateLimit)
			return new Response('Backmesh request limit exceeded', { status: 429 });
		const requestUrl = new URL(request.url);
		const parts = requestUrl.pathname.split('/').filter((part) => part);
		const pathName = parts.slice(4).join('/');
		let fullApiUrl =
			apiProxy.apiUrl + (apiProxy.apiUrl.endsWith('/') ? '' : '/') + pathName;

		// v1/assistants, v1/vector_stores and v1/fine_tuning can be added as private endpoints
		// whitelist of routes supported until someone complains and then understand their use case
		const pathParts = pathName.split('/');
		const route = pathParts[1];
		if (fullApiUrl.startsWith('https://api.openai.com')) {
			const allowedPaths = [
				'audio',
				'chat',
				'models',
				'images',
				'moderations',
				'files', // private ones
				'threads', // private ones
			];
			if (!allowedPaths.some((path) => route === path)) {
				return new Response('Forbidden', { status: 403 });
			}
		}

		// https://ai.google.dev/api/all-methods
		if (fullApiUrl.startsWith('https://generativelanguage.googleapis.com')) {
			const allowedInitPaths = [
				'v1beta/files',
				'upload/v1beta/files',
				'v1beta/models',
			];
			if (!allowedInitPaths.some((path) => pathName.startsWith(path))) {
				return new Response('Forbidden', { status: 403 });
			}
		}

		// Add existing query parameters
		if (requestUrl.searchParams.size > 0) {
			const url = new URL(fullApiUrl);
			requestUrl.searchParams.forEach((value, key) => {
				url.searchParams.append(key, value);
			});
			fullApiUrl = url.toString();
		}

		const init: RequestInit = {
			method: request.method,
			headers: auth.newProxyHeaders(request, authHeader, apiProxy.apiPrivateKey),
		};

		// GET and HEAD requests do not have a body
		if (request.body) {
			init.body = await request.clone().text();
		}

		let response = null;

		const { readable, writable } = new TransformStream();
		if (fullApiUrl.startsWith('https://generativelanguage.googleapis.com')) {
			if (
				pathName === 'upload/v1beta/files' &&
				requestUrl.searchParams.has('upload_id')
			) {
				// parse response without consuming original
				response = await fetch(fullApiUrl, init);
				const jsonResponse: any = await response.clone().json();
				const file = jsonResponse.file;

				await kv.newUserResource(env, {
					backmeshUid,
					proxyId: apiProxy.id,
					endUserId,
					// files/lw388m83m4w8
					resourceId: file.name.split('/').pop(),
				});
			} else if (route === 'files' && pathParts.length === 3) {
				// GET or DELETE
				const resourceId = pathParts[2];
				const isOwner = await kv.isUserResource(env, {
					backmeshUid,
					proxyId: apiProxy.id,
					endUserId,
					resourceId,
				});
				if (!isOwner) return new Response('Forbidden', { status: 403 });
				// GET v1/files lists all files
				// parse response, grab id and set in KV
			} else if (pathParts.length === 2 && route === 'files') {
				// parse response and filter files that do not belong to this user
				// assumes JSON
				response = await fetch(fullApiUrl, init);
				const jsonResponse: any = await response.clone().json();
				// TODO handle pagination
				const filteredFiles = await Promise.all(
					(jsonResponse.files as any[]).map(async (file) => {
						const isOwner = await kv.isUserResource(env, {
							backmeshUid,
							proxyId: apiProxy.id,
							endUserId,
							resourceId: file.name.split('/').pop(),
						});
						return isOwner ? file : null;
					}),
				).then((results) => results.filter((file) => file !== null));
				const reconstructedResponse = {
					...jsonResponse,
					files: filteredFiles,
				};
				const writer = writable.getWriter();
				writer.write(
					new TextEncoder().encode(JSON.stringify(reconstructedResponse)),
				);
				writer.close();

				return new Response(readable, response);
			}
		}

		// TODO support /v1/uploads and resulting file created
		if (apiProxy.apiUrl.startsWith('https://api.openai.com')) {
			if (route === 'files' || route === 'threads') {
				if (request.method === 'POST') {
					// parse response without consuming original
					response = await fetch(fullApiUrl, init);
					const jsonResponse: any = await response.clone().json();
					const resourceId = jsonResponse.id;
					await kv.newUserResource(env, {
						backmeshUid,
						proxyId,
						endUserId,
						resourceId,
					});
					// Files API
					// ---------
					// DELETE or GET with id
					// v1/files/${fileId}
					// or GET contents
					// v1/files/${fileId}/content
					//
					// Threads API
					// -----------
					// DELETE or GET with id plus any action on it
					// v1/threads/${threadId}/...
				} else if (pathParts.length === 3 || pathParts.length === 4) {
					const resourceId = pathParts[2];
					const isOwner = await kv.isUserResource(env, {
						backmeshUid,
						proxyId,
						endUserId,
						resourceId,
					});
					if (!isOwner) return new Response('Forbidden', { status: 403 });
					// GET v1/files lists all files
					// parse response, grab id and set in KV
				} else if (
					request.method === 'GET' &&
					pathParts.length === 2 &&
					route === 'files'
				) {
					// parse response and filter files that do not belong to this user
					// assumes JSON
					response = await fetch(fullApiUrl, init);
					const jsonResponse: any = await response.clone().json();
					const filteredData = await Promise.all(
						(jsonResponse.data as any[]).map(async (file) => {
							const isOwner = await kv.isUserResource(env, {
								backmeshUid,
								proxyId,
								endUserId,
								resourceId: file.id,
							});
							return isOwner ? file : null;
						}),
					).then((results) => results.filter((file) => file !== null));
					const reconstructedResponse = {
						...jsonResponse,
						data: filteredData,
					};
					const writer = writable.getWriter();
					writer.write(
						new TextEncoder().encode(JSON.stringify(reconstructedResponse)),
					);
					writer.close();

					return new Response(readable, response);
				}
			}
		}

		if (!response) {
			response = await fetch(fullApiUrl, init);
		}

		if (!response.body) {
			return new Response('No body in response', { status: 500 });
		}
		// Start pumping the body. NOTE: No await!
		response.body.pipeTo(writable);

		// ... and deliver our Response while that’s running.
		return new Response(readable, response);
	},
};
