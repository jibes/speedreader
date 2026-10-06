# Lumen — evidence-based speed reading trainer

Paste text, paste or share a link, or drop any file (PDF, DOCX, EPUB, ODT, RTF, HTML, Markdown, TXT, subtitles, images via OCR) and train reading speed **without losing comprehension**. Everything runs locally in the browser; nothing is uploaded.

**Links:** Lumen fetches the page directly and extracts the article with Mozilla Readability. Sites that block cross-origin requests (most) fall back to the [r.jina.ai](https://jina.ai/reader) reader service, which receives only the URL.

## How it trains

- **Effective reading rate = WPM × comprehension.** Speed alone is meaningless (Rayner et al., 2016).
- **Adaptive pacing.** After each section (150/300/600 words), three auto-generated cloze questions; a weighted up/down staircase raises or lowers WPM to hold ~75 % comprehension.
- **Speed test.** Self-paced read + questions sets your natural baseline and starting pace.
- **Eye-movement-aware timing.** Per-word durations scale with length, frequency, numbers/acronyms and clause/sentence/paragraph wrap-up; normalised so the displayed WPM is exact.
- **Two modes.** *Pacer* (highlight over the full page, regressions and preview stay possible — default) and *Focus* (RSVP at the optimal recognition point; rewinds to sentence start after a pause).
- **Phrase chunking** (1–3 words, never across sentences), gentle ramp-up after pauses.

Deliberately excluded (not supported by evidence): subvocalisation suppression, eye exercises, "whole-page" reading. See the in-app *Science* page for references.

## Install as an app

Lumen is a PWA: use *Install* in the header (Chrome/Edge/Android) or *Share → Add to Home Screen* (iOS Safari). Once installed:

- works offline (OCR engine is cached after first use)
- appears in the system share sheet — share text, or share a link and Lumen fetches the article (Android, desktop Chrome)
- *Open with → Lumen* for PDF, EPUB, DOCX, ODT, RTF, TXT, MD, HTML (desktop Chromium)

## Backup

*Progress → Backup*: **Export** saves texts, reading positions, sessions and settings as `lumen-backup-YYYY-MM-DD.json`; **Restore** (or dropping the file on the Read page) merges it back — nothing is deleted, duplicates are skipped, the further reading position wins.

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
