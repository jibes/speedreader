// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArticle, isUrl, linkFromShare, READER_SERVICE } from '../src/core/article';

const para = 'The lighthouse keeper climbed the spiral stairs every evening to record passing ships and weather. ';
const page = `<html><head><title>Keeper | Site</title></head><body>
  <nav>Home About Subscribe Login</nav>
  <article><h1>The Keeper</h1><p>${para.repeat(4)}</p><p>${para.repeat(3)}</p></article>
  <footer>Copyright cookie banner</footer></body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe('share parsing', () => {
  it('detects links', () => {
    expect(isUrl('https://example.com/a?b=1')).toBe(true);
    expect(isUrl('see https://example.com')).toBe(false);
    expect(isUrl('javascript:alert(1)')).toBe(false);
  });
  it('treats title + link shares as links, real text as text', () => {
    expect(linkFromShare('Great article\n\nhttps://ex.com/post')).toBe('https://ex.com/post');
    expect(linkFromShare(para.repeat(5) + ' https://ex.com')).toBeNull();
    expect(linkFromShare('no link here')).toBeNull();
  });
});

describe('fetchArticle', () => {
  it('extracts the article from a CORS-enabled page', async () => {
    const fetch = vi.fn(async () => new Response(page, { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    const a = await fetchArticle('https://ex.com/keeper');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.text).toContain('lighthouse keeper');
    expect(a.text).not.toContain('Subscribe');
    expect(a.text).not.toContain('cookie');
    expect(a.url).toBe('https://ex.com/keeper');
  });

  it('falls back to the reader service when the site blocks CORS', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (!url.startsWith(READER_SERVICE)) throw new TypeError('Failed to fetch');
      return Response.json({ data: { title: 'The Keeper', content: `# The Keeper\n\n${para.repeat(6)}\n\n[link](https://x.y) **bold**` } });
    });
    vi.stubGlobal('fetch', fetch);
    const a = await fetchArticle('https://blocked.com/keeper');
    expect(fetch).toHaveBeenLastCalledWith(READER_SERVICE + 'https://blocked.com/keeper', expect.anything());
    expect(a.title).toBe('The Keeper');
    expect(a.text).toContain('link bold');
    expect(a.text).not.toContain('](');
  });

  it('reports a useful error when everything fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.startsWith(READER_SERVICE)) throw new TypeError('Failed to fetch');
      return new Response('nope', { status: 451 });
    }));
    await expect(fetchArticle('https://gone.com')).rejects.toThrow('451');
  });
});
