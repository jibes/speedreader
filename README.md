# Lumen — evidence-based speed reading trainer

Paste text or drop any file (PDF, DOCX, EPUB, ODT, RTF, HTML, Markdown, TXT, subtitles, images via OCR) and train reading speed **without losing comprehension**. Everything runs locally in the browser; nothing is uploaded.

## How it trains

- **Effective reading rate = WPM × comprehension.** Speed alone is meaningless (Rayner et al., 2016).
- **Adaptive pacing.** After each section (150/300/600 words), three auto-generated cloze questions; a weighted up/down staircase raises or lowers WPM to hold ~75 % comprehension.
- **Speed test.** Self-paced read + questions sets your natural baseline and starting pace.
- **Eye-movement-aware timing.** Per-word durations scale with length, frequency, numbers/acronyms and clause/sentence/paragraph wrap-up; normalised so the displayed WPM is exact.
- **Two modes.** *Pacer* (highlight over the full page, regressions and preview stay possible — default) and *Focus* (RSVP at the optimal recognition point; rewinds to sentence start after a pause).
- **Phrase chunking** (1–3 words, never across sentences), gentle ramp-up after pauses.

Deliberately excluded (not supported by evidence): subvocalisation suppression, eye exercises, "whole-page" reading. See the in-app *Science* page for references.

## Keys

`Space` play/pause · `←/→` sentence · `↑/↓` ±10 wpm (`Shift` ±50) · `M` mode · `Esc` library · `1–4` answer

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # core unit tests
npm run build    # static site in dist/
```

`scripts/copy-ocr.mjs` (run automatically before dev/build) self-hosts the Tesseract OCR engine and English/German language data in `public/ocr/`, so OCR works offline.

Deploy: static `dist/` anywhere. `.github/workflows/pages.yml` publishes to GitHub Pages on push to `main` (enable Pages → *GitHub Actions* in repo settings).
