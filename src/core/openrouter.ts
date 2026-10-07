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

/** Free families that follow JSON instructions well in many languages, best first. */
const PREFERRED = [/kimi-k2(?!.*think)/i, /llama-3\.3-70b/i, /mistral-small/i, /gemma-3-27b/i, /deepseek-(v3|chat)/i, /llama-3\.1-405b|hermes-3/i, /gemma-3-12b|glm-4\.5-air/i];
/** reasoning models spend the time budget thinking — avoid when possible */
const SLOW = /(^|[/-])r1\b|reason|think|qwq/i;

/**
 * Only explicit ":free" variants. Routers (openrouter/auto, …/router) can list a 0 price
 * yet forward to paid models — that ends in "402 insufficient credits" on free accounts.
 */
const isFree = (m: ModelInfo) => m.id.endsWith(':free') && !/^openrouter\/|\/router\b|auto/i.test(m.id);
const structured = (m: ModelInfo) => (m.supported_parameters ?? []).some((p) => p === 'response_format' || p === 'structured_outputs');
/** thinking models can spend the whole output budget on hidden reasoning and return no text */
const thinks = (m: ModelInfo) => SLOW.test(m.id) || (m.supported_parameters ?? []).some((p) => p === 'reasoning' || p === 'include_reasoning');

/** Parameter count in billions from ids like "llama-3.3-70b" or "qwen3-235b-a22b" (largest number before "b"). */
export function modelSize(id: string): number | null {
  const sizes = [...id.toLowerCase().matchAll(/(?:^|[-_/:])e?(\d+(?:\.\d+)?)b(?![a-z])/g)].map((m) => parseFloat(m[1]));
  return sizes.length ? Math.max(...sizes) : null;
}

/**
 * Up to 3 free models as a fallback chain. Quality first: known good families,
 * then size (models under ~7B ramble or break JSON), then no thinking; structured
 * output is only a tie-breaker because prompt-only JSON works too.
 */
export function pickFreeModels(list: ModelInfo[]): { ids: string[]; structured: boolean } {
  const free = list.filter((m) => isFree(m) && (m.context_length ?? 0) >= 8000);
  const rank = (m: ModelInfo) => {
    const fam = PREFERRED.findIndex((r) => r.test(m.id));
    const size = modelSize(m.id);
    return (
      (size !== null && size < 7 ? 1000 : 0) +
      (fam < 0 ? 200 : fam * 10) +
      (thinks(m) ? 50 : 0) +
      (structured(m) ? 0 : 5) -
      Math.min(size ?? 30, 120) / 20 // among equals, bigger is better
    );
  };
  const chosen = free.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return { ids: chosen.map((m) => m.id), structured: chosen.length > 0 && chosen.every(structured) };
}

let modelCache: { at: number; pick: ReturnType<typeof pickFreeModels> } | null = null;
/** for tests */
export const resetModelCache = () => {
  modelCache = null;
};

async function freeModels() {
  if (modelCache && Date.now() - modelCache.at < 6 * 3600e3) return modelCache.pick;
  const res = await fetch(`${API}/models`);
  const d = (await res.json()) as { data?: ModelInfo[] };
  modelCache = { at: Date.now(), pick: pickFreeModels(d.data ?? []) };
  return modelCache.pick;
}

export class PolicyError extends Error {}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] | null; reasoning?: string | null } }[];
  error?: { message?: string };
}

/** message.content may be a string or an array of content parts */
const textOf = (c: string | { type?: string; text?: string }[] | null | undefined) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : '';

/**
 * OpenRouter engine. `allowTraining: false` (default) routes only to providers
 * that don't store or train on prompts; if none serve the free models the call
 * fails with PolicyError and the settings explain it.
 * Tries strict JSON-schema output first; if no free endpoint supports it,
 * retries with the schema in the prompt (the pipeline validates either way).
 */
export const openRouterEngine = (auth: OpenRouterAuth, allowTraining: boolean): Engine => {
  const avoid = new Set<string>();
  const engine: Engine = {
  name: 'openrouter',
  avoidLast() {
    if (engine.lastModel) avoid.add(engine.lastModel);
  },
  async ask(system, user, schema, signal) {
    const all = await freeModels();
    // skip models that produced unusable output this session, unless that leaves nothing
    const preferred = all.ids.filter((id) => !avoid.has(id) && !avoid.has(id.replace(/:free$/, '')));
    const pick = { ...all, ids: preferred.length ? preferred : all.ids };
    if (!pick.ids.length) throw new Error('no free models');
    const call = async (models: string[], strict: boolean) => {
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
          models,
          messages: [
            { role: 'system', content: strict ? system : `${system}\n\nReply with JSON only, no prose, matching this JSON schema:\n${JSON.stringify(schema)}` },
            { role: 'user', content: user },
          ],
          ...(strict ? { response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } } } : {}),
          provider: { data_collection: allowTraining ? 'allow' : 'deny', require_parameters: strict },
          temperature: 0.3,
          // room for models that think before answering
          max_tokens: 4000,
        }),
      });
      if (res.status === 401) disconnect();
      const d = (await res.json().catch(() => ({}))) as ChatResponse;
      return { res, d, msg: d.error?.message ?? `HTTP ${res.status}` };
    };

    // a model may answer with empty text (e.g. budget spent thinking): try the next one
    const tried = new Set<string>();
    let lastEmpty = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const models = pick.ids.filter((id) => !tried.has(id) && !tried.has(id.replace(/:free$/, '')));
      if (!models.length) break;
      let { res, d, msg } = await call(models, pick.structured);
      // no endpoint can do structured output (or similar parameter mismatch) → prompt-only JSON
      if (!res.ok && pick.structured && res.status !== 401 && res.status !== 402 && res.status !== 429 && !/data policy|data_collection/i.test(msg)) {
        ({ res, d, msg } = await call(models, false));
      }
      if (!res.ok) {
        if (/data policy|data_collection/i.test(msg)) throw new PolicyError(msg);
        if (res.status === 429) throw new Error(`rate limit: ${msg}`);
      if (res.status === 402) throw new Error(`402 (${models.join(', ')}): ${msg}`);
        throw new Error(msg);
      }
      const choice = d.choices?.[0];
      const content = textOf(choice?.message?.content);
      engine.lastModel = d.model ?? models[0];
      if (content.trim()) return content;
      // some providers put the final JSON into the reasoning field
      const reasoning = choice?.message?.reasoning ?? '';
      if (/"(questions|answers)"\s*:/.test(reasoning)) return reasoning;
      avoid.add(engine.lastModel);
      const used = d.model ?? models[0];
      tried.add(used);
      tried.add(models[0]);
      lastEmpty = `${used}, ${choice?.finish_reason ?? '?'}`;
    }
    throw new Error(`empty answer (${lastEmpty})`);
  },
  };
  return engine;
};
