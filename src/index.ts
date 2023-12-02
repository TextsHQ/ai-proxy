import * as z from 'zod';
import jwt from '@tsndr/cloudflare-worker-jwt';

const schemas = {
	'/v1/chat/completions': z.object({
		model: z.enum([
			'gpt-3.5-turbo',
			'gpt-4-1106-preview'
		]),
		temperature: z.literal(0.8),
		top_p: z.literal(1),
		frequency_penalty: z.literal(0),
		presence_penalty: z.literal(0),
		n: z.literal(1),
		stream: z.literal(true),
		messages: z.array(z.object({
			role: z.enum(['user']),
			content: z.string()
		})),
		user: z.undefined()
	}),
	'/v1/completions': z.object({
		model: z.enum([
			'text-davinci-003'
		]),
		max_tokens: z.literal(100),
		temperature: z.literal(0.5),
		frequency_penalty: z.literal(0.5),
		presence_penalty: z.literal(0.6),
		stop: z.array(z.string()),
		prompt: z.string(),
		n: z.number(),
		best_of: z.number(),
		user: z.string()
	})
} as const;

const ALLOWED_PATHS = [
	'/v1/chat/completions',
	'/v1/completions',
	'/v1/audio/transcriptions'
];

const OPENAI_BASE = 'https://api.openai.com/';

interface JWTPayload {
	p: string[] // allowed paths
	m: string // allowed models
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (!env.OPENAI_TOKEN || !env.SHARED_JWT_SECRET) return new Response('Bad request: Missing environment variables', { status: 400 });

		const url = new URL(request.url);
		if (!ALLOWED_PATHS.includes(url.pathname)) return new Response('Bad request: Invalid path: ' + url.pathname, { status: 400 });

		const tokenHeader = request.headers.get('Authorization');
		if (!tokenHeader) return new Response('Bad request: Missing `Authorization` header', { status: 400 });
		const token = tokenHeader.split(' ')[1];
		if (!token) return new Response('Bad request: Missing token', { status: 400 });

		const isValid = await jwt.verify(token, env.SHARED_JWT_SECRET);
		if (!isValid) return new Response('Bad request: Invalid token', { status: 400 });

		const { payload } = jwt.decode<JWTPayload>(token);
		const sub = payload?.sub;
		if (!sub) return new Response('Bad request: Invalid user', { status: 400 });
		// @TODO - check allowed paths from payload.p

		const proxyUrl = OPENAI_BASE + (url.href.substring(url.origin.length + 1));

		const newRequest = new Request(request);
		newRequest.headers.set('Authorization', `Bearer ${env.OPENAI_TOKEN}`);

		// @TODO - validate request body for /v1/audio/transcriptions
		if (url.pathname === '/v1/chat/completions' || url.pathname === '/v1/completions') {
			const schema = schemas[url.pathname];
			const r = request.clone()
			const json = await r.json();
			const parsed = schema.parse(json)
			// @TODO - use refinements in zod to add user id to request body
		}

		return fetch(proxyUrl, newRequest);
	}
};
