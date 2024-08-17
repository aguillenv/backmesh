import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { supabaseUidFromJwt } from '../src/services/auth';

// codemaestro project
const supabaseUrl = 'https://naxywnoolzuwzkinwekg.supabase.co';
const supabaseKey =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5heHl3bm9vbHp1d3praW53ZWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY1MTE5NzIsImV4cCI6MjAyMjA4Nzk3Mn0.r5v1avlzdn-_2dDXhVgzFcMwv9YlMN_MXH9Q3NUHXcg';
const testUserEmail = 'lfdepombo+codemaestro@gmail.com';
const testUserId = 'a1029f16-0aae-4d3b-a33d-74263182c7dd';

async function getTokenFromSupabase(
	email: string,
	password: string,
): Promise<string> {
	const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: supabaseKey,
		},
		body: JSON.stringify({
			email: email,
			password: password,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Error response text:', errorText);
		throw new Error('Error verifying password: ' + response.statusText);
	}

	const data: any = await response.json();
	return data.access_token;
}

describe('supabase', () => {
	it('properly auth user to get jwt and the use that jwt to get uid', async () => {
		const testUserJwt = await getTokenFromSupabase(
			testUserEmail,
			env.TEST_USER_PASS,
			supabaseKey,
		);

		const uid = await supabaseUidFromJwt(testUserJwt, supabaseKey, supabaseUrl);
		expect(uid).toMatch(testUserId);
	});
});
