// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiQuiz } from '../src/core/ai';
import { completeLogin, getAuth, openRouterEngine, pickFreeModels, pkcePair, PolicyError } from '../src/core/openrouter';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('PKCE', () => {
  it('challenge is base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('login callback', () => {
  it('exchanges ?code for the user key and cleans the URL', async () => {
    sessionStorage.setItem('speedreader:openrouter-pkce', JSON.stringify({ verifier: 'v'.repeat(43), returnTo: 'doc1' }));
    history.replaceState(null, '', '/?code=abc');
    const fetch = vi.fn(async () => Response.json({ key: 'sk-or-user' }));
    vi.stubGlobal('fetch', fetch);
    expect(await completeLogin()).toEqual({ ok: true, returnTo: 'doc1' });
    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/auth/keys', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ code: 'abc', code_verifier: 'v'.repeat(43), code_challenge_method: 'S256' });
    expect(getAuth()?.key).toBe('sk-or-user');
    expect(location.search).toBe('');
  });

  it('ignores a ?code that this tab did not start', async () => {
    history.replaceState(null, '', '/?code=abc');
    expect(await completeLogin()).toBeNull();
  });
});

describe('model choice', () => {
  it('picks free, structured-output models, preferred families first', () => {
    const m = (id: string, free = true, params = ['response_format']) => ({
      id,
      context_length: 32000,
      pricing: { prompt: free ? '0' : '0.1', completion: free ? '0' : '0.1' },
      supported_parameters: params,
    });
    const ids = pickFreeModels([
      m('someone/tiny:free'),
      m('openai/gpt-5', false),
      m('qwen/qwen3-32b:free'),
      m('meta/llama-3.3-70b:free', true, ['tools']),
      m('deepseek/deepseek-v3:free'),
      m('mistral/mistral-small:free'),
    ]);
    expect(ids).toEqual(['deepseek/deepseek-v3:free', 'qwen/qwen3-32b:free', 'mistral/mistral-small:free']);
  });
});

describe('engine', () => {
  const models = Response.json({ data: [{ id: 'qwen/qwen3-32b:free', context_length: 32000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format'] }] });

  it('sends a strict JSON-schema request routed away from data-collecting providers', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('/models') ? models.clone() : Response.json({ choices: [{ message: { content: '{"answers":[1]}' } }] })));
    vi.stubGlobal('fetch', fetch);
    const out = await openRouterEngine({ key: 'k', at: 0 }, false).ask('sys', 'user', { type: 'object' });
    expect(out).toBe('{"answers":[1]}');
    const [, init] = fetch.mock.calls.find(([u]) => String(u).endsWith('/chat/completions')) as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.models).toEqual(['qwen/qwen3-32b:free']);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.provider.data_collection).toBe('deny');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('reports a data-policy refusal so the UI can explain it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/models') ? models.clone() : Response.json({ error: { message: 'No endpoints found matching your data policy' } }, { status: 404 }))));
    const onError = vi.fn();
    expect(await aiQuiz('Some passage text here.', 'en', openRouterEngine({ key: 'k', at: 0 }, false), { onError })).toEqual([]);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PolicyError);
  });
});
