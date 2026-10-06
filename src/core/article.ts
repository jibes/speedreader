/**
 * Fetch readable article text from a link.
 * 1. Direct fetch (works when the site allows CORS) → Mozilla Readability.
 * 2. Fallback: r.jina.ai reader service, which fetches server-side and returns
 *    clean Markdown. Only the URL is sent; nothing else leaves the device.
 */
import { extractText, htmlToText, markdown, type Progress } from './extract';

export const READER_SERVICE = 'https://r.jina.ai/';

export interface Article {
  title: string;
  text: string;
  url: string;
}

class FetchError extends Error {}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function isUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\/\S+$/i.test(t) && !!safeUrl(t);
}

function safeUrl(s: string): URL | null {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Shared content that is essentially "a link" (plus maybe a title) → the URL.
 * Shares that carry real text return null so the text is used as-is.
 */
export function linkFromShare(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  const rest = text.replace(m[0], ' ').trim();
  return (rest.match(/\S+/g)?.length ?? 0) < 40 && safeUrl(m[0]) ? m[0] : null;
}

async function timed(input: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } finally {
    clearTimeout(t);
  }
}

export async function readability(html: string, url: string): Promise<{ title: string; text: string }> {
  const { Readability } = await import('@mozilla/readability');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // resolve relative URLs consistently
  const base = doc.createElement('base');
  base.href = url;
  doc.head?.prepend(base);
  const fallbackTitle = doc.title;
  const parsed = new Readability(doc).parse();
  const text = parsed?.content ? htmlToText(parsed.content) : htmlToText(html);
  return { title: parsed?.title || fallbackTitle, text };
}

async function direct(url: string): Promise<{ title: string; text: string } | null> {
  let res: Response;
  try {
    res = await timed(url);
  } catch {
    return null; // CORS block or network error
  }
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download');
  if (type.includes('html')) return readability(await res.text(), url);
  if (type.startsWith('text/')) return { title: name, text: await res.text() };
  // PDFs, EPUBs, … → reuse file extraction
  const blob = await res.blob();
  return { title: name.replace(/\.[^.]+$/, ''), text: await extractText(new File([blob], name, { type })) };
}

async function viaReader(url: string): Promise<{ title: string; text: string }> {
  const res = await timed(READER_SERVICE + url, { headers: { Accept: 'application/json' } }, 30000);
  if (!res.ok) throw new FetchError(`Couldn't fetch this page (${res.status}).`);
  const json = (await res.json()) as { data?: { title?: string; content?: string } };
  const content = json.data?.content?.trim();
  if (!content) throw new FetchError('No readable text found on this page.');
  return { title: json.data?.title ?? '', text: markdown(content) };
}

export async function fetchArticle(raw: string, onProgress: Progress = () => {}): Promise<Article> {
  const u = safeUrl(raw.trim());
  if (!u) throw new Error('Not a valid web address.');
  const url = u.href;
  onProgress(`Fetching ${u.hostname}…`);
  let got = await direct(url).catch(() => null);
  if (!got || got.text.trim().split(/\s+/).length < 50) {
    onProgress(`Fetching ${u.hostname} via reader service…`);
    try {
      got = await viaReader(url);
    } catch (e) {
      if (!got) throw e instanceof FetchError ? e : new Error("Couldn't reach this page — try pasting its text instead.");
    }
  }
  return { url, title: got.title.trim() || u.hostname, text: got.text };
}
