# Lumen — evidence-based speed reading trainer

Paste text, paste or share a link, or drop any file (PDF, DOCX, EPUB, ODT, RTF, HTML, Markdown, TXT, subtitles, images via OCR) and train reading speed **without losing comprehension**. Everything runs locally in the browser; nothing is uploaded.

**Links:** Lumen fetches the page directly and extracts the article with Mozilla Readability. Sites that block cross-origin requests (most) fall back to the [r.jina.ai](https://jina.ai/reader) reader service, which receives only the URL.

## How it works

Three goals (Settings → Goal):

- **Train** — after each 300-word section, three auto-generated cloze questions; a weighted up/down staircase sets the speed to hold ~75 % comprehension. Score = **effective reading rate (WPM × comprehension)** — speed alone is meaningless (Rayner et al., 2016).
  - **AI questions (Chrome built-in, on-device):** where Chrome's Prompt API (Gemini Nano) is available, each section gets 3 multiple-choice questions — main idea, inference, detail — generated in the background while you read. Each set is checked before use: 4 distinct options, quoted evidence must occur in the passage, and a fresh model session must answer each question the same way; < 2 survivors → fill-in-the-blank fallback. Toggle / one-time model download in *Aa* settings. Nothing leaves the device.
- **Read** — steady pacer at the speed you set, no checks.
- **Skim** — for gist (Duggan & Payne, 2009): first sentence of each paragraph and key terms (tf-idf) stay bold and run at your pace; the rest is dimmed and swept at ¼ time. Every 600 words: "which topic came up?" checks.

Also:
- **Speed test** — self-paced read + questions sets your natural baseline and starting pace; retest from *Progress*.
- **Eye-movement-aware timing** — per-word durations scale with length, frequency, numbers/acronyms and clause/sentence/paragraph wrap-up; normalised so the displayed WPM is exact.
- **Pacer over the full page** — continuous scroll, look-backs and preview stay possible.
- Appearance: text size, serif/sans, auto/light/sepia/dark.

Deliberately excluded (not supported by evidence): RSVP/one-word-at-a-time display, multi-word "span" chunking, subvocalisation suppression, eye exercises, "whole-page" reading. See the in-app *Science* page for references.

## Languages

UI in English, Deutsch, Français, Italiano, Español, 中文 and Русский — follows the browser/OS language, overridable in the footer. The speed test uses a translated text in the active language; Chinese text is segmented into words with `Intl.Segmenter`.

## Install as an app

Lumen is a PWA: use *Install* in the header (Chrome/Edge/Android) or *Share → Add to Home Screen* (iOS Safari). Once installed:

- works offline, including OCR: the engine (~8 MB, only the variant your device uses) downloads in the background after the first visit; skipped on Data Saver / 2G
- appears in the system share sheet — share text, or share a link and Lumen fetches the article (Android, desktop Chrome)
- *Open with → Lumen* for PDF, EPUB, DOCX, ODT, RTF, TXT, MD, HTML (desktop Chromium)

## Backup

*Progress → Backup*: **Export** saves texts, reading positions, sessions and settings as `lumen-backup-YYYY-MM-DD.json`; **Restore** (or dropping the file on the Read page) merges it back — nothing is deleted, duplicates are skipped, the further reading position wins.

## Keys

`Space` play/pause · `←/→` sentence · `↑/↓` ±10 wpm (`Shift` ±50; not in Train) · `Esc` library · `1–4` answer

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # core unit tests
npm run build    # static site in dist/
```

`scripts/copy-ocr.mjs` (run automatically before dev/build) self-hosts the Tesseract OCR engine and English/German language data in `public/ocr/`, so OCR works offline.

Deploy: static `dist/` anywhere. `.github/workflows/pages.yml` publishes to GitHub Pages on push to `main` (enable Pages → *GitHub Actions* in repo settings).
