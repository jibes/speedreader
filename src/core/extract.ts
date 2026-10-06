/** Turn any text-bearing file into plain text. Heavy parsers are lazy-loaded. */
import { t } from '../i18n';
import { OCR_LANGS, ocrBase } from './ocrPrefetch';

export type Progress = (msg: string) => void;

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

export async function extractText(file: File, onProgress: Progress = () => {}): Promise<string> {
  const e = ext(file.name);
  const type = file.type;

  if (e === 'pdf' || type === 'application/pdf') return pdf(file, onProgress);
  if (e === 'docx') return docx(file);
  if (e === 'epub') return epub(file, onProgress);
  if (e === 'odt') return odt(file);
  if (e === 'rtf') return rtf(await file.text());
  if (['html', 'htm', 'xhtml'].includes(e) || type === 'text/html') return htmlToText(await file.text());
  if (e === 'srt' || e === 'vtt') return subtitles(await file.text());
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(e))
    return ocr(file, onProgress);
  if (e === 'md' || e === 'markdown') return markdown(await file.text());
  // fall back to text if it decodes cleanly
  const text = await file.text();
  if (/\u0000/.test(text.slice(0, 2000))) throw new Error(t('err.unsupported', { ext: e }));
  return text;
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,svg,figure').forEach((n) => n.remove());
  const root = doc.querySelector('article, main') ?? doc.body;
  if (!root) return '';
  const blocks = root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,dd,dt,td,div');
  if (!blocks.length) return root.textContent ?? '';
  const out: string[] = [];
  blocks.forEach((b) => {
    // skip containers whose text is captured by a nested block
    if (b.tagName === 'DIV' && b.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div')) return;
    const t = b.textContent?.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  });
  return out.join('\n\n');
}

export function markdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`~]{1,3}([^*_`~]+)[*_`~]{1,3}/g, '$1')
    .replace(/^>\s?/gm, '');
}

function subtitles(s: string): string {
  return s
    .replace(/^WEBVTT.*$/m, '')
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .split('\n')
        .filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l))
        .join(' ')
        .replace(/<[^>]+>/g, ''),
    )
    .filter((l) => l.trim())
    .join(' ');
}

export function rtf(s: string): string {
  return s
    .replace(/\\par[d]? ?/g, '\n')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((+n + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{2,}/g, '\n\n');
}

async function pdf(file: File, onProgress: Progress): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress(t('prog.page', { i, n: doc.numPages }));
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 1) {
        // bigger vertical jump → paragraph break
        text += Math.abs(y - lastY) > (item.height || 10) * 1.8 ? '\n\n' : '\n';
      }
      text += item.str;
      if (item.hasEOL) text += '\n';
      lastY = y;
    }
    pages.push(text);
  }
  const joined = pages.join('\n\n');
  if (joined.replace(/\s/g, '').length < 20 * doc.numPages) {
    throw new Error(t('err.pdfNoText'));
  }
  return joined;
}

async function docx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return htmlToText(value);
}

async function odt(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new Error(t('err.odt'));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: string[] = [];
  doc.querySelectorAll('*').forEach((n) => {
    if (n.localName === 'p' || n.localName === 'h') {
      const t = n.textContent?.trim();
      if (t) out.push(t);
    }
  });
  return out.join('\n\n');
}

async function epub(file: File, onProgress: Progress): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error(t('err.epub'));
  const opf = new DOMParser().parseFromString(await zip.file(opfPath)!.async('string'), 'application/xml');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  opf.querySelectorAll('manifest > item, item').forEach((i) => manifest.set(i.getAttribute('id')!, i.getAttribute('href')!));
  const spine = [...opf.querySelectorAll('spine > itemref, itemref')].map((r) => manifest.get(r.getAttribute('idref')!));
  const parts: string[] = [];
  for (let k = 0; k < spine.length; k++) {
    const href = spine[k];
    if (!href) continue;
    onProgress(t('prog.chapter', { i: k + 1, n: spine.length }));
    const f = zip.file(base + decodeURIComponent(href));
    if (!f) continue;
    const chapter = htmlToText(await f.async('string'));
    if (chapter.trim()) parts.push(chapter);
  }
  return parts.join('\n\n');
}

async function ocr(file: File, onProgress: Progress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onProgress(t('prog.ocrLoad'));
  const base = ocrBase();
  const worker = await createWorker(OCR_LANGS, 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base + 'lang',
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(t('prog.ocr', { p: Math.round(m.progress * 100) }));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export function titleFrom(text: string, fallback = 'Untitled'): string {
  const first = text.trim().split(/\n/)[0]?.trim() ?? '';
  if (!first) return fallback;
  const words = first.split(/\s+/).slice(0, 8).join(' ');
  return words.length < first.length ? words + '…' : words;
}
