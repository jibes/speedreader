// Self-host the OCR engine + language data so image import works offline and without third-party CDNs.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(`${out}/lang`, { recursive: true });
const copy = (from, to) => existsSync(to) || cpSync(from, to);

copy('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  copy(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`);
}
for (const l of ['eng', 'deu']) {
  copy(`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${out}/lang/${l}.traineddata.gz`);
}
