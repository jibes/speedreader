// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiQuiz } from '../src/core/ai';
import { completeLogin, getAuth, modelSize, openRouterEngine, pickFreeModels, pkcePair, PolicyError, resetModelCache } from '../src/core/openrouter';

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
      m('openrouter/auto'),
      m('switchpoint/router'),
      m('vendor/zero-priced-but-not-free'),
      m('deepseek/deepseek-r1:free'),
      m('z/thinker:free', true, ['response_format', 'reasoning']),
      m('someone/tiny:free'),
      m('openai/gpt-5', false),
      m('qwen/qwen3-32b:free'),
      m('meta/llama-3.3-70b:free'),
      m('deepseek/deepseek-v3:free'),
      m('mistral/mistral-small:free'),
    ]);
    expect(ids).toEqual({ ids: ['meta/llama-3.3-70b:free', 'mistral/mistral-small:free', 'deepseek/deepseek-v3:free'], structured: true });
  });
});

describe('model size and tiny models', () => {
  it('reads parameter counts from ids', () => {
    expect(modelSize('liquid/lfm-2.5-2.6b:free')).toBe(2.6);
    expect(modelSize('meta-llama/llama-3.3-70b-instruct:free')).toBe(70);
    expect(modelSize('qwen/qwen3-235b-a22b:free')).toBe(235);
    expect(modelSize('google/gemma-3n-e4b-it:free')).toBe(4);
    expect(modelSize('moonshotai/kimi-k2:free')).toBeNull();
  });

  it('never prefers a tiny structured-output model over a good family without it', () => {
    const m = (id: string, params: string[]) => ({ id, context_length: 32000, pricing: { prompt: '0', completion: '0' }, supported_parameters: params });
    const pick = pickFreeModels([
      m('liquid/lfm-2.5-2.6b:free', ['response_format']),
      m('meta-llama/llama-3.3-70b-instruct:free', ['tools']),
      m('mistralai/mistral-small-3.1-24b-instruct:free', ['response_format']),
      m('unknown/big-model-120b:free', ['response_format']),
    ]);
    expect(pick.ids).toEqual(['meta-llama/llama-3.3-70b-instruct:free', 'mistralai/mistral-small-3.1-24b-instruct:free', 'unknown/big-model-120b:free']);
    expect(pick.structured).toBe(false);
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

  it('falls back to prompt-only JSON when no endpoint supports structured output', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return models.clone();
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      return body.response_format
        ? Response.json({ error: { message: 'No endpoints found that can handle the requested parameters' } }, { status: 404 })
        : Response.json({ choices: [{ message: { content: 'Sure! {"answers":[2]}' } }] });
    }));
    const out = await openRouterEngine({ key: 'k', at: 0 }, false).ask('sys', 'user', { type: 'object' });
    expect(out).toContain('"answers"');
    expect(bodies).toHaveLength(2);
    expect((bodies[1] as { messages: { content: string }[] }).messages[0].content).toContain('JSON schema');
  });

  it('retries the next model when one returns empty text, and reports model + finish reason', async () => {
    const three = Response.json({ data: ['a/one:free', 'b/two:free', 'c/three:free'].map((id) => ({ id, context_length: 32000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format'] })) });
    const seen: string[][] = [];
    resetModelCache();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return three.clone();
      const body = JSON.parse(init!.body as string);
      seen.push(body.models);
      return seen.length === 1
        ? Response.json({ model: body.models[0], choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'thinking…' } }] })
        : Response.json({ model: body.models[0], choices: [{ message: { content: [{ type: 'text', text: '{"answers":[0]}' }] } }] });
    }));
    const out = await openRouterEngine({ key: 'k', at: 0 }, false).ask('sys', 'user', { type: 'object' });
    expect(out).toBe('{"answers":[0]}');
    expect(seen[1]).not.toContain(seen[0][0]);

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return three.clone();
      const body = JSON.parse(init!.body as string);
      return Response.json({ model: body.models[0], choices: [{ finish_reason: 'length', message: { content: null } }] });
    }));
    await expect(openRouterEngine({ key: 'k', at: 0 }, false).ask('sys', 'user', {})).rejects.toThrow(/empty answer \(.+, length\)/);
    resetModelCache();
  });

  it('uses JSON that a provider put into the reasoning field', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/models') ? models.clone() : Response.json({ choices: [{ message: { content: '', reasoning: 'ok {"answers":[3]}' } }] })));
    expect(await openRouterEngine({ key: 'k', at: 0 }, false).ask('s', 'u', {})).toContain('"answers"');
  });

  it('reports a data-policy refusal so the UI can explain it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/models') ? models.clone() : Response.json({ error: { message: 'No endpoints found matching your data policy' } }, { status: 404 }))));
    const onError = vi.fn();
    expect(await aiQuiz('Some passage text here.', 'en', openRouterEngine({ key: 'k', at: 0 }, false), { onError })).toEqual([]);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PolicyError);
  });
});
