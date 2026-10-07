/**
 * "Sign in with OpenRouter" (OAuth 2 + PKCE, no backend): the user authorises
 * Lumen on openrouter.ai and gets back a key tied to *their* account, so usage
 * counts against their free daily allowance or credits, never ours.
 * The key lives only in this browser's localStorage and is not in backups.
 */
import type { Engine } from './ai';

const BASE = 'https://openrouter.ai';
const API = `${BASE}/api/v1`;
const KEY = 'speedreader:openrouter';
const PKCE = 'speedreader:openrouter-pkce';

export interface OpenRouterAuth {
  key: string;
  at: number;
}

export function getAuth(): OpenRouterAuth | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v?.key ? v : null;
  } catch {
    return null;
  }
}

export function disconnect() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(hash) };
}

/** Where OpenRouter sends the user back: the app's own URL, no query. */
export const callbackUrl = () => new URL('./', document.baseURI).href;

/** Start the login: remember the verifier (and what to reopen), then leave for openrouter.ai. */
export async function connect(returnTo?: string) {
  const { verifier, challenge } = await pkcePair();
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, returnTo }));
  const u = new URL('/auth', BASE);
  u.searchParams.set('callback_url', callbackUrl());
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  location.assign(u.href);
}

/**
 * On app start: if the URL carries ?code= from OpenRouter, exchange it for the
 * user's key. Returns null when there is nothing to do.
 */
export async function completeLogin(): Promise<{ ok: boolean; returnTo?: string } | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const pending = sessionStorage.getItem(PKCE);
  if (!code || !pending) return null;
  history.replaceState(null, '', location.pathname);
  sessionStorage.removeItem(PKCE);
  const { verifier, returnTo } = JSON.parse(pending) as { verifier: string; returnTo?: string };
  try {
    const res = await fetch(`${API}/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });
    const data = (await res.json()) as { key?: string };
    if (!res.ok || !data.key) return { ok: false, returnTo };
    localStorage.setItem(KEY, JSON.stringify({ key: data.key, at: Date.now() } satisfies OpenRouterAuth));
    return { ok: true, returnTo };
  } catch {
    return { ok: false, returnTo };
  }
}

/** Free daily requests left on the user's account, if OpenRouter reports it. */
export async function freeRequestsLeft(auth: OpenRouterAuth): Promise<number | null> {
  try {
    const res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${auth.key}` } });
    if (res.status === 401) {
      disconnect(); // key was revoked on openrouter.ai
      return null;
    }
    const d = (await res.json()) as { data?: { free_model_daily_requests?: { remaining?: number } } };
    return d.data?.free_model_daily_requests?.remaining ?? null;
  } catch {
    return null;
  }
}

interface ModelInfo {
  id: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
}

/** Families that write good multilingual questions, best first. */
const PREFERRED = [/deepseek-(v3|chat)/i, /qwen3/i, /llama-3\.3-70b|llama-4/i, /gemma-3-27b|gemma-4/i, /mistral-small|mistral-medium/i, /gpt-oss/i];
/** reasoning models spend the time budget thinking — avoid when possible */
const SLOW = /(^|[/-])r1\b|reason|think|qwq/i;

const isFree = (m: ModelInfo) => m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
const structured = (m: ModelInfo) => (m.supported_parameters ?? []).some((p) => p === 'response_format' || p === 'structured_outputs');

/** Up to 3 free models as a fallback chain: structured output and fast families first. */
export function pickFreeModels(list: ModelInfo[]): { ids: string[]; structured: boolean } {
  const free = list.filter((m) => isFree(m) && (m.context_length ?? 0) >= 8000);
  const rank = (m: ModelInfo) => {
    const fam = PREFERRED.findIndex((r) => r.test(m.id));
    return (structured(m) ? 0 : 100) + (SLOW.test(m.id) ? 50 : 0) + (fam < 0 ? PREFERRED.length : fam);
  };
  const chosen = free.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return { ids: chosen.map((m) => m.id), structured: chosen.length > 0 && chosen.every(structured) };
}

let modelCache: { at: number; pick: ReturnType<typeof pickFreeModels> } | null = null;

async function freeModels() {
  if (modelCache && Date.now() - modelCache.at < 6 * 3600e3) return modelCache.pick;
  const res = await fetch(`${API}/models`);
  const d = (await res.json()) as { data?: ModelInfo[] };
  modelCache = { at: Date.now(), pick: pickFreeModels(d.data ?? []) };
  return modelCache.pick;
}

export class PolicyError extends Error {}

/**
 * OpenRouter engine. `allowTraining: false` (default) routes only to providers
 * that don't store or train on prompts; if none serve the free models the call
 * fails with PolicyError and the settings explain it.
 * Tries strict JSON-schema output first; if no free endpoint supports it,
 * retries with the schema in the prompt (the pipeline validates either way).
 */
export const openRouterEngine = (auth: OpenRouterAuth, allowTraining: boolean): Engine => ({
  name: 'openrouter',
  async ask(system, user, schema, signal) {
    const pick = await freeModels();
    if (!pick.ids.length) throw new Error('no free models');
    const call = async (strict: boolean) => {
      const res = await fetch(`${API}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${auth.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': location.origin,
          'X-Title': 'Lumen',
        },
        body: JSON.stringify({
          models: pick.ids,
          messages: [
            { role: 'system', content: strict ? system : `${system}\n\nReply with JSON only, no prose, matching this JSON schema:\n${JSON.stringify(schema)}` },
            { role: 'user', content: user },
          ],
          ...(strict ? { response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } } } : {}),
          provider: { data_collection: allowTraining ? 'allow' : 'deny', require_parameters: strict },
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });
      if (res.status === 401) disconnect();
      const d = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
      return { res, d, msg: d.error?.message ?? `HTTP ${res.status}` };
    };

    let { res, d, msg } = await call(pick.structured);
    // no endpoint can do structured output (or similar parameter mismatch) → prompt-only JSON
    if (!res.ok && pick.structured && res.status !== 401 && res.status !== 402 && res.status !== 429 && !/data policy|data_collection/i.test(msg)) {
      ({ res, d, msg } = await call(false));
    }
    if (!res.ok) {
      if (/data policy|data_collection/i.test(msg)) throw new PolicyError(msg);
      if (res.status === 429) throw new Error(`rate limit: ${msg}`);
      throw new Error(msg);
    }
    const content = d.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('empty answer');
    return content;
  },
});
