import { ProxyRequest } from '../proxy';

export default {
	async captureProxyReq(req: ProxyRequest, status: number) {
		const { path, proxyId, backmeshUid, endUserId } = req;
		const payload = {
			api_key: 'phc_fZ3tyt5smshwvm17JYlrU8PbxUVlOoakvH2M5b6ktdO',
			event: 'proxy_request',
			properties: {
				distinct_id: backmeshUid,
				end_user_id: endUserId,
				proxy_id: proxyId,
				status,
				path,
			},
		};
		const response = await fetch('https://app.posthog.com/capture/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		return response;
	},
};
