/**
 * Download the OCR engine in the background once the service worker is
 * active, so image import works offline without having to use it online
 * first. Fetches go through the service worker's "ocr" CacheFirst route.
 * Mirrors tesseract.js' own core selection so only the variant this device
 * will actually load is fetched (~8 MB total).
 */
import { relaxedSimd, simd } from 'wasm-feature-detect';

export const OCR_LANGS = ['eng', 'deu'];
export const ocrBase = () => new URL('ocr/', document.baseURI).href;

async function ocrUrls(): Promise<string[]> {
  const base = ocrBase();
  const variant = (await relaxedSimd()) ? 'relaxedsimd-lstm' : (await simd()) ? 'simd-lstm' : 'lstm';
  return [
    `${base}worker.min.js`,
    `${base}tesseract-core-${variant}.wasm.js`,
    ...OCR_LANGS.map((l) => `${base}lang/${l}.traineddata.gz`),
  ];
}

type Conn = { saveData?: boolean; effectiveType?: string };

export async function prefetchOcr(): Promise<'cached' | 'skipped'> {
  const conn = (navigator as Navigator & { connection?: Conn }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return 'skipped';
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return 'skipped';
  for (const url of await ocrUrls()) {
    if (await caches.match(url)) continue;
    const res = await fetch(url); // stored by the service worker
    if (!res.ok) return 'skipped';
    await res.arrayBuffer();
  }
  return 'cached';
}

/** Run prefetchOcr once the page is controlled by the service worker and idle. */
export function scheduleOcrPrefetch(delay = 4000) {
  if (!('serviceWorker' in navigator)) return;
  const run = () =>
    setTimeout(() => {
      const go = () => prefetchOcr().catch(() => {});
      'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 10000 }) : go();
    }, delay);
  if (navigator.serviceWorker.controller) run();
  else navigator.serviceWorker.addEventListener('controllerchange', run, { once: true });
}
